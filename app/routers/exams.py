import random
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/exams", tags=["exams"])


def _own_attempt(db: Session, attempt_id: str, user: models.User) -> models.ExamAttempt:
    attempt = db.get(models.ExamAttempt, attempt_id)
    if not attempt or attempt.user_id != user.id:
        raise HTTPException(404, "المحاولة غير موجودة")
    return attempt


def _items_out(db: Session, attempt: models.ExamAttempt, reveal: bool) -> list[dict]:
    items = (
        db.query(models.ExamAttemptQuestion)
        .options(joinedload(models.ExamAttemptQuestion.question).joinedload(models.Question.choices))
        .filter(models.ExamAttemptQuestion.attempt_id == attempt.id)
        .order_by(models.ExamAttemptQuestion.order_index)
        .all()
    )
    out = []
    for it in items:
        q = it.question
        correct = next((c for c in q.choices if c.is_correct), None)
        row = {
            "item_id": it.id,
            "question_id": q.id,
            "eyebrow": q.eyebrow,
            "text": q.text,
            "image_url": q.image_url,
            "choices": [{"id": c.id, "text": c.text} for c in q.choices],
            "your_choice_id": it.choice_id,
            "answered": it.choice_id is not None,
        }
        if reveal:
            row["is_correct"] = it.is_correct
            row["correct_choice_id"] = correct.id if correct else None
            row["rationale"] = q.rationale
        out.append(row)
    return out


@router.post("/{exam_id}/start")
def start_exam(exam_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Starts (or resumes) the caller's attempt at this exam. Each exam has a
    fixed question_count set by its professor; that many questions are
    picked at random from the exam's subject and locked into this attempt
    so the paper doesn't change under the student mid-exam."""
    exam = db.get(models.Exam, exam_id)
    if not exam:
        raise HTTPException(404, "الامتحان غير موجود")

    existing = (
        db.query(models.ExamAttempt)
        .filter(
            models.ExamAttempt.exam_id == exam_id,
            models.ExamAttempt.user_id == user.id,
            models.ExamAttempt.finished_at.is_(None),
        )
        .first()
    )
    if existing:
        attempt = existing
    else:
        pool = db.query(models.Question).filter(models.Question.subject_id == exam.subject_id).all()
        if not pool:
            raise HTTPException(400, "لا توجد أسئلة متاحة لهذا الامتحان بعد")
        random.shuffle(pool)
        count = exam.question_count or len(pool)
        chosen = pool[:count]
        attempt = models.ExamAttempt(exam_id=exam_id, user_id=user.id, total=len(chosen))
        db.add(attempt)
        db.flush()
        for idx, q in enumerate(chosen):
            db.add(models.ExamAttemptQuestion(attempt_id=attempt.id, question_id=q.id, order_index=idx))
        db.commit()
        db.refresh(attempt)

    return {
        "attempt_id": attempt.id,
        "exam_title": exam.title,
        "duration_minutes": exam.duration_minutes,
        "total": attempt.total,
        "started_at": attempt.started_at,
        "finished_at": attempt.finished_at,
        "questions": _items_out(db, attempt, reveal=False),
    }


@router.post("/attempts/{attempt_id}/items/{item_id}/answer")
def answer_attempt_item(
    attempt_id: str,
    item_id: str,
    body: schemas.ExamAttemptAnswerIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    attempt = _own_attempt(db, attempt_id, user)
    if attempt.finished_at:
        raise HTTPException(400, "هذا الامتحان انتهى بالفعل")
    item = db.get(models.ExamAttemptQuestion, item_id)
    if not item or item.attempt_id != attempt_id:
        raise HTTPException(404, "السؤال غير موجود بهذه المحاولة")
    choice = db.get(models.Choice, body.choice_id)
    if not choice or choice.question_id != item.question_id:
        raise HTTPException(400, "خيار غير صالح")
    item.choice_id = choice.id
    item.is_correct = choice.is_correct
    item.answered_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.post("/attempts/{attempt_id}/finish")
def finish_attempt(attempt_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    attempt = _own_attempt(db, attempt_id, user)
    if not attempt.finished_at:
        items = db.query(models.ExamAttemptQuestion).filter(models.ExamAttemptQuestion.attempt_id == attempt_id).all()
        attempt.score = sum(1 for it in items if it.is_correct)
        attempt.finished_at = datetime.utcnow()
        db.commit()
        db.refresh(attempt)
    return {"attempt_id": attempt.id, "score": attempt.score, "total": attempt.total, "finished_at": attempt.finished_at}


@router.get("/attempts/{attempt_id}/result")
def attempt_result(attempt_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    attempt = _own_attempt(db, attempt_id, user)
    return {
        "attempt_id": attempt.id,
        "score": attempt.score,
        "total": attempt.total,
        "finished_at": attempt.finished_at,
        "items": _items_out(db, attempt, reveal=bool(attempt.finished_at)),
    }
