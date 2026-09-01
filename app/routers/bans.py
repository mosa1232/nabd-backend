from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user_allow_banned

router = APIRouter(prefix="/api/bans", tags=["bans"])


def _latest_ban(db: Session, user_id: str) -> models.BanRecord | None:
    return (
        db.query(models.BanRecord)
        .filter(models.BanRecord.user_id == user_id)
        .order_by(models.BanRecord.created_at.desc())
        .first()
    )


@router.get("/mine", response_model=schemas.BanStatusOut)
def my_ban_status(db: Session = Depends(get_db), user: models.User = Depends(get_current_user_allow_banned)):
    """Powers a banned student's "حالة الحظر" screen — the one place a
    banned account can still reach, since get_current_user_allow_banned
    skips the usual ban gate."""
    record = _latest_ban(db, user.id)
    if not record:
        return schemas.BanStatusOut(is_banned=user.is_banned)
    return schemas.BanStatusOut(
        is_banned=user.is_banned,
        reason=record.reason,
        status=record.status,
        appeal_message=record.appeal_message,
        appealed_at=record.appealed_at,
    )


@router.post("/appeal")
def appeal_ban(
    body: schemas.AppealIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user_allow_banned),
):
    if not user.is_banned:
        raise HTTPException(400, "حسابك غير محظور")

    record = db.query(models.BanRecord).filter(
        models.BanRecord.user_id == user.id,
        models.BanRecord.status == models.BanStatus.active,
    ).order_by(models.BanRecord.created_at.desc()).first()
    if not record:
        raise HTTPException(404, "لا يوجد سجل حظر نشط لهذا الحساب")
    if not body.message.strip():
        raise HTTPException(400, "الرجاء كتابة سبب الطعن")

    record.appeal_message = body.message.strip()
    record.appealed_at = datetime.utcnow()
    record.status = models.BanStatus.appealed
    db.commit()
    return {"ok": True}
