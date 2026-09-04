from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/courses", tags=["courses"])


def _to_out(c: models.Course, done_lecture_ids: set[str]) -> schemas.CourseOut:
    lectures = [
        schemas.LectureOut(
            id=l.id, title=l.title, duration_seconds=l.duration_seconds,
            video_url=l.video_url or None, done=l.id in done_lecture_ids,
        )
        for l in sorted(c.lectures, key=lambda l: l.order_index)
    ]
    return schemas.CourseOut(
        id=c.id,
        title=c.title,
        instructor=c.professor.user.full_name if c.professor else "فريق نبض الأكاديمي",
        subject_id=c.subject_id,
        lectures=lectures,
    )


def _done_lecture_ids(db: Session, user: models.User) -> set[str]:
    rows = db.query(models.LectureProgress.lecture_id).filter(models.LectureProgress.user_id == user.id).all()
    return {r[0] for r in rows}


@router.get("", response_model=list[schemas.CourseOut])
def list_courses(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    courses = db.query(models.Course).options(joinedload(models.Course.lectures)).all()
    done_ids = _done_lecture_ids(db, user)
    return [_to_out(c, done_ids) for c in courses]


@router.get("/{course_id}", response_model=schemas.CourseOut)
def get_course(course_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    c = db.get(models.Course, course_id)
    if not c:
        raise HTTPException(404, "الكورس غير موجود")
    return _to_out(c, _done_lecture_ids(db, user))


@router.get("/{course_id}/materials")
def get_course_materials(course_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Powers the course-detail screen's "الملازم"/"الكويزات" tabs with the
    real booklets/exams that share the course's subject — these used to
    always render empty since nothing tied a course to its subject's
    materials on the frontend."""
    c = db.get(models.Course, course_id)
    if not c:
        raise HTTPException(404, "الكورس غير موجود")
    if not c.subject_id:
        return {"booklets": [], "exams": []}
    booklets = (
        db.query(models.Booklet)
        .join(models.ProfessorProfile, models.ProfessorProfile.id == models.Booklet.professor_id)
        .filter(models.ProfessorProfile.subject_id == c.subject_id)
        .all()
    )
    exams = db.query(models.Exam).filter(models.Exam.subject_id == c.subject_id).all()
    return {
        "booklets": [{"id": b.id, "title": b.title, "pages": b.pages, "file_url": b.file_url or None} for b in booklets],
        "exams": [{"id": e.id, "title": e.title, "question_count": e.question_count, "duration_minutes": e.duration_minutes} for e in exams],
    }


@router.post("/lectures/{lecture_id}/complete")
def mark_lecture_complete(lecture_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Called when the real <video> element fires its `ended` event — the
    only honest signal that a student actually finished a lecture."""
    lecture = db.get(models.Lecture, lecture_id)
    if not lecture:
        raise HTTPException(404, "المحاضرة غير موجودة")
    exists = (
        db.query(models.LectureProgress)
        .filter(models.LectureProgress.user_id == user.id, models.LectureProgress.lecture_id == lecture_id)
        .first()
    )
    if not exists:
        db.add(models.LectureProgress(user_id=user.id, lecture_id=lecture_id))
        db.commit()
    return {"ok": True}
