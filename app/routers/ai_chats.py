"""The student's saved chats with the study assistant: a list of conversations,
each its own page that can be renamed, copied (duplicated) and deleted."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user
from . import ai as ai_router

router = APIRouter(prefix="/api/ai/conversations", tags=["ai"])
MAX_CONVERSATIONS = 100


class MessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=4000)
    context: str = Field(default="", max_length=3000)


class RenameIn(BaseModel):
    title: str = Field(min_length=1, max_length=80)


def _own(db: Session, user: models.User, cid: str) -> models.AIConversation:
    c = db.get(models.AIConversation, cid)
    if not c or c.user_id != user.id:
        raise HTTPException(404, "المحادثة غير موجودة")
    return c


def _msgs(db: Session, cid: str) -> list[models.AIChatMessage]:
    return db.query(models.AIChatMessage).filter(models.AIChatMessage.conversation_id == cid).order_by(models.AIChatMessage.created_at.asc()).all()


def _msg(m: models.AIChatMessage) -> dict:
    return {"id": m.id, "role": m.role, "content": m.content, "mode": m.mode or "", "created_at": m.created_at}


@router.get("")
def list_conversations(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    rows = db.query(models.AIConversation).filter(models.AIConversation.user_id == user.id).order_by(models.AIConversation.updated_at.desc()).limit(MAX_CONVERSATIONS).all()
    out = []
    for c in rows:
        ms = _msgs(db, c.id)
        out.append({"id": c.id, "title": c.title or "محادثة جديدة", "updated_at": c.updated_at, "count": len(ms),
                    "preview": (ms[-1].content[:90] if ms else "")})
    return out


@router.post("")
def create_conversation(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    if db.query(models.AIConversation).filter(models.AIConversation.user_id == user.id).count() >= MAX_CONVERSATIONS:
        raise HTTPException(400, "وصلت للحد الأقصى من المحادثات — احذف بعضها لتبدأ محادثة جديدة")
    c = models.AIConversation(user_id=user.id, title="")
    db.add(c); db.commit(); db.refresh(c)
    return {"id": c.id, "title": "محادثة جديدة", "messages": []}


@router.get("/{cid}")
def get_conversation(cid: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    c = _own(db, user, cid)
    return {"id": c.id, "title": c.title or "محادثة جديدة", "messages": [_msg(m) for m in _msgs(db, c.id)]}


@router.post("/{cid}/messages")
def send(cid: str, body: MessageIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    c = _own(db, user, cid)
    text = body.content.strip()
    history = [{"role": m.role, "content": m.content} for m in _msgs(db, c.id)][-18:]
    history.append({"role": "user", "content": text})
    # Reuse the exact rules of the floating assistant (exam lock, rate limit, bank fallback).
    out = ai_router.chat(schemas.ChatIn(messages=[schemas.ChatMessage(**m) for m in history], context=body.context), db, user)
    u = models.AIChatMessage(conversation_id=c.id, role="user", content=text)
    db.add(u); db.flush()
    a = models.AIChatMessage(conversation_id=c.id, role="assistant", content=out.reply, mode=out.mode)
    db.add(a)
    if not c.title:
        c.title = text[:48]
    c.updated_at = datetime.utcnow()
    db.commit(); db.refresh(u); db.refresh(a)
    return {"title": c.title, "user": _msg(u), "assistant": _msg(a), "sources": out.sources}


@router.put("/{cid}")
def rename(cid: str, body: RenameIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    c = _own(db, user, cid)
    c.title = body.title.strip()[:80]
    db.commit()
    return {"id": c.id, "title": c.title}


@router.post("/{cid}/duplicate")
def duplicate(cid: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    c = _own(db, user, cid)
    if db.query(models.AIConversation).filter(models.AIConversation.user_id == user.id).count() >= MAX_CONVERSATIONS:
        raise HTTPException(400, "وصلت للحد الأقصى من المحادثات — احذف بعضها أولاً")
    n = models.AIConversation(user_id=user.id, title=((c.title or "محادثة") + " (نسخة)")[:80])
    db.add(n); db.flush()
    for m in _msgs(db, c.id):
        db.add(models.AIChatMessage(conversation_id=n.id, role=m.role, content=m.content, mode=m.mode))
    db.commit()
    return {"id": n.id, "title": n.title}


@router.delete("/{cid}")
def delete(cid: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    c = _own(db, user, cid)
    db.query(models.AIChatMessage).filter(models.AIChatMessage.conversation_id == c.id).delete()
    db.delete(c); db.commit()
    return {"ok": True}
