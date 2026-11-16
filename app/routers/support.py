"""Student <-> staff support chat ("المساعدة").

A student has at most one *open* conversation; writing after it is closed
starts a new one. Staff see every conversation in the dashboard, reply, and
close or reopen it. Counters (`staff_unread` / `student_unread`) drive the
unread badges on both sides, which poll every few seconds while a chat is open.
"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..deps import admin_gate, get_current_user_allow_banned

student_router = APIRouter(prefix="/api/support", tags=["support"])
admin_router = APIRouter(prefix="/api/admin/support", tags=["support"], dependencies=[Depends(admin_gate)])

MAX_BODY = 2000
RATE_WINDOW = timedelta(minutes=10)
RATE_LIMIT = 20


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=MAX_BODY)


class StatusIn(BaseModel):
    status: str


def _msg(m: models.SupportMessage) -> dict:
    return {"id": m.id, "from_staff": bool(m.from_staff), "body": m.body, "at": m.created_at}


def _clean(body: str) -> str:
    text = (body or "").strip()
    if not text:
        raise HTTPException(400, "اكتب رسالتك أولًا")
    return text[:MAX_BODY]


# ------------------------------------------------------------------ student
@student_router.get("/thread")
def my_thread(db: Session = Depends(get_db), user: models.User = Depends(get_current_user_allow_banned)):
    """The open conversation, or the most recent closed one (read-only)."""
    T = models.SupportThread
    thread = (db.query(T).filter(T.user_id == user.id, T.status == "open").order_by(T.updated_at.desc()).first()
              or db.query(T).filter(T.user_id == user.id).order_by(T.updated_at.desc()).first())
    if not thread:
        return {"thread": None, "messages": []}
    thread.student_unread = 0
    db.commit()
    msgs = db.query(models.SupportMessage).filter(models.SupportMessage.thread_id == thread.id).order_by(models.SupportMessage.created_at.asc()).limit(300).all()
    return {"thread": {"id": thread.id, "status": thread.status}, "messages": [_msg(m) for m in msgs]}


@student_router.post("/messages")
def send_message(body: MessageIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_user_allow_banned)):
    text = _clean(body.body)
    M, T = models.SupportMessage, models.SupportThread
    recent = db.query(func.count(M.id)).filter(M.sender_id == user.id, M.from_staff.is_(False), M.created_at >= datetime.utcnow() - RATE_WINDOW).scalar() or 0
    if recent >= RATE_LIMIT:
        raise HTTPException(429, "أرسلت رسائل كثيرة — انتظر قليلًا")
    thread = db.query(T).filter(T.user_id == user.id, T.status == "open").order_by(T.updated_at.desc()).first()
    if not thread:
        thread = T(user_id=user.id, status="open", staff_unread=0, student_unread=0)
        db.add(thread)
        db.flush()
    db.add(M(thread_id=thread.id, sender_id=user.id, from_staff=False, body=text))
    thread.staff_unread = (thread.staff_unread or 0) + 1
    thread.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "thread_id": thread.id}


@student_router.get("/unread")
def my_unread(db: Session = Depends(get_db), user: models.User = Depends(get_current_user_allow_banned)):
    n = db.query(func.coalesce(func.sum(models.SupportThread.student_unread), 0)).filter(models.SupportThread.user_id == user.id).scalar() or 0
    return {"count": int(n)}


# -------------------------------------------------------------------- staff
@admin_router.get("/unread")
def staff_unread(db: Session = Depends(get_db)):
    T = models.SupportThread
    n = db.query(func.count(T.id)).filter(T.status == "open", T.staff_unread > 0).scalar() or 0
    return {"threads": int(n)}


@admin_router.get("/threads")
def list_threads(status: str = "open", q: str = "", db: Session = Depends(get_db)):
    T, U = models.SupportThread, models.User
    query = db.query(T, U).join(U, U.id == T.user_id)
    if status in ("open", "closed"):
        query = query.filter(T.status == status)
    term = (q or "").strip()
    if term:
        like = f"%{term}%"
        query = query.filter((U.full_name.ilike(like)) | (U.email.ilike(like)) | (U.phone.ilike(like)))
    rows = query.order_by((T.staff_unread > 0).desc(), T.updated_at.desc()).limit(200).all()
    out = []
    for t, u in rows:
        last = db.query(models.SupportMessage).filter(models.SupportMessage.thread_id == t.id).order_by(models.SupportMessage.created_at.desc()).first()
        out.append({
            "id": t.id, "status": t.status, "unread": t.staff_unread or 0, "updated_at": t.updated_at,
            "student": {"id": u.id, "name": u.full_name, "email": u.email},
            "last": (last.body[:100] if last else ""), "last_from_staff": bool(last.from_staff) if last else False,
        })
    return out


def _thread_or_404(db: Session, thread_id: str) -> models.SupportThread:
    t = db.get(models.SupportThread, thread_id)
    if not t:
        raise HTTPException(404, "المحادثة غير موجودة")
    return t


@admin_router.get("/threads/{thread_id}")
def get_thread(thread_id: str, db: Session = Depends(get_db)):
    t = _thread_or_404(db, thread_id)
    u = db.get(models.User, t.user_id)
    t.staff_unread = 0
    db.commit()
    msgs = db.query(models.SupportMessage).filter(models.SupportMessage.thread_id == t.id).order_by(models.SupportMessage.created_at.asc()).limit(500).all()
    uni = db.get(models.University, u.university_id) if u.university_id else None
    stage = db.get(models.Stage, u.stage_id) if u.stage_id else None
    return {
        "id": t.id, "status": t.status,
        "student": {"id": u.id, "name": u.full_name, "email": u.email, "phone": u.phone, "role": u.role.value,
                    "university": uni.name if uni else None, "stage": stage.name if stage else None, "banned": bool(u.is_banned)},
        "messages": [_msg(m) | {"mine": False} for m in msgs],
    }


@admin_router.post("/threads/{thread_id}/messages")
def staff_reply(thread_id: str, body: MessageIn, db: Session = Depends(get_db), actor: models.User = Depends(get_current_user_allow_banned)):
    t = _thread_or_404(db, thread_id)
    text = _clean(body.body)
    db.add(models.SupportMessage(thread_id=t.id, sender_id=actor.id, from_staff=True, body=text))
    t.student_unread = (t.student_unread or 0) + 1
    t.status = "open"
    t.updated_at = datetime.utcnow()
    db.add(models.Notification(user_id=t.user_id, title="ردّ جديد من المساعدة", body=text[:120], created_by=actor.id))
    db.commit()
    return {"ok": True}


@admin_router.post("/threads/{thread_id}/status")
def set_status(thread_id: str, body: StatusIn, db: Session = Depends(get_db)):
    if body.status not in ("open", "closed"):
        raise HTTPException(400, "حالة غير صالحة")
    t = _thread_or_404(db, thread_id)
    t.status = body.status
    t.closed_at = datetime.utcnow() if body.status == "closed" else None
    if body.status == "closed":
        t.staff_unread = 0
    db.commit()
    return {"ok": True, "status": t.status}
