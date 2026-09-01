from sqlalchemy import or_

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/me/notifications", tags=["notifications"])


def _visible_query(db: Session, user: models.User):
    return db.query(models.Notification).filter(
        or_(models.Notification.user_id == user.id, models.Notification.user_id.is_(None))
    )


@router.get("")
def list_notifications(limit: int = 30, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    notifs = _visible_query(db, user).order_by(models.Notification.created_at.desc()).limit(limit).all()
    read_ids = {
        r.notification_id
        for r in db.query(models.NotificationRead).filter(models.NotificationRead.user_id == user.id).all()
    }
    return [
        {"id": n.id, "title": n.title, "body": n.body, "created_at": n.created_at, "read": n.id in read_ids}
        for n in notifs
    ]


@router.get("/unread-count")
def unread_count(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    all_ids = {n.id for n in _visible_query(db, user).with_entities(models.Notification.id).all()}
    read_ids = {
        r.notification_id
        for r in db.query(models.NotificationRead.notification_id)
        .filter(models.NotificationRead.user_id == user.id)
        .all()
    }
    return {"count": len(all_ids - read_ids)}


@router.post("/{notification_id}/read")
def mark_read(notification_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    exists = (
        db.query(models.NotificationRead)
        .filter(models.NotificationRead.notification_id == notification_id, models.NotificationRead.user_id == user.id)
        .first()
    )
    if not exists:
        db.add(models.NotificationRead(notification_id=notification_id, user_id=user.id))
        db.commit()
    return {"ok": True}
