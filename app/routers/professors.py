from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload

from .. import ai, knowledge, models, qimport, schemas
from ..config import get_settings
from ..database import get_db
from ..deps import get_current_user, user_permissions
from ..permissions import PERMISSIONS, PROF_PERMS, parse_permissions, serialize_permissions
from ..security import hash_password
from ..compress import optimize_upload
from ..storage import media_url, storage
from .admin import (
    DOC_EXTS, IMAGE_EXTS, MAX_UPLOAD_BYTES, MAX_VIDEO_BYTES,
    VIDEO_EXTS, delete_stored_upload, normalize_question_input, purge_question, replace_choices, safe_upload_name,
)

router = APIRouter(prefix="/api/professors", tags=["professors"])
_settings = get_settings()


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


def _get_own_profile(db: Session, user: models.User, perm: str = "owner") -> models.ProfessorProfile:
    """The teaching profile the caller acts on.

    - a professor always acts on their own profile;
    - an assistant acts on their professor's profile, but only for the
      permission the professor granted ("any" = at least one prof.* grant);
    - perm="owner" is professor-only (profile edits, managing assistants).
    """
    if user.role == models.Role.professor:
        owner_id = user.id
    elif user.role == models.Role.assistant and perm != "owner":
        held = user_permissions(user)
        if perm == "any":
            ok = bool(held & PROF_PERMS)
        else:
            ok = perm in held
        if not ok:
            raise HTTPException(403, "لا تملك صلاحية لهذا الإجراء — اطلبها من الدكتور")
        parent = db.get(models.User, user.parent_user_id) if user.parent_user_id else None
        if not parent or parent.role != models.Role.professor or parent.is_banned:
            raise HTTPException(403, "حساب المساعد غير مرتبط بدكتور فعّال")
        owner_id = parent.id
    else:
        raise HTTPException(403, "هذه الواجهة مخصصة للدكاترة فقط")
    profile = db.query(models.ProfessorProfile).filter(models.ProfessorProfile.user_id == owner_id).first()
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
    profile = _get_own_profile(db, user, "owner")
    profile.title = body.title.strip() or profile.title
    profile.bio = body.bio.strip()
    if body.photo_url is not None and body.photo_url != profile.photo_url:
        # Clearing or repointing the photo has to release the stored file
        # too, the same way replacing it through /me/photo does.
        delete_stored_upload(profile.photo_url)
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
    profile = _get_own_profile(db, user, "owner")
    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(400, "الملف أكبر من الحد المسموح (20 ميغابايت)")
    stored_name = safe_upload_name(file.filename, IMAGE_EXTS, "photo")
    stored_name, contents, ctype = optimize_upload(stored_name, contents, file.content_type or "", 640)
    storage.save(stored_name, contents, ctype)
    delete_stored_upload(profile.photo_url)  # don't strand the photo being replaced
    profile.photo_url = media_url(stored_name)
    db.commit()
    return {"photo_url": profile.photo_url}


@router.get("/me/dashboard")
def my_dashboard(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Powers the Professor Panel — a professor's own booklets, exams, and
    the students who've been active in their subject."""
    profile = _get_own_profile(db, user, "any")

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
    profile = _get_own_profile(db, user, "prof.students")

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
    profile = _get_own_profile(db, user, "prof.booklets")
    b = models.Booklet(professor_id=profile.id, title=body.title, pages=body.pages)
    db.add(b)
    db.flush()  # need the generated id to link the announcement to it
    _notify_new_content(db, profile, "ملزمة", body.title, "booklet", b.id)
    db.commit()
    db.refresh(b)
    return b


@router.put("/me/booklets/{booklet_id}", response_model=schemas.BookletOut)
def update_booklet(booklet_id: str, body: schemas.BookletIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    profile = _get_own_profile(db, user, "prof.booklets")
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
    profile = _get_own_profile(db, user, "prof.booklets")
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
    profile = _get_own_profile(db, user, "prof.booklets")
    b = db.get(models.Booklet, booklet_id)
    if not b or b.professor_id != profile.id:
        raise HTTPException(404, "الملزمة غير موجودة")
    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(400, "الملف أكبر من الحد المسموح (20 ميغابايت)")
    stored_name = safe_upload_name(file.filename, DOC_EXTS | IMAGE_EXTS, "booklet")
    stored_name, contents, ctype = optimize_upload(stored_name, contents, file.content_type or "", 1600)
    storage.save(stored_name, contents, ctype)
    delete_stored_upload(b.file_url)  # replacing a file shouldn't strand the old one
    b.file_url = media_url(stored_name)
    db.commit()
    db.refresh(b)
    return b


# ------------------------------------------------------------- exam CRUD
@router.post("/me/exams", response_model=schemas.ExamOut)
def create_exam(body: schemas.ExamIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    profile = _get_own_profile(db, user, "prof.exams")
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
    profile = _get_own_profile(db, user, "prof.exams")
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
    profile = _get_own_profile(db, user, "prof.exams")
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
    profile = _get_own_profile(db, user, "prof.courses")
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
    profile = _get_own_profile(db, user, "prof.courses")
    c = models.Course(subject_id=profile.subject_id, professor_id=profile.id, title=body.title)
    db.add(c)
    db.flush()  # need the generated id to link the announcement to it
    _notify_new_content(db, profile, "كورس", body.title, "course", c.id)
    db.commit()
    db.refresh(c)
    return {"id": c.id, "title": c.title, "lectures": []}


@router.put("/me/courses/{course_id}")
def update_course(course_id: str, body: schemas.CourseIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    profile = _get_own_profile(db, user, "prof.courses")
    c = db.get(models.Course, course_id)
    if not c or c.professor_id != profile.id:
        raise HTTPException(404, "الكورس غير موجود")
    c.title = body.title
    db.commit()
    return {"ok": True}


@router.delete("/me/courses/{course_id}")
def delete_course(course_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    profile = _get_own_profile(db, user, "prof.courses")
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
    profile = _get_own_profile(db, user, "prof.courses")
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
    profile = _get_own_profile(db, user, "prof.courses")
    lec = _get_own_lecture(db, profile, lecture_id)
    lec.title = body.title
    lec.duration_seconds = body.duration_seconds
    db.commit()
    return {"ok": True}


@router.delete("/me/lectures/{lecture_id}")
def delete_lecture(lecture_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    profile = _get_own_profile(db, user, "prof.courses")
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
    profile = _get_own_profile(db, user, "prof.courses")
    lec = _get_own_lecture(db, profile, lecture_id)
    contents = await file.read()
    if len(contents) > MAX_VIDEO_BYTES:
        raise HTTPException(400, "الملف أكبر من الحد المسموح (150 ميغابايت)")
    stored_name = safe_upload_name(file.filename, VIDEO_EXTS, "lecture")
    storage.save(stored_name, contents, file.content_type or "")
    delete_stored_upload(lec.video_url)  # replacing a video shouldn't strand the old one
    lec.video_url = media_url(stored_name)
    db.commit()
    return {"id": lec.id, "title": lec.title, "duration_seconds": lec.duration_seconds, "video_url": lec.video_url}



# ------------------------------------------------------------ question bank
# The professor uploads the questions of their own subject. They can only see
# and change the ones they (or their assistants) wrote.
def _question_out(q: models.Question) -> dict:
    return schemas.QuestionAdminOut.model_validate(q, from_attributes=True).model_dump()


@router.get("/me/questions")
def my_questions(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    profile = _get_own_profile(db, user, "prof.questions")
    rows = (
        db.query(models.Question)
        .options(joinedload(models.Question.choices))
        .filter(models.Question.professor_id == profile.id)
        .all()
    )
    return [_question_out(q) for q in rows]


def _prof_question_input(profile: models.ProfessorProfile, body: schemas.QuestionProfIn) -> schemas.QuestionAdminIn:
    return schemas.QuestionAdminIn(subject_id=profile.subject_id, **body.model_dump())


@router.post("/me/questions")
def create_my_question(body: schemas.QuestionProfIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    profile = _get_own_profile(db, user, "prof.questions")
    full = _prof_question_input(profile, body)
    choices = normalize_question_input(full)
    q = models.Question(
        subject_id=profile.subject_id, professor_id=profile.id, text=body.text, eyebrow=body.eyebrow,
        rationale=body.rationale, image_url=body.image_url, qtype=body.qtype,
        model_answer=body.model_answer.strip(),
    )
    db.add(q)
    db.flush()
    for idx, c in enumerate(choices):
        db.add(models.Choice(question_id=q.id, text=c.text, is_correct=c.is_correct, order_index=idx))
    db.commit()
    knowledge.invalidate()
    db.refresh(q)
    return _question_out(q)


def _own_question(db: Session, profile: models.ProfessorProfile, question_id: str) -> models.Question:
    q = db.get(models.Question, question_id)
    if not q or q.professor_id != profile.id:
        raise HTTPException(404, "السؤال غير موجود")
    return q


@router.put("/me/questions/{question_id}")
def update_my_question(question_id: str, body: schemas.QuestionProfIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    profile = _get_own_profile(db, user, "prof.questions")
    q = _own_question(db, profile, question_id)
    choices = normalize_question_input(_prof_question_input(profile, body))
    q.text, q.eyebrow, q.rationale, q.image_url = body.text, body.eyebrow, body.rationale, body.image_url
    q.qtype, q.model_answer = body.qtype, body.model_answer.strip()
    replace_choices(db, q, choices)
    db.commit()
    knowledge.invalidate()
    db.refresh(q)
    return _question_out(q)


@router.delete("/me/questions/{question_id}")
def delete_my_question(question_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    profile = _get_own_profile(db, user, "prof.questions")
    q = _own_question(db, profile, question_id)
    purge_question(db, q)
    db.commit()
    knowledge.invalidate()
    return {"ok": True}


# -------------------------------------------------------------- assistants
# The professor creates their assistants' accounts and decides what each may
# do. Assistants then work inside the professor's own content.
def _assistant_out(a: models.User) -> dict:
    return {
        "id": a.id, "full_name": a.full_name, "email": a.email, "is_banned": bool(a.is_banned),
        "permissions": sorted(parse_permissions(a.permissions) & PROF_PERMS),
    }


def _own_assistant(db: Session, prof_user: models.User, assistant_id: str) -> models.User:
    a = db.get(models.User, assistant_id)
    if not a or a.role != models.Role.assistant or a.parent_user_id != prof_user.id:
        raise HTTPException(404, "المساعد غير موجود")
    return a


@router.get("/me/permission-catalog")
def prof_permission_catalog(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    _get_own_profile(db, user, "owner")
    return [{"code": c, "label": PERMISSIONS[c]} for c in sorted(PROF_PERMS)]


@router.get("/me/assistants")
def my_assistants(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    _get_own_profile(db, user, "owner")
    rows = db.query(models.User).filter(
        models.User.role == models.Role.assistant, models.User.parent_user_id == user.id
    ).order_by(models.User.full_name).all()
    return [_assistant_out(a) for a in rows]


@router.post("/me/assistants")
def create_assistant(body: schemas.AssistantCreateIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    _get_own_profile(db, user, "owner")
    email = body.email.strip()
    if not email or not body.full_name.strip():
        raise HTTPException(400, "الاسم والبريد مطلوبان")
    if len(body.password) < 8:
        raise HTTPException(400, "كلمة المرور يجب أن تكون 8 أحرف على الأقل")
    if db.query(models.User).filter(models.User.email == email).first():
        raise HTTPException(400, "البريد الإلكتروني مستخدم مسبقاً")
    a = models.User(
        email=email, full_name=body.full_name.strip(), role=models.Role.assistant,
        password_hash=hash_password(body.password), parent_user_id=user.id,
        permissions=serialize_permissions(p for p in body.permissions if p in PROF_PERMS),
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return _assistant_out(a)


@router.put("/me/assistants/{assistant_id}")
def update_assistant(assistant_id: str, body: schemas.PermissionsUpdateIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    _get_own_profile(db, user, "owner")
    a = _own_assistant(db, user, assistant_id)
    a.permissions = serialize_permissions(p for p in body.permissions if p in PROF_PERMS)
    db.commit()
    return _assistant_out(a)


@router.delete("/me/assistants/{assistant_id}")
def delete_assistant(assistant_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    _get_own_profile(db, user, "owner")
    a = _own_assistant(db, user, assistant_id)
    try:
        db.delete(a)
        db.commit()
    except Exception:
        # The account has history pointing at it (logs, uploads…). Don't
        # fail — lock it out instead, which has the same effect for the
        # professor.
        db.rollback()
        a = _own_assistant(db, user, assistant_id)
        a.is_banned, a.permissions, a.parent_user_id = True, "", None
        db.commit()
    return {"ok": True}



# ------------------------------------------------- bulk save (AI drafts)
@router.post("/me/questions/bulk")
def bulk_create_questions(body: schemas.QuestionBulkIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Saves several questions at once — what the AI generator's "save the
    ones I picked" button calls. Each is validated exactly like a single one;
    one bad question rejects the whole batch so nothing is half-saved."""
    profile = _get_own_profile(db, user, "prof.questions")
    prepared = []
    for i, qin in enumerate(body.questions, start=1):
        try:
            prepared.append((qin, normalize_question_input(_prof_question_input(profile, qin))))
        except HTTPException as e:
            raise HTTPException(400, f"السؤال رقم {i}: {e.detail}")
    for qin, choices in prepared:
        q = models.Question(
            subject_id=profile.subject_id, professor_id=profile.id, text=qin.text, eyebrow=qin.eyebrow,
            rationale=qin.rationale, image_url=qin.image_url, qtype=qin.qtype, model_answer=qin.model_answer.strip(),
        )
        db.add(q)
        db.flush()
        for idx, c in enumerate(choices):
            db.add(models.Choice(question_id=q.id, text=c.text, is_correct=c.is_correct, order_index=idx))
    db.commit()
    knowledge.invalidate()
    return {"saved": len(prepared)}


# ---------------------------------------------------------- clinical pearls
# Written by the doctor (and assistants they allow). A pearl takes the college
# of the doctor's subject, so students of that college are the ones who see it.
def _section_of(db: Session, profile: models.ProfessorProfile) -> str | None:
    subject = db.get(models.Subject, profile.subject_id)
    stage = db.get(models.Stage, subject.stage_id) if subject else None
    uni = db.get(models.University, stage.university_id) if stage else None
    return uni.section_id if uni else None


def _pearl_out(p: models.ClinicalPearl) -> dict:
    return {"id": p.id, "title": p.title, "tag": p.tag or "", "body": p.body or "", "created_at": p.created_at}


@router.get("/me/pearls")
def my_pearls(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    profile = _get_own_profile(db, user, "prof.pearls")
    rows = (db.query(models.ClinicalPearl).filter(models.ClinicalPearl.professor_id == profile.id)
            .order_by(models.ClinicalPearl.created_at.desc()).all())
    return [_pearl_out(p) for p in rows]


@router.post("/me/pearls")
def create_my_pearl(body: schemas.PearlProfIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    profile = _get_own_profile(db, user, "prof.pearls")
    if not body.title.strip():
        raise HTTPException(400, "العنوان مطلوب")
    p = models.ClinicalPearl(
        title=body.title.strip(), tag=body.tag.strip(), body=body.body.strip(),
        section_id=_section_of(db, profile), professor_id=profile.id, created_by=user.id,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return _pearl_out(p)


def _own_pearl(db: Session, profile: models.ProfessorProfile, pearl_id: str) -> models.ClinicalPearl:
    p = db.get(models.ClinicalPearl, pearl_id)
    if not p or p.professor_id != profile.id:
        raise HTTPException(404, "اللمحة غير موجودة")
    return p


@router.put("/me/pearls/{pearl_id}")
def update_my_pearl(pearl_id: str, body: schemas.PearlProfIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    profile = _get_own_profile(db, user, "prof.pearls")
    p = _own_pearl(db, profile, pearl_id)
    if not body.title.strip():
        raise HTTPException(400, "العنوان مطلوب")
    p.title, p.tag, p.body = body.title.strip(), body.tag.strip(), body.body.strip()
    db.commit()
    return _pearl_out(p)


@router.delete("/me/pearls/{pearl_id}")
def delete_my_pearl(pearl_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    profile = _get_own_profile(db, user, "prof.pearls")
    db.delete(_own_pearl(db, profile, pearl_id))
    db.commit()
    return {"ok": True}


@router.post("/me/pearls/bulk")
def bulk_create_pearls(body: schemas.PearlBulkIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    profile = _get_own_profile(db, user, "prof.pearls")
    section_id = _section_of(db, profile)
    n = 0
    for pin in body.pearls:
        if not pin.title.strip():
            continue
        db.add(models.ClinicalPearl(title=pin.title.strip(), tag=pin.tag.strip(), body=pin.body.strip(),
                                    section_id=section_id, professor_id=profile.id, created_by=user.id))
        n += 1
    db.commit()
    return {"saved": n}


# ------------------------------------------------------------ AI generation
def _ai_guard(user: models.User, kind: str):
    if not ai.enabled():
        raise HTTPException(503, "الذكاء الاصطناعي غير مفعّل على هذا الخادم — يلزم ضبط ANTHROPIC_API_KEY")
    try:
        ai.check_rate(user.id, kind, _settings.ai_generate_per_hour)
    except ai.RateLimited as e:
        raise HTTPException(429, str(e))


def _ai_call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except ai.AIUnavailable as e:
        raise HTTPException(503, str(e))
    except ai.AIError as e:
        raise HTTPException(502, str(e))


@router.post("/me/ai/generate-questions")
async def ai_generate_questions(
    file: UploadFile = File(...),
    count: int = Form(10),
    types: str = Form("mcq,true_false"),
    difficulty: str = Form("متوسط"),
    notes: str = Form(""),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """The doctor uploads a lecture/booklet (PDF, Word, text or image) and the
    AI drafts questions from it. Nothing is saved here: the doctor reviews the
    drafts and saves the ones they want through /me/questions/bulk."""
    profile = _get_own_profile(db, user, "prof.questions")
    if not (1 <= count <= 30):
        raise HTTPException(400, "العدد يجب أن يكون بين 1 و30")
    wanted = [t.strip() for t in types.split(",") if t.strip() in ("mcq", "true_false", "essay")]
    if not wanted:
        raise HTTPException(400, "اختر نوع سؤال واحدًا على الأقل")
    _ai_guard(user, "generate")
    data = await file.read()
    blocks = _ai_call(ai.file_blocks, file.filename, data)
    subject_name = profile.subject.name if profile.subject else ""
    questions, skipped = _ai_call(ai.generate_questions, blocks, subject_name, count, wanted, difficulty[:40], notes)
    if not questions:
        raise HTTPException(502, "لم يستطع المساعد توليد أسئلة صالحة من هذا الملف — جرّب ملفًا أوضح أو عددًا أقل")
    # Warn about drafts that are already in the bank (the search model's job).
    for q in questions:
        q["duplicate_of"] = knowledge.find_similar(db, profile.subject_id, q["text"])
    return {"questions": questions, "skipped": skipped}


@router.post("/me/ai/generate-pearls")
async def ai_generate_pearls(
    file: UploadFile | None = File(None),
    topic: str = Form(""),
    count: int = Form(3),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    profile = _get_own_profile(db, user, "prof.pearls")
    if not (1 <= count <= 10):
        raise HTTPException(400, "العدد يجب أن يكون بين 1 و10")
    blocks = []
    if file is not None and file.filename:
        blocks = _ai_call(ai.file_blocks, file.filename, await file.read())
    if not blocks and not topic.strip():
        raise HTTPException(400, "ارفع ملفًا أو اكتب موضوعًا")
    _ai_guard(user, "generate")
    subject_name = profile.subject.name if profile.subject else ""
    pearls = _ai_call(ai.generate_pearls, blocks, subject_name, count, topic)
    if not pearls:
        raise HTTPException(502, "لم يستطع المساعد توليد لمحات — جرّب موضوعًا أوضح")
    return {"pearls": pearls}


# ------------------------------------------------- question import (Excel / Word)
_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _download(data: bytes, media: str, ascii_name: str, filename: str) -> Response:
    return Response(data, media_type=media, headers={
        "Content-Disposition": f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename)}"})


@router.get("/me/questions/template/excel")
def questions_template_excel(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    _get_own_profile(db, user, "prof.questions")
    return _download(qimport.build_excel_template(), _XLSX, "questions.xlsx", "قالب الأسئلة.xlsx")


@router.get("/me/questions/template/word")
def questions_template_word(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    _get_own_profile(db, user, "prof.questions")
    return _download(qimport.build_docx_template(), _DOCX, "questions.docx", "قالب الأسئلة.docx")


@router.post("/me/questions/import")
async def import_questions_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Reads an Excel/Word file into question drafts. Nothing is saved: the
    doctor reviews the preview and saves what they want via /me/questions/bulk."""
    profile = _get_own_profile(db, user, "prof.questions")
    data = await file.read(qimport.MAX_BYTES + 1)
    name = (file.filename or "").lower()
    try:
        if name.endswith(".xlsx"):
            drafts, errors = qimport.parse_excel(data)
        elif name.endswith(".docx"):
            drafts, errors = qimport.parse_docx(data)
        elif name.endswith((".doc", ".xls")):
            raise HTTPException(400, "الصيغة القديمة غير مدعومة — احفظ الملف بصيغة .docx أو .xlsx ثم ارفعه")
        else:
            raise HTTPException(400, "ارفع ملف Excel (.xlsx) أو Word (.docx)")
    except qimport.ImportFileError as e:
        raise HTTPException(400, str(e))
    for d in drafts:
        d["duplicate_of"] = knowledge.find_similar(db, profile.subject_id, d["text"])
    return {"questions": drafts, "errors": errors, "filename": (file.filename or "")[:120]}
