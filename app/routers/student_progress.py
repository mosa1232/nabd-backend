"""A student's own study progress, per subject of their current stage — drives
the progress bars on the question-bank screen."""
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/me", tags=["student"])


@router.get("/progress")
def my_progress(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    subjects = db.query(models.Subject).filter(models.Subject.stage_id == user.stage_id).all() if user.stage_id else []
    ids = [s.id for s in subjects]
    totals = dict(db.query(models.Question.subject_id, func.count(models.Question.id)).filter(models.Question.subject_id.in_(ids)).group_by(models.Question.subject_id).all()) if ids else {}
    SA, Q = models.StudentAnswer, models.Question
    rows = (db.query(SA.question_id, Q.subject_id, SA.is_correct, SA.answered_at)
            .join(Q, Q.id == SA.question_id).filter(SA.user_id == user.id, Q.subject_id.in_(ids)).order_by(SA.answered_at.asc()).all()) if ids else []
    per = {sid: {"answers": 0, "correct": 0, "latest": {}} for sid in ids}
    for qid, sid, ok, _ in rows:
        d = per[sid]
        d["answers"] += 1
        d["correct"] += 1 if ok else 0
        d["latest"][qid] = bool(ok)           # the most recent answer wins
    out = []
    for s in subjects:
        d = per[s.id]
        latest = d["latest"]
        out.append({
            "subject_id": s.id, "name": s.name, "total": int(totals.get(s.id, 0)),
            "answered": len(latest),                                   # distinct questions tried
            "mastered": sum(1 for v in latest.values() if v),          # last answer correct
            "to_review": sum(1 for v in latest.values() if not v),     # last answer wrong
            "accuracy": round(100 * d["correct"] / d["answers"]) if d["answers"] else None,
        })
    return out
