from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/courses", tags=["courses"])


def _to_out(c: models.Course) -> schemas.CourseOut:
    return schemas.CourseOut(
        id=c.id,
        title=c.title,
        instructor=c.professor.user.full_name if c.professor else "فريق نبض الأكاديمي",
        lectures=sorted(c.lectures, key=lambda l: l.order_index),
    )


@router.get("", response_model=list[schemas.CourseOut])
def list_courses(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    courses = db.query(models.Course).options(joinedload(models.Course.lectures)).all()
    return [_to_out(c) for c in courses]


@router.get("/{course_id}", response_model=schemas.CourseOut)
def get_course(course_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    c = db.get(models.Course, course_id)
    if not c:
        raise HTTPException(404, "الكورس غير موجود")
    return _to_out(c)
