"""The assistant every signed-in role can talk to. Content generation for
doctors lives next to the rest of their tools in routers/professors.py."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import ai, knowledge, models, schemas
from ..config import get_settings
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/ai", tags=["ai"])
settings = get_settings()


def ai_http_error(e: Exception) -> HTTPException:
    """Maps AI failures to clean HTTP errors (never leaking internals)."""
    if isinstance(e, ai.AIUnavailable):
        return HTTPException(503, str(e))
    if isinstance(e, ai.RateLimited):
        return HTTPException(429, str(e))
    return HTTPException(502, str(e))


@router.get("/status")
def status(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """`enabled` = the full writing assistant (needs the Claude key).
    `search` = the question-bank search model, which needs nothing and is
    always on; `knowledge` says how much it has learned."""
    return {"enabled": ai.enabled(), "search": True, "knowledge": knowledge.get_index(db).stats()}


def _sources(hits: list[dict]) -> list[dict]:
    return [{"question_id": h["question_id"], "text": h["text"][:140], "subject": h["subject"]} for h in hits]


@router.post("/chat", response_model=schemas.ChatOut)
def chat(body: schemas.ChatIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    messages = [m.model_dump() for m in body.messages]
    query = (body.context + "\n" if body.context else "") + ai.last_user_text(messages)

    def from_the_bank(prefix: str = "") -> schemas.ChatOut:
        hits = knowledge.retrieve(db, user, query)
        return schemas.ChatOut(reply=prefix + knowledge.offline_answer(hits), mode="search", sources=_sources(hits))

    # Fair play: while a student is inside an unfinished exam the assistant is
    # off entirely (otherwise the question could simply be pasted into it).
    if knowledge.exam_locked(db, user):
        raise HTTPException(403, "المساعد الذكي متوقف أثناء الامتحان — يعود بعد إنهائه")

    # Students, doctors and assistants can always be answered from the bank.
    # Everyone else needs the writing assistant, which needs the key.
    has_bank = knowledge.has_bank(user)
    if not ai.enabled():
        if has_bank:
            return from_the_bank()   # no per-call cost, so no rate limit either
        raise ai_http_error(ai.AIUnavailable("المساعد الذكي غير مفعّل على هذا الخادم — يلزم ضبط ANTHROPIC_API_KEY"))
    try:
        ai.check_rate(user.id, "chat", settings.ai_rate_limit_per_hour)
        reply, hits = ai.chat(db, user, messages, body.context)
    except ai.RateLimited as e:
        raise ai_http_error(e)
    except (ai.AIUnavailable, ai.AIError) as e:
        if has_bank:     # the API is down or refused: still be useful
            return from_the_bank("تعذّر الوصول إلى المساعد الكتابي الآن، فبحثت لك في بنك الأسئلة.\n\n")
        raise ai_http_error(e)
    return schemas.ChatOut(reply=reply, mode="ai", sources=_sources(hits))
