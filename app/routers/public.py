"""Numbers a signed-out visitor is allowed to see.

The landing page used to show illustrative figures — a blurred "17 day
streak" and "89%" labelled as an example. It now shows what the platform
actually holds instead, which is only honest if the figures come from here
rather than from the page.

Counts only: nothing that identifies a student, a professor or a piece of
paid content.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db

router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/stats")
def public_stats(db: Session = Depends(get_db)):
    professors = (
        db.query(models.ProfessorProfile)
        .join(models.User, models.User.id == models.ProfessorProfile.user_id)
        .filter(models.User.is_banned.is_(False))
        .count()
    )
    return {
        "questions": db.query(models.Question).count(),
        "professors": professors,
        "lectures": db.query(models.Lecture).count(),
        "pearls": db.query(models.ClinicalPearl).count(),
    }
