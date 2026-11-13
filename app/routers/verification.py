"""Student-side verification (التوثيق): redeem a code from a roster.

A verified account is tied to the university / college / stage of the roster
it came from — the student never has to pick them — and to the name the
representative listed."""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import codes as codelib
from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/verify", tags=["verification"])

MAX_FAILED = 5
LOCK_MINUTES = 15


def _student(user: models.User = Depends(get_current_user)) -> models.User:
    if user.role != models.Role.student:
        raise HTTPException(403, "التوثيق للطلاب فقط")
    return user


def _labels(db: Session, user: models.User) -> dict:
    uni = db.get(models.University, user.university_id) if user.university_id else None
    section = db.get(models.Section, user.section_id) if user.section_id else None
    stage = db.get(models.Stage, user.stage_id) if user.stage_id else None
    return {"university": uni.name if uni else None, "college": section.name if section else None,
            "stage": stage.name if stage else None}


@router.get("/status")
def status(db: Session = Depends(get_db), user: models.User = Depends(_student)):
    return {"verified": user.verified_at is not None, "verified_name": user.verified_name,
            "verified_at": user.verified_at, **_labels(db, user)}


@router.post("/redeem")
def redeem(body: schemas.VerifyRedeemIn, db: Session = Depends(get_db), user: models.User = Depends(_student)):
    if user.verified_at:
        raise HTTPException(400, "حسابك موثّق مسبقًا")
    now = datetime.utcnow()
    if user.verify_locked_until and user.verify_locked_until > now:
        minutes = int((user.verify_locked_until - now).total_seconds() // 60) + 1
        raise HTTPException(429, f"محاولات كثيرة خاطئة — حاول بعد {minutes} دقيقة")

    def fail():
        # One message for "no such code", "already used" and "revoked": telling
        # them apart would let someone map which codes exist.
        user.verify_failed_attempts = (user.verify_failed_attempts or 0) + 1
        if user.verify_failed_attempts >= MAX_FAILED:
            user.verify_locked_until = now + timedelta(minutes=LOCK_MINUTES)
            user.verify_failed_attempts = 0
        db.commit()
        raise HTTPException(400, "الكود غير صالح أو سبق استعماله — تأكد منه أو اطلب كودك من ممثل دفعتك")

    code = db.query(models.VerificationCode).filter(
        models.VerificationCode.code == codelib.normalize_code(body.code)).first()
    if not code or code.revoked or code.used_by_user_id:
        fail()

    # Claim the code atomically: if two students submit it at the same moment,
    # exactly one UPDATE matches.
    claimed = db.query(models.VerificationCode).filter(
        models.VerificationCode.id == code.id,
        models.VerificationCode.used_by_user_id.is_(None),
        models.VerificationCode.revoked.is_(False),
    ).update({"used_by_user_id": user.id, "used_at": now}, synchronize_session=False)
    if claimed != 1:
        db.rollback()
        fail()

    batch = code.batch
    uni = db.get(models.University, batch.university_id)
    user.university_id = uni.id
    user.section_id = uni.section_id
    if batch.stage_id:
        user.stage_id = batch.stage_id
    elif user.stage_id:
        stage = db.get(models.Stage, user.stage_id)
        if not stage or stage.university_id != uni.id:
            user.stage_id = None     # the old stage belongs to another university
    user.is_graduate = False
    user.verified_at = now
    user.verified_name = code.student_name
    user.verify_failed_attempts = 0
    user.verify_locked_until = None
    db.add(models.ActivityLog(user_id=user.id, action="توثيق حساب بكود", ip_address=""))
    db.commit()
    db.refresh(user)
    return {"ok": True, "verified_name": user.verified_name, **_labels(db, user)}
