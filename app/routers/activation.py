from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/activation", tags=["activation"])

CODE_VALIDITY_DAYS = 365  # matches the store's "سنة كاملة" VIP product
MAX_FAILED_REDEEMS = 5
REDEEM_LOCKOUT_MINUTES = 15


def _check_not_redeem_locked(user: models.User):
    if user.redeem_locked_until and user.redeem_locked_until > datetime.utcnow():
        minutes_left = max(1, int((user.redeem_locked_until - datetime.utcnow()).total_seconds() // 60) + 1)
        raise HTTPException(429, f"محاولات كثيرة فاشلة لتفعيل كود — حاول بعد {minutes_left} دقيقة")


def _register_failed_redeem(db: Session, user: models.User):
    user.failed_redeem_attempts = (user.failed_redeem_attempts or 0) + 1
    if user.failed_redeem_attempts >= MAX_FAILED_REDEEMS:
        user.redeem_locked_until = datetime.utcnow() + timedelta(minutes=REDEEM_LOCKOUT_MINUTES)
        user.failed_redeem_attempts = 0
    db.commit()


def _to_out(c: models.ActivationCode) -> schemas.ActivationOut:
    return schemas.ActivationOut(
        id=c.id,
        code_masked=c.code[:4] + "••••",
        subject_name=c.subject.name if c.subject_id else "VIP — جميع المواد",
        activated_at=c.activated_at,
        expires_at=c.expires_at,
    )


@router.post("/redeem", response_model=schemas.ActivationOut)
def redeem_code(
    body: schemas.RedeemCodeIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    _check_not_redeem_locked(user)

    code = db.query(models.ActivationCode).filter(
        models.ActivationCode.code == body.code.strip().upper()
    ).first()
    if not code:
        _register_failed_redeem(db, user)
        raise HTTPException(404, "الكود غير موجود — تأكد من كتابته بشكل صحيح")

    if code.status == models.CodeStatus.expired:
        raise HTTPException(400, "هذا الكود منتهي الصلاحية")

    if code.status == models.CodeStatus.active:
        if code.activated_by_user_id == user.id:
            raise HTTPException(400, "هذا الكود مُفعّل مسبقاً على حسابك")
        _register_failed_redeem(db, user)
        raise HTTPException(400, "هذا الكود مُفعّل مسبقاً من مستخدم آخر")

    if user.failed_redeem_attempts or user.redeem_locked_until:
        user.failed_redeem_attempts = 0
        user.redeem_locked_until = None

    code.status = models.CodeStatus.active
    code.activated_by_user_id = user.id
    code.activated_at = datetime.utcnow()
    code.expires_at = datetime.utcnow() + timedelta(days=CODE_VALIDITY_DAYS)
    db.commit()
    db.refresh(code)
    return _to_out(code)


@router.get("/mine", response_model=list[schemas.ActivationOut])
def my_activations(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    codes = (
        db.query(models.ActivationCode)
        .filter(models.ActivationCode.activated_by_user_id == user.id)
        .order_by(models.ActivationCode.activated_at.desc())
        .all()
    )
    return [_to_out(c) for c in codes]
