from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from .. import models, ranking, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api", tags=["questions"])


def _section_filter(q, booklet_id: str | None, lecture_id: str | None, general: bool, bank_id: str | None = None):
    # a named bank wins over a booklet / lecture the question may also be filed under
    if bank_id:
        return q.filter(models.Question.bank_id == bank_id)
    if booklet_id:
        return q.filter(models.Question.booklet_id == booklet_id, models.Question.bank_id.is_(None))
    if lecture_id:
        return q.filter(models.Question.lecture_id == lecture_id, models.Question.bank_id.is_(None))
    if general:
        return q.filter(models.Question.booklet_id.is_(None), models.Question.lecture_id.is_(None), models.Question.bank_id.is_(None))
    return q


@router.get("/subjects/{subject_id}/questions", response_model=list[schemas.QuestionOut])
def list_questions(
    subject_id: str,
    limit: int = Query(20, ge=1, le=200),
    offset: int = 0,
    booklet_id: str | None = None,
    lecture_id: str | None = None,
    general: bool = False,
    bank_id: str | None = None,
    shuffle: bool = False,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """The questions of a subject, optionally only those of one booklet /
    lecture (or the general ones). `shuffle` gives a fresh random order — the
    exam run. The correct answers are not included."""
    query = (
        db.query(models.Question)
        .options(joinedload(models.Question.choices))
        .filter(models.Question.subject_id == subject_id)
    )
    query = _section_filter(query, booklet_id, lecture_id, general, bank_id)
    if shuffle:
        query = query.order_by(func.random())
    return query.offset(offset).limit(limit).all()


@router.get("/subjects/{subject_id}/bank-sections")
def bank_sections(subject_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """The question bank of a subject split into its booklets and lectures,
    each with how many questions it holds and how many the student has tried."""
    qs = db.query(models.Question.id, models.Question.booklet_id, models.Question.lecture_id, models.Question.bank_id).filter(models.Question.subject_id == subject_id).all()
    if not qs:
        return {"total": 0, "sections": []}
    qids = [r[0] for r in qs]
    tried = set()
    mastered = set()
    latest: dict[str, bool] = {}
    for qid, ok in (db.query(models.StudentAnswer.question_id, models.StudentAnswer.is_correct)
                    .filter(models.StudentAnswer.user_id == user.id, models.StudentAnswer.question_id.in_(qids))
                    .order_by(models.StudentAnswer.answered_at.asc()).all()):
        latest[qid] = bool(ok)
    tried = set(latest)
    mastered = {k for k, v in latest.items() if v}
    groups: dict[str, list[str]] = {}
    for qid, bid, lid, kid in qs:
        key = ("bank:" + kid) if kid else ("booklet:" + bid) if bid else ("lecture:" + lid) if lid else "general"
        groups.setdefault(key, []).append(qid)
    banks = {b.id: b for b in db.query(models.QuestionBank).filter(models.QuestionBank.id.in_([k[5:] for k in groups if k.startswith("bank:")])).all()}
    bank_owner = {}
    if banks:
        prof_ids = {b.professor_id for b in banks.values() if b.professor_id}
        for pp in db.query(models.ProfessorProfile).filter(models.ProfessorProfile.id.in_(prof_ids)).all():
            bank_owner[pp.id] = pp.user.full_name if pp.user else ""
    booklets = {b.id: b for b in db.query(models.Booklet).filter(models.Booklet.id.in_([k[8:] for k in groups if k.startswith("booklet:")])).all()}
    lectures = {l.id: l for l in db.query(models.Lecture).filter(models.Lecture.id.in_([k[8:] for k in groups if k.startswith("lecture:")])).all()}
    courses = {c.id: c for c in db.query(models.Course).filter(models.Course.id.in_({l.course_id for l in lectures.values()})).all()} if lectures else {}
    out = []
    for key, ids in groups.items():
        kind, _, ident = key.partition(":")
        if kind == "bank":
            bk = banks.get(ident)
            title, kind_l = (bk.name if bk else None), "bank"
            sub = bank_owner.get(bk.professor_id, "") if bk else ""
            order = (-1, bk.created_at.timestamp() if bk and bk.created_at else 0)
        elif kind == "booklet":
            b = booklets.get(ident)
            title, kind_l = (b.title if b else None), "booklet"
            order = (0, b.created_at.timestamp() if b and b.created_at else 0)
        elif kind == "lecture":
            l = lectures.get(ident)
            c = courses.get(l.course_id) if l else None
            title, kind_l = ((f"{l.title}" if l else None), "lecture")
            order = (1, (c.title if c else ""), (l.order_index or 0) if l else 0)
            sub = c.title if c else ""
        else:
            title, kind_l, order = "أسئلة عامة", "general", (2,)
        if kind in ("bank", "booklet", "lecture") and not title:
            key, title, kind_l, order = "general", "أسئلة عامة", "general", (2,)   # parent was deleted
        out.append({"key": key, "kind": kind_l, "title": title, "course": sub if kind in ("lecture", "bank") else "",
                    "count": len(ids), "tried": len([i for i in ids if i in tried]), "mastered": len([i for i in ids if i in mastered]), "_o": order})
    # a deleted parent can leave several "general" entries — merge them
    merged: dict[str, dict] = {}
    for r in out:
        if r["key"] in merged and r["key"] == "general":
            m = merged["general"]
            for f in ("count", "tried", "mastered"):
                m[f] += r[f]
        else:
            merged[r["key"]] = r
    rows = sorted(merged.values(), key=lambda r: tuple(str(x) if isinstance(x, str) else x for x in r["_o"]))
    for r in rows:
        r.pop("_o", None)
    return {"total": len(qids), "sections": rows}


@router.get("/subjects/{subject_id}/study")
def study_questions(
    subject_id: str,
    booklet_id: str | None = None,
    lecture_id: str | None = None,
    general: bool = False,
    bank_id: str | None = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Study mode: the questions of one section WITH their answers and
    explanations, in their original order — what a student reads through
    before sitting the exam on them."""
    query = (
        db.query(models.Question)
        .options(joinedload(models.Question.choices))
        .filter(models.Question.subject_id == subject_id)
    )
    rows = _section_filter(query, booklet_id, lecture_id, general, bank_id).limit(300).all()
    out = []
    for q in rows:
        out.append({
            "id": q.id, "text": q.text, "eyebrow": q.eyebrow or "", "image_url": q.image_url, "qtype": q.qtype or "mcq",
            "rationale": q.rationale or "", "model_answer": q.model_answer or "",
            "choices": [{"id": c.id, "text": c.text, "is_correct": bool(c.is_correct)} for c in sorted(q.choices, key=lambda c: c.order_index or 0)],
        })
    return out


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
    if question.qtype == "essay":
        raise HTTPException(400, "السؤال المقالي لا يُجاب باختيار — استخدم عرض الإجابة النموذجية")

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
    ranking.invalidate()   # the board must not lag behind an answer just given

    return schemas.AnswerResult(
        is_correct=choice.is_correct,
        correct_choice_id=correct_choice.id if correct_choice else "",
        rationale=question.rationale,
    )


@router.get("/questions/{question_id}/model-answer", response_model=schemas.EssayRevealOut)
def essay_model_answer(
    question_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Essay questions have no auto-grading: the student writes their own
    answer, then reveals the model answer to compare. Only essays reveal
    here — for an MCQ the answer endpoint is what reveals (after a pick)."""
    question = db.get(models.Question, question_id)
    if not question:
        raise HTTPException(404, "السؤال غير موجود")
    if question.qtype != "essay":
        raise HTTPException(400, "هذا ليس سؤالاً مقاليًا")
    return schemas.EssayRevealOut(model_answer=question.model_answer or "", rationale=question.rationale or "")


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
def list_mistakes(limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """The most recent wrong answer per question — the "أخطائي" review tab.
    Unlike the live quiz, this reveals the correct answer and rationale
    since the student already committed to (and got graded on) their pick."""
    # Capped and batched: this used to pull every wrong answer the student
    # had ever given, then fire a per-question db.get() (plus a lazy choices
    # load and another get() for the picked choice) — thousands of queries
    # in one request for a heavy user.
    wrong = (
        db.query(models.StudentAnswer)
        .filter(models.StudentAnswer.user_id == user.id, models.StudentAnswer.is_correct.is_(False))
        .order_by(models.StudentAnswer.answered_at.desc())
        .limit(500)
        .all()
    )
    latest_per_question: list[models.StudentAnswer] = []
    seen: set[str] = set()
    for a in wrong:
        if a.question_id in seen:
            continue
        seen.add(a.question_id)
        latest_per_question.append(a)
    latest_per_question = latest_per_question[:limit]
    if not latest_per_question:
        return []

    questions = {
        q.id: q for q in db.query(models.Question)
        .options(joinedload(models.Question.choices))
        .filter(models.Question.id.in_([a.question_id for a in latest_per_question]))
        .all()
    }
    choices = {
        c.id: c for c in db.query(models.Choice)
        .filter(models.Choice.id.in_([a.choice_id for a in latest_per_question]))
        .all()
    }

    out = []
    for a in latest_per_question:
        q = questions.get(a.question_id)
        if not q:
            continue
        correct = next((c for c in q.choices if c.is_correct), None)
        your_choice = choices.get(a.choice_id)
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
