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
