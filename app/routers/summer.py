"""Summer training opportunities, scoped to the student's own college.
Authoring lives in routers/admin.py."""
from fastapi import APIRouter, Depends
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/summer-trainings", tags=["summer-training"])


@router.get("", response_model=list[schemas.SummerTrainingOut])
def list_summer(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    q = db.query(models.SummerTraining).filter(models.SummerTraining.is_active.is_(True))
    if user.role == models.Role.student:
        if user.section_id:
            q = q.filter(or_(
                models.SummerTraining.section_id == user.section_id,
                models.SummerTraining.section_id.is_(None),
            ))
        else:
            q = q.filter(models.SummerTraining.section_id.is_(None))
    return q.order_by(models.SummerTraining.created_at.desc()).all()
