from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/professors", tags=["professors"])


def _to_out(p: models.ProfessorProfile, db: Session) -> schemas.ProfessorOut:
    booklets = db.query(models.Booklet).filter(models.Booklet.professor_id == p.id).all()
    exams = db.query(models.Exam).filter(models.Exam.professor_id == p.id).all()
    return schemas.ProfessorOut(
        id=p.id,
        title=p.title,
        name=p.user.full_name,
        subject_name=p.subject.name,
        booklets=booklets,
        exams=exams,
    )


@router.get("", response_model=list[schemas.ProfessorOut])
def list_professors(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    profs = db.query(models.ProfessorProfile).all()
    return [_to_out(p, db) for p in profs]


@router.get("/{professor_id}", response_model=schemas.ProfessorOut)
def get_professor(professor_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    p = db.get(models.ProfessorProfile, professor_id)
    if not p:
        raise HTTPException(404, "الدكتور غير موجود")
    return _to_out(p, db)


def _get_own_profile(db: Session, user: models.User) -> models.ProfessorProfile:
    if user.role != models.Role.professor:
        raise HTTPException(403, "هذه الواجهة مخصصة للدكاترة فقط")
    profile = db.query(models.ProfessorProfile).filter(models.ProfessorProfile.user_id == user.id).first()
    if not profile:
        raise HTTPException(404, "لا يوجد ملف تدريسي مرتبط بهذا الحساب")
    return profile


@router.get("/me/dashboard")
def my_dashboard(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Powers the Professor Panel — a professor's own booklets, exams, and
    the students who've been active in their subject."""
    profile = _get_own_profile(db, user)

    booklets = db.query(models.Booklet).filter(models.Booklet.professor_id == profile.id).all()
    exams = db.query(models.Exam).filter(models.Exam.professor_id == profile.id).all()
    answers = (
        db.query(models.StudentAnswer)
        .join(models.Question, models.Question.id == models.StudentAnswer.question_id)
        .filter(models.Question.subject_id == profile.subject_id)
        .all()
    )
    student_ids = {a.user_id for a in answers}
    avg_score = round(100 * sum(a.is_correct for a in answers) / len(answers)) if answers else None

    return {
        "professor": {"id": profile.id, "name": user.full_name, "title": profile.title, "subject": profile.subject.name},
        "booklet_count": len(booklets),
        "exam_count": len(exams),
        "student_count": len(student_ids),
        "avg_student_score": avg_score,
        "booklets": [{"id": b.id, "title": b.title, "pages": b.pages} for b in booklets],
        "exams": [{"id": e.id, "title": e.title, "question_count": e.question_count, "duration_minutes": e.duration_minutes} for e in exams],
    }


@router.get("/me/students")
def my_students(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Powers the Professor Panel's "طلابي" tab — the students who've
    actually answered questions in this professor's subject, with their
    real activity and accuracy instead of the old static placeholder rows."""
    profile = _get_own_profile(db, user)

    answers = (
        db.query(models.StudentAnswer)
        .join(models.Question, models.Question.id == models.StudentAnswer.question_id)
        .filter(models.Question.subject_id == profile.subject_id)
        .all()
    )
    by_student: dict[str, list[models.StudentAnswer]] = {}
    for a in answers:
        by_student.setdefault(a.user_id, []).append(a)

    out = []
    for student_id, ans in by_student.items():
        student = db.get(models.User, student_id)
        if not student:
            continue
        avg = round(100 * sum(a.is_correct for a in ans) / len(ans))
        last_answered = max(a.answered_at for a in ans)
        out.append({
            "id": student.id,
            "name": student.full_name,
            "answered_count": len(ans),
            "avg_score": avg,
            "last_answered_at": last_answered,
        })
    out.sort(key=lambda s: s["last_answered_at"], reverse=True)
    return out


# ---------------------------------------------------------- booklet CRUD
@router.post("/me/booklets", response_model=schemas.BookletOut)
def create_booklet(body: schemas.BookletIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    profile = _get_own_profile(db, user)
    b = models.Booklet(professor_id=profile.id, title=body.title, pages=body.pages)
    db.add(b)
    db.commit()
    db.refresh(b)
    return b


@router.put("/me/booklets/{booklet_id}", response_model=schemas.BookletOut)
def update_booklet(booklet_id: str, body: schemas.BookletIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    profile = _get_own_profile(db, user)
    b = db.get(models.Booklet, booklet_id)
    if not b or b.professor_id != profile.id:
        raise HTTPException(404, "الملزمة غير موجودة")
    b.title = body.title
    b.pages = body.pages
    db.commit()
    db.refresh(b)
    return b


@router.delete("/me/booklets/{booklet_id}")
def delete_booklet(booklet_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    profile = _get_own_profile(db, user)
    b = db.get(models.Booklet, booklet_id)
    if not b or b.professor_id != profile.id:
        raise HTTPException(404, "الملزمة غير موجودة")
    db.delete(b)
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------- exam CRUD
@router.post("/me/exams", response_model=schemas.ExamOut)
def create_exam(body: schemas.ExamIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    profile = _get_own_profile(db, user)
    e = models.Exam(
        subject_id=profile.subject_id, professor_id=profile.id, title=body.title,
        question_count=body.question_count, duration_minutes=body.duration_minutes,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


@router.put("/me/exams/{exam_id}", response_model=schemas.ExamOut)
def update_exam(exam_id: str, body: schemas.ExamIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    profile = _get_own_profile(db, user)
    e = db.get(models.Exam, exam_id)
    if not e or e.professor_id != profile.id:
        raise HTTPException(404, "الامتحان غير موجود")
    e.title = body.title
    e.question_count = body.question_count
    e.duration_minutes = body.duration_minutes
    db.commit()
    db.refresh(e)
    return e


@router.delete("/me/exams/{exam_id}")
def delete_exam(exam_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    profile = _get_own_profile(db, user)
    e = db.get(models.Exam, exam_id)
    if not e or e.professor_id != profile.id:
        raise HTTPException(404, "الامتحان غير موجود")
    db.delete(e)
    db.commit()
    return {"ok": True}


# --------------------------------------------------------- course/lecture CRUD
@router.get("/me/courses")
def my_courses(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    profile = _get_own_profile(db, user)
    courses = db.query(models.Course).filter(models.Course.professor_id == profile.id).all()
    return [
        {
            "id": c.id, "title": c.title,
            "lectures": [
                {"id": l.id, "title": l.title, "duration_seconds": l.duration_seconds}
                for l in sorted(c.lectures, key=lambda l: l.order_index)
            ],
        }
        for c in courses
    ]


@router.post("/me/courses")
def create_course(body: schemas.CourseIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    profile = _get_own_profile(db, user)
    c = models.Course(subject_id=profile.subject_id, professor_id=profile.id, title=body.title)
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"id": c.id, "title": c.title, "lectures": []}


@router.put("/me/courses/{course_id}")
def update_course(course_id: str, body: schemas.CourseIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    profile = _get_own_profile(db, user)
    c = db.get(models.Course, course_id)
    if not c or c.professor_id != profile.id:
        raise HTTPException(404, "الكورس غير موجود")
    c.title = body.title
    db.commit()
    return {"ok": True}


@router.delete("/me/courses/{course_id}")
def delete_course(course_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    profile = _get_own_profile(db, user)
    c = db.get(models.Course, course_id)
    if not c or c.professor_id != profile.id:
        raise HTTPException(404, "الكورس غير موجود")
    db.delete(c)  # Course.lectures cascades via the ORM relationship
    db.commit()
    return {"ok": True}


@router.post("/me/courses/{course_id}/lectures")
def create_lecture(course_id: str, body: schemas.LectureIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    profile = _get_own_profile(db, user)
    c = db.get(models.Course, course_id)
    if not c or c.professor_id != profile.id:
        raise HTTPException(404, "الكورس غير موجود")
    order_index = len(c.lectures)
    lec = models.Lecture(course_id=course_id, title=body.title, duration_seconds=body.duration_seconds, order_index=order_index)
    db.add(lec)
    db.commit()
    db.refresh(lec)
    return {"id": lec.id, "title": lec.title, "duration_seconds": lec.duration_seconds}


def _get_own_lecture(db: Session, profile: models.ProfessorProfile, lecture_id: str) -> models.Lecture:
    lec = db.get(models.Lecture, lecture_id)
    if not lec or not lec.course or lec.course.professor_id != profile.id:
        raise HTTPException(404, "المحاضرة غير موجودة")
    return lec


@router.put("/me/lectures/{lecture_id}")
def update_lecture(lecture_id: str, body: schemas.LectureIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    profile = _get_own_profile(db, user)
    lec = _get_own_lecture(db, profile, lecture_id)
    lec.title = body.title
    lec.duration_seconds = body.duration_seconds
    db.commit()
    return {"ok": True}


@router.delete("/me/lectures/{lecture_id}")
def delete_lecture(lecture_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    profile = _get_own_profile(db, user)
    lec = _get_own_lecture(db, profile, lecture_id)
    db.delete(lec)
    db.commit()
    return {"ok": True}
