from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api", tags=["questions"])


@router.get("/subjects/{subject_id}/questions", response_model=list[schemas.QuestionOut])
def list_questions(
    subject_id: str,
    limit: int = 20,
    offset: int = 0,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    questions = (
        db.query(models.Question)
        .options(joinedload(models.Question.choices))
        .filter(models.Question.subject_id == subject_id)
        .offset(offset)
        .limit(limit)
        .all()
    )
    return questions


@router.post("/questions/{question_id}/answer", response_model=schemas.AnswerResult)
def answer_question(
    question_id: str,
    body: schemas.AnswerIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    question = db.get(models.Question, question_id)
    if not question:
        raise HTTPException(404, "السؤال غير موجود")

    choice = db.get(models.Choice, body.choice_id)
    if not choice or choice.question_id != question_id:
        raise HTTPException(400, "خيار غير صالح")

    correct_choice = next((c for c in question.choices if c.is_correct), None)

    # Auto-save: one row per attempt, used later for spaced repetition and
    # the admin heatmap / weak-topics analytics.
    db.add(models.StudentAnswer(
        user_id=user.id,
        question_id=question_id,
        choice_id=choice.id,
        is_correct=choice.is_correct,
    ))
    db.commit()

    return schemas.AnswerResult(
        is_correct=choice.is_correct,
        correct_choice_id=correct_choice.id if correct_choice else "",
        rationale=question.rationale,
    )


@router.post("/questions/{question_id}/save")
def save_question(question_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Powers the bookmark button on a question — the "المحفوظة" review tab."""
    if not db.get(models.Question, question_id):
        raise HTTPException(404, "السؤال غير موجود")
    existing = (
        db.query(models.SavedQuestion)
        .filter(models.SavedQuestion.user_id == user.id, models.SavedQuestion.question_id == question_id)
        .first()
    )
    if not existing:
        db.add(models.SavedQuestion(user_id=user.id, question_id=question_id))
        db.commit()
    return {"ok": True, "saved": True}


@router.delete("/questions/{question_id}/save")
def unsave_question(question_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    db.query(models.SavedQuestion).filter(
        models.SavedQuestion.user_id == user.id, models.SavedQuestion.question_id == question_id
    ).delete()
    db.commit()
    return {"ok": True, "saved": False}


@router.get("/me/saved-questions", response_model=list[schemas.QuestionOut])
def list_saved_questions(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    saved = (
        db.query(models.SavedQuestion)
        .filter(models.SavedQuestion.user_id == user.id)
        .order_by(models.SavedQuestion.created_at.desc())
        .all()
    )
    order = {s.question_id: i for i, s in enumerate(saved)}
    if not order:
        return []
    questions = (
        db.query(models.Question)
        .options(joinedload(models.Question.choices))
        .filter(models.Question.id.in_(order.keys()))
        .all()
    )
    questions.sort(key=lambda q: order[q.id])
    return questions


@router.get("/me/mistakes")
def list_mistakes(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """The most recent wrong answer per question — the "أخطائي" review tab.
    Unlike the live quiz, this reveals the correct answer and rationale
    since the student already committed to (and got graded on) their pick."""
    wrong = (
        db.query(models.StudentAnswer)
        .filter(models.StudentAnswer.user_id == user.id, models.StudentAnswer.is_correct.is_(False))
        .order_by(models.StudentAnswer.answered_at.desc())
        .all()
    )
    seen: set[str] = set()
    out = []
    for a in wrong:
        if a.question_id in seen:
            continue
        seen.add(a.question_id)
        q = db.get(models.Question, a.question_id)
        if not q:
            continue
        correct = next((c for c in q.choices if c.is_correct), None)
        your_choice = db.get(models.Choice, a.choice_id)
        out.append({
            "question_id": q.id,
            "eyebrow": q.eyebrow,
            "text": q.text,
            "rationale": q.rationale,
            "your_choice": your_choice.text if your_choice else None,
            "correct_choice": correct.text if correct else None,
            "answered_at": a.answered_at,
        })
    return out
