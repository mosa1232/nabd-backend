from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user
from .admin import (
    DOC_EXTS, IMAGE_EXTS, MAX_UPLOAD_BYTES, MAX_VIDEO_BYTES, UPLOAD_DIR,
    VIDEO_EXTS, delete_stored_upload, safe_upload_name,
)

router = APIRouter(prefix="/api/professors", tags=["professors"])


def _to_out(
    p: models.ProfessorProfile,
    booklets: list[models.Booklet],
    exams: list[models.Exam],
) -> schemas.ProfessorOut:
    return schemas.ProfessorOut(
        id=p.id,
        title=p.title,
        name=p.user.full_name,
        subject_name=p.subject.name,
        university_name=p.subject.stage.university.name if p.subject.stage else "",
        bio=p.bio or "",
        photo_url=p.photo_url,
        booklets=booklets,
        exams=exams,
    )


def _profile_query(db: Session):
    """Eager-loads everything _to_out touches. Without this, serializing a
    professor fires four extra lazy loads (user, subject, stage, university)
    on top of the booklet/exam queries — ~6 round trips per professor."""
    return db.query(models.ProfessorProfile).options(
        joinedload(models.ProfessorProfile.user),
        joinedload(models.ProfessorProfile.subject)
        .joinedload(models.Subject.stage)
        .joinedload(models.Stage.university),
    )


@router.get("", response_model=list[schemas.ProfessorOut])
def list_professors(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    profs = _profile_query(db).all()
    prof_ids = [p.id for p in profs]

    # Two grouped queries for the whole page instead of two per professor.
    booklets_by_prof: dict[str, list[models.Booklet]] = {}
    for b in db.query(models.Booklet).filter(models.Booklet.professor_id.in_(prof_ids)).all():
        booklets_by_prof.setdefault(b.professor_id, []).append(b)
    exams_by_prof: dict[str, list[models.Exam]] = {}
    for e in db.query(models.Exam).filter(models.Exam.professor_id.in_(prof_ids)).all():
        exams_by_prof.setdefault(e.professor_id, []).append(e)

    return [
        _to_out(p, booklets_by_prof.get(p.id, []), exams_by_prof.get(p.id, []))
        for p in profs
    ]


@router.get("/{professor_id}", response_model=schemas.ProfessorOut)
def get_professor(professor_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    p = _profile_query(db).filter(models.ProfessorProfile.id == professor_id).first()
    if not p:
        raise HTTPException(404, "الدكتور غير موجود")
    booklets = db.query(models.Booklet).filter(models.Booklet.professor_id == p.id).all()
    exams = db.query(models.Exam).filter(models.Exam.professor_id == p.id).all()
    return _to_out(p, booklets, exams)


@router.get("/booklets/latest")
def latest_booklet(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Powers the home screen's "آخر ملزمة" continue-card with a real,
    just-uploaded booklet instead of the fixed placeholder title it used to
    show every student regardless of what actually exists."""
    booklet = db.query(models.Booklet).order_by(models.Booklet.created_at.desc()).first()
    if not booklet:
        return None
    professor = db.get(models.ProfessorProfile, booklet.professor_id)
    return {
        "id": booklet.id,
        "title": booklet.title,
        "pages": booklet.pages,
        "file_url": booklet.file_url or None,
        "subject_name": professor.subject.name if professor else "",
        "professor_id": professor.id if professor else None,
    }


def _get_own_profile(db: Session, user: models.User) -> models.ProfessorProfile:
    if user.role != models.Role.professor:
        raise HTTPException(403, "هذه الواجهة مخصصة للدكاترة فقط")
    profile = db.query(models.ProfessorProfile).filter(models.ProfessorProfile.user_id == user.id).first()
    if not profile:
        raise HTTPException(404, "لا يوجد ملف تدريسي مرتبط بهذا الحساب")
    return profile


@router.put("/me/profile", response_model=schemas.ProfessorOut)
def update_my_profile(
    body: schemas.ProfessorProfileUpdateIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Lets a professor fill in their own bio and photo — the student-facing
    "صفحة الدكتور" used to show only a name, title and subject."""
    profile = _get_own_profile(db, user)
    profile.title = body.title.strip() or profile.title
    profile.bio = body.bio.strip()
    if body.photo_url is not None:
        profile.photo_url = body.photo_url
    db.commit()
    db.refresh(profile)
    return get_professor(profile.id, db, user)


@router.post("/me/photo")
async def upload_my_photo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    profile = _get_own_profile(db, user)
    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(400, "الملف أكبر من الحد المسموح (20 ميغابايت)")
    stored_name = safe_upload_name(file.filename, IMAGE_EXTS, "photo")
    (UPLOAD_DIR / stored_name).write_bytes(contents)
    delete_stored_upload(profile.photo_url)  # don't strand the photo being replaced
    profile.photo_url = f"/media-files/{stored_name}"
    db.commit()
    return {"photo_url": profile.photo_url}


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
        "professor": {
            "id": profile.id, "name": user.full_name, "title": profile.title, "subject": profile.subject.name,
            "bio": profile.bio or "", "photo_url": profile.photo_url,
        },
        "booklet_count": len(booklets),
        "exam_count": len(exams),
        "student_count": len(student_ids),
        "avg_student_score": avg_score,
        "booklets": [{"id": b.id, "title": b.title, "pages": b.pages, "file_url": b.file_url or None} for b in booklets],
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


_NEW_ADJ = {"ملزمة": "جديدة", "امتحان": "جديد", "كورس": "جديد"}


def _notify_new_content(
    db: Session,
    profile: models.ProfessorProfile,
    kind: str,
    title: str,
    content_type: str | None = None,
    content_id: str | None = None,
) -> None:
    """Broadcasts a "new content" notice whenever a professor publishes a
    booklet, exam, or course — students otherwise have no way to know
    something new landed in a subject they follow."""
    adj = _NEW_ADJ.get(kind, "جديد")
    db.add(models.Notification(
        title=f"{kind} {adj}: {title}",
        body=f"أضاف {profile.user.full_name} {kind} {adj} في مادة {profile.subject.name}",
        content_type=content_type,
        content_id=content_id,
    ))


def _drop_content_notifications(db: Session, content_type: str, content_ids: list[str]) -> None:
    """Removes the "new content" announcements for content being deleted,
    so the notifications list never points at something that's gone."""
    if not content_ids:
        return
    stale = [
        n.id for n in db.query(models.Notification.id)
        .filter(
            models.Notification.content_type == content_type,
            models.Notification.content_id.in_(content_ids),
        ).all()
    ]
    if not stale:
        return
    db.query(models.NotificationRead).filter(
        models.NotificationRead.notification_id.in_(stale)
    ).delete(synchronize_session=False)
    db.query(models.Notification).filter(
        models.Notification.id.in_(stale)
    ).delete(synchronize_session=False)


# ---------------------------------------------------------- booklet CRUD
@router.post("/me/booklets", response_model=schemas.BookletOut)
def create_booklet(body: schemas.BookletIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    profile = _get_own_profile(db, user)
    b = models.Booklet(professor_id=profile.id, title=body.title, pages=body.pages)
    db.add(b)
    db.flush()  # need the generated id to link the announcement to it
    _notify_new_content(db, profile, "ملزمة", body.title, "booklet", b.id)
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
    delete_stored_upload(b.file_url)
    _drop_content_notifications(db, "booklet", [b.id])
    db.query(models.RecentView).filter(
        models.RecentView.content_type == "booklet",
        models.RecentView.content_id == b.id,
    ).delete(synchronize_session=False)
    db.delete(b)
    db.commit()
    return {"ok": True}


@router.post("/me/booklets/{booklet_id}/file", response_model=schemas.BookletOut)
async def upload_booklet_file(
    booklet_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """The "فتح" button on a booklet used to have nothing to open — this is
    what actually puts a real file behind it."""
    profile = _get_own_profile(db, user)
    b = db.get(models.Booklet, booklet_id)
    if not b or b.professor_id != profile.id:
        raise HTTPException(404, "الملزمة غير موجودة")
    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(400, "الملف أكبر من الحد المسموح (20 ميغابايت)")
    stored_name = safe_upload_name(file.filename, DOC_EXTS | IMAGE_EXTS, "booklet")
    (UPLOAD_DIR / stored_name).write_bytes(contents)
    delete_stored_upload(b.file_url)  # replacing a file shouldn't strand the old one
    b.file_url = f"/media-files/{stored_name}"
    db.commit()
    db.refresh(b)
    return b


# ------------------------------------------------------------- exam CRUD
@router.post("/me/exams", response_model=schemas.ExamOut)
def create_exam(body: schemas.ExamIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    profile = _get_own_profile(db, user)
    e = models.Exam(
        subject_id=profile.subject_id, professor_id=profile.id, title=body.title,
        question_count=body.question_count, duration_minutes=body.duration_minutes,
    )
    db.add(e)
    db.flush()  # need the generated id to link the announcement to it
    _notify_new_content(db, profile, "امتحان", body.title, "exam", e.id)
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
    _drop_content_notifications(db, "exam", [e.id])
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
                {"id": l.id, "title": l.title, "duration_seconds": l.duration_seconds, "video_url": l.video_url or None}
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
    db.flush()  # need the generated id to link the announcement to it
    _notify_new_content(db, profile, "كورس", body.title, "course", c.id)
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
    for lec in c.lectures:
        delete_stored_upload(lec.video_url)
    _purge_lecture_traces(db, [lec.id for lec in c.lectures])
    _drop_content_notifications(db, "course", [c.id])
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
    return {"id": lec.id, "title": lec.title, "duration_seconds": lec.duration_seconds, "video_url": None}


def _purge_lecture_traces(db: Session, lecture_ids: list[str]) -> None:
    """Drops the per-student rows that point at lectures being deleted.

    lecture_progress and recent_views reference a lecture by id but have no
    FK cascade (and SQLite doesn't enforce FKs anyway), so deleting a lecture
    used to leave rows behind that count toward a course's "done" total and
    can never be cleared.
    """
    if not lecture_ids:
        return
    db.query(models.LectureProgress).filter(
        models.LectureProgress.lecture_id.in_(lecture_ids)
    ).delete(synchronize_session=False)
    db.query(models.RecentView).filter(
        models.RecentView.content_type == "lecture",
        models.RecentView.content_id.in_(lecture_ids),
    ).delete(synchronize_session=False)


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
    delete_stored_upload(lec.video_url)
    _purge_lecture_traces(db, [lec.id])
    db.delete(lec)
    db.commit()
    return {"ok": True}


@router.post("/me/lectures/{lecture_id}/file")
async def upload_lecture_video(
    lecture_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Replaces the old fake progress-bar "player" — a real video file
    behind a real lecture, played by a real <video> element on the student
    side."""
    profile = _get_own_profile(db, user)
    lec = _get_own_lecture(db, profile, lecture_id)
    contents = await file.read()
    if len(contents) > MAX_VIDEO_BYTES:
        raise HTTPException(400, "الملف أكبر من الحد المسموح (150 ميغابايت)")
    stored_name = safe_upload_name(file.filename, VIDEO_EXTS, "lecture")
    (UPLOAD_DIR / stored_name).write_bytes(contents)
    delete_stored_upload(lec.video_url)  # replacing a video shouldn't strand the old one
    lec.video_url = f"/media-files/{stored_name}"
    db.commit()
    return {"id": lec.id, "title": lec.title, "duration_seconds": lec.duration_seconds, "video_url": lec.video_url}
