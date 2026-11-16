"""Detailed statistics for the admin dashboard: one endpoint per tab so each
loads only what it shows. Everything is computed from real rows; periods are
the last N days (inclusive of today, UTC)."""
from datetime import datetime, time, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..deps import admin_gate

router = APIRouter(prefix="/api/admin/stats", tags=["stats"], dependencies=[Depends(admin_gate)])

SA = models.StudentAnswer
Q = models.Question
U = models.User
STUDENT = U.role == models.Role.student


def _start(days: int) -> datetime:
    return datetime.combine(datetime.utcnow().date() - timedelta(days=days - 1), time.min)


def _pct(part, whole):
    return round(100 * part / whole) if whole else None


def _correct_sum():
    return func.sum(case((SA.is_correct.is_(True), 1), else_=0))


def _day_expr(col):
    return func.date(col)


def _daily(db: Session, date_col, agg, days: int, *filters) -> list[dict]:
    """agg(date_col) per day for the last `days` days, empty days as 0."""
    start = _start(days)
    day = _day_expr(date_col).label("day")
    q = db.query(day, agg).filter(date_col >= start)
    for f in filters:
        q = q.filter(f)
    got = {}
    for d, v in q.group_by(day).all():
        if d is None:
            continue
        key = str(d)[:10]
        got[key] = int(v or 0)
    first = start.date()
    return [{"date": (first + timedelta(days=i)).isoformat(), "count": got.get((first + timedelta(days=i)).isoformat(), 0)} for i in range(days)]


def _hour_expr(db: Session, col):
    if db.bind.dialect.name == "postgresql":
        return func.extract("hour", col)
    return func.strftime("%H", col)


def _rows(items, *keys):
    return [dict(zip(keys, row)) for row in items]


# ------------------------------------------------------------------ students
@router.get("/students")
def students_stats(days: int = Query(30, ge=1, le=365), db: Session = Depends(get_db)):
    start = _start(days)
    now = datetime.utcnow()
    total = db.query(func.count(U.id)).filter(STUDENT).scalar() or 0
    new = db.query(func.count(U.id)).filter(STUDENT, U.created_at >= start).scalar() or 0
    active = db.query(func.count(func.distinct(SA.user_id))).filter(SA.answered_at >= start).scalar() or 0
    verified = db.query(func.count(U.id)).filter(STUDENT, U.verified_at.isnot(None)).scalar() or 0
    graduates = db.query(func.count(U.id)).filter(STUDENT, U.is_graduate.is_(True)).scalar() or 0
    no_profile = db.query(func.count(U.id)).filter(STUDENT, U.university_id.is_(None)).scalar() or 0
    banned = db.query(func.count(U.id)).filter(STUDENT, U.is_banned.is_(True)).scalar() or 0
    with_2fa = db.query(func.count(U.id)).filter(STUDENT, U.totp_enabled.is_(True)).scalar() or 0
    google = db.query(func.count(U.id)).filter(STUDENT, U.google_sub.isnot(None)).scalar() or 0
    password = db.query(func.count(U.id)).filter(STUDENT, U.password_hash.isnot(None)).scalar() or 0
    both = db.query(func.count(U.id)).filter(STUDENT, U.google_sub.isnot(None), U.password_hash.isnot(None)).scalar() or 0

    last_seen = dict(db.query(models.UserSession.user_id, func.max(models.UserSession.created_at)).group_by(models.UserSession.user_id).all())
    ids = [r[0] for r in db.query(U.id).filter(STUDENT).all()]
    buckets = {"today": 0, "week": 0, "month": 0, "older": 0, "never": 0}
    for uid in ids:
        ts = last_seen.get(uid)
        if ts is None:
            buckets["never"] += 1
        elif now - ts <= timedelta(days=1):
            buckets["today"] += 1
        elif now - ts <= timedelta(days=7):
            buckets["week"] += 1
        elif now - ts <= timedelta(days=30):
            buckets["month"] += 1
        else:
            buckets["older"] += 1

    by_section = db.query(models.Section.name, func.count(U.id)).join(U, U.section_id == models.Section.id).filter(STUDENT).group_by(models.Section.id, models.Section.name).order_by(func.count(U.id).desc()).limit(12).all()
    by_uni = db.query(models.University.name, func.count(U.id)).join(U, U.university_id == models.University.id).filter(STUDENT).group_by(models.University.id, models.University.name).order_by(func.count(U.id).desc()).limit(12).all()
    by_stage = (db.query(models.Stage.name, models.University.name, func.count(U.id))
                .join(U, U.stage_id == models.Stage.id).join(models.University, models.University.id == models.Stage.university_id)
                .filter(STUDENT).group_by(models.Stage.id, models.Stage.name, models.University.name).order_by(func.count(U.id).desc()).limit(12).all())
    top = (db.query(U.full_name, func.count(SA.id), _correct_sum())
           .join(SA, SA.user_id == U.id).filter(STUDENT, SA.answered_at >= start)
           .group_by(U.id, U.full_name).order_by(func.count(SA.id).desc()).limit(10).all())
    return {
        "days": days, "total": total, "new": new, "active": active, "verified": verified, "graduates": graduates,
        "profile_incomplete": no_profile, "banned": banned, "with_2fa": with_2fa,
        "signup_method": {"google": google, "password": password, "both": both},
        "last_seen": buckets,
        "daily_signups": _daily(db, U.created_at, func.count(), days, STUDENT),
        "by_section": _rows(by_section, "name", "count"),
        "by_university": _rows(by_uni, "name", "count"),
        "by_stage": [{"name": f"{s} — {u}", "count": c} for s, u, c in by_stage],
        "top_students": [{"name": n, "answers": a, "accuracy": _pct(int(c or 0), a)} for n, a, c in top],
    }


# ------------------------------------------------------------------ learning
@router.get("/learning")
def learning_stats(days: int = Query(30, ge=1, le=365), db: Session = Depends(get_db)):
    start = _start(days)
    answers, correct = db.query(func.count(SA.id), _correct_sum()).filter(SA.answered_at >= start).one()
    answers, correct = int(answers or 0), int(correct or 0)
    hours = dict(db.query(_hour_expr(db, SA.answered_at), func.count(SA.id)).filter(SA.answered_at >= start).group_by(_hour_expr(db, SA.answered_at)).all())
    by_hour = [{"hour": h, "count": int(hours.get(h, hours.get(f"{h:02d}", hours.get(float(h), 0))) or 0)} for h in range(24)]

    per_subject = (db.query(models.Subject.name, func.count(SA.id), _correct_sum(), func.count(func.distinct(SA.user_id)))
                   .join(Q, Q.subject_id == models.Subject.id).join(SA, SA.question_id == Q.id)
                   .filter(SA.answered_at >= start).group_by(models.Subject.id, models.Subject.name).all())
    subj = [{"name": n, "answers": a, "accuracy": _pct(int(c or 0), a), "students": s} for n, a, c, s in per_subject]
    hardest_subjects = sorted([x for x in subj if x["answers"] >= 20], key=lambda x: x["accuracy"] if x["accuracy"] is not None else 101)[:8]

    qrows = (db.query(Q.text, models.Subject.name, func.count(SA.id), _correct_sum())
             .join(SA, SA.question_id == Q.id).join(models.Subject, models.Subject.id == Q.subject_id)
             .filter(SA.answered_at >= start).group_by(Q.id, Q.text, models.Subject.name).having(func.count(SA.id) >= 5).all())
    hardest_questions = sorted(
        [{"text": (t or "")[:110], "subject": s, "attempts": a, "accuracy": _pct(int(c or 0), a)} for t, s, a, c in qrows],
        key=lambda x: x["accuracy"])[:10]

    qtypes = dict(db.query(Q.qtype, func.count(Q.id)).group_by(Q.qtype).all())
    with_image = db.query(func.count(Q.id)).filter(Q.image_url.isnot(None), Q.image_url != "").scalar() or 0
    bank_by_subject = db.query(models.Subject.name, func.count(Q.id)).join(Q, Q.subject_id == models.Subject.id).group_by(models.Subject.id, models.Subject.name).order_by(func.count(Q.id).desc()).limit(10).all()

    EA = models.ExamAttempt
    att = db.query(func.count(EA.id)).filter(EA.started_at >= start).scalar() or 0
    fin = db.query(func.count(EA.id)).filter(EA.started_at >= start, EA.finished_at.isnot(None)).scalar() or 0
    sc, tot = db.query(func.coalesce(func.sum(EA.score), 0), func.coalesce(func.sum(EA.total), 0)).filter(EA.started_at >= start, EA.finished_at.isnot(None)).one()
    by_exam = (db.query(models.Exam.title, models.Exam.exam_type, func.count(EA.id), func.coalesce(func.sum(EA.score), 0), func.coalesce(func.sum(EA.total), 0))
               .join(EA, EA.exam_id == models.Exam.id).filter(EA.started_at >= start)
               .group_by(models.Exam.id, models.Exam.title, models.Exam.exam_type).order_by(func.count(EA.id).desc()).limit(10).all())
    by_type = db.query(models.Exam.exam_type, func.count(EA.id)).join(EA, EA.exam_id == models.Exam.id).filter(EA.started_at >= start).group_by(models.Exam.exam_type).all()

    LP = models.LectureProgress
    completions = db.query(func.count(LP.id)).filter(LP.completed_at >= start).scalar() or 0
    top_lectures = (db.query(models.Lecture.title, models.Course.title, func.count(LP.id))
                    .join(LP, LP.lecture_id == models.Lecture.id).join(models.Course, models.Course.id == models.Lecture.course_id)
                    .filter(LP.completed_at >= start).group_by(models.Lecture.id, models.Lecture.title, models.Course.title)
                    .order_by(func.count(LP.id).desc()).limit(8).all())
    return {
        "days": days, "answers": answers, "accuracy": _pct(correct, answers),
        "daily_answers": _daily(db, SA.answered_at, func.count(), days),
        "daily_correct": _daily(db, SA.answered_at, _correct_sum(), days),
        "by_hour": by_hour,
        "top_subjects": sorted(subj, key=lambda x: -x["answers"])[:10],
        "hardest_subjects": hardest_subjects,
        "hardest_questions": hardest_questions,
        "bank": {
            "total": db.query(func.count(Q.id)).scalar() or 0, "with_image": with_image,
            "by_type": {"mcq": qtypes.get("mcq", 0), "true_false": qtypes.get("true_false", 0), "essay": qtypes.get("essay", 0)},
            "by_subject": _rows(bank_by_subject, "name", "count"),
            "saved_by_students": db.query(func.count(models.SavedQuestion.id)).scalar() or 0,
        },
        "exams": {
            "total": db.query(func.count(models.Exam.id)).scalar() or 0, "attempts": att, "finished": fin,
            "avg_score": _pct(int(sc or 0), int(tot or 0)),
            "by_type": {t or "mcq": c for t, c in by_type},
            "top": [{"title": t, "type": ty, "attempts": a, "avg": _pct(int(s or 0), int(tt or 0))} for t, ty, a, s, tt in by_exam],
        },
        "courses": {
            "courses": db.query(func.count(models.Course.id)).scalar() or 0, "lectures": db.query(func.count(models.Lecture.id)).scalar() or 0,
            "booklets": db.query(func.count(models.Booklet.id)).scalar() or 0, "completions": completions,
            "top_lectures": [{"name": f"{l} — {c}", "count": n} for l, c, n in top_lectures],
        },
    }


# ------------------------------------------------------------------- doctors
@router.get("/doctors")
def doctors_stats(days: int = Query(30, ge=1, le=365), db: Session = Depends(get_db)):
    start = _start(days)
    PP = models.ProfessorProfile
    profiles = db.query(PP.id, U.full_name, models.Subject.name).join(U, U.id == PP.user_id).join(models.Subject, models.Subject.id == PP.subject_id).all()
    q_count = dict(db.query(Q.professor_id, func.count(Q.id)).group_by(Q.professor_id).all())
    e_count = dict(db.query(models.Exam.professor_id, func.count(models.Exam.id)).group_by(models.Exam.professor_id).all())
    b_count = dict(db.query(models.Booklet.professor_id, func.count(models.Booklet.id)).group_by(models.Booklet.professor_id).all())
    c_count = dict(db.query(models.Course.professor_id, func.count(models.Course.id)).group_by(models.Course.professor_id).all())
    l_count = dict(db.query(models.Course.professor_id, func.count(models.Lecture.id)).join(models.Lecture, models.Lecture.course_id == models.Course.id).group_by(models.Course.professor_id).all())
    act = {pid: (a, int(c or 0), s) for pid, a, c, s in
           db.query(Q.professor_id, func.count(SA.id), _correct_sum(), func.count(func.distinct(SA.user_id)))
           .join(SA, SA.question_id == Q.id).filter(SA.answered_at >= start, Q.professor_id.isnot(None)).group_by(Q.professor_id).all()}
    ex_att = dict(db.query(models.Exam.professor_id, func.count(models.ExamAttempt.id)).join(models.ExamAttempt, models.ExamAttempt.exam_id == models.Exam.id).filter(models.ExamAttempt.started_at >= start).group_by(models.Exam.professor_id).all())
    rows = []
    for pid, name, subject in profiles:
        a, c, s = act.get(pid, (0, 0, 0))
        rows.append({"name": name, "subject": subject, "questions": q_count.get(pid, 0), "exams": e_count.get(pid, 0),
                     "booklets": b_count.get(pid, 0), "courses": c_count.get(pid, 0), "lectures": l_count.get(pid, 0),
                     "answers": a, "accuracy": _pct(c, a), "students": s, "exam_attempts": ex_att.get(pid, 0)})
    rows.sort(key=lambda r: (-r["answers"], -r["questions"]))
    doctors_total = db.query(func.count(U.id)).filter(U.role == models.Role.professor).scalar() or 0
    with_profile = db.query(func.count(func.distinct(PP.user_id))).scalar() or 0
    return {
        "days": days, "doctors": doctors_total, "assistants": db.query(func.count(U.id)).filter(U.role == models.Role.assistant).scalar() or 0,
        "doctors_without_subject": max(0, doctors_total - with_profile), "profiles": len(profiles),
        "pearls": db.query(func.count(models.ClinicalPearl.id)).scalar() or 0,
        "rows": rows[:30],
    }


# --------------------------------------------------------------------- store
@router.get("/store")
def store_stats(days: int = Query(30, ge=1, le=365), db: Session = Depends(get_db)):
    start = _start(days)
    O = models.Order
    paid = O.status.in_([models.OrderStatus.paid, models.OrderStatus.fulfilled])
    revenue, orders = db.query(func.coalesce(func.sum(O.total), 0), func.count(O.id)).filter(paid, O.created_at >= start).one()
    total_revenue = db.query(func.coalesce(func.sum(O.total), 0)).filter(paid).scalar() or 0
    by_status = {(s.value if hasattr(s, "value") else str(s)): c for s, c in db.query(O.status, func.count(O.id)).filter(O.created_at >= start).group_by(O.status).all()}
    OI = models.OrderItem
    top_products = (db.query(models.Product.name, func.coalesce(func.sum(OI.qty), 0), func.coalesce(func.sum(OI.price * OI.qty), 0))
                    .join(OI, OI.product_id == models.Product.id).join(O, O.id == OI.order_id).filter(paid, O.created_at >= start)
                    .group_by(models.Product.id, models.Product.name).order_by(func.sum(OI.price * OI.qty).desc()).limit(8).all())
    AC = models.ActivationCode
    code_status = {(s.value if hasattr(s, "value") else str(s)): c for s, c in db.query(AC.status, func.count(AC.id)).group_by(AC.status).all()}
    activated = db.query(func.count(AC.id)).filter(AC.activated_at >= start).scalar() or 0
    vip = db.query(func.count(AC.id)).filter(AC.subject_id.is_(None)).scalar() or 0
    held = {rid: n for rid, n in db.query(AC.reseller_id, func.count(AC.id)).filter(AC.reseller_id.isnot(None)).group_by(AC.reseller_id).all()}
    sold = {rid: n for rid, n in db.query(AC.reseller_id, func.count(AC.id)).filter(AC.reseller_id.isnot(None), AC.sold_at.isnot(None)).group_by(AC.reseller_id).all()}
    sold_period = {rid: n for rid, n in db.query(AC.reseller_id, func.count(AC.id)).filter(AC.reseller_id.isnot(None), AC.sold_at >= start).group_by(AC.reseller_id).all()}
    resellers = [{"name": r.full_name, "held": held.get(r.id, 0), "sold": sold.get(r.id, 0), "sold_period": sold_period.get(r.id, 0), "quota": r.code_quota}
                 for r in db.query(U).filter(U.role == models.Role.reseller).all()]
    resellers.sort(key=lambda r: -r["sold"])
    VB, VC = models.VerificationBatch, models.VerificationCode
    v_total = db.query(func.count(VC.id)).scalar() or 0
    v_used = db.query(func.count(VC.id)).filter(VC.used_by_user_id.isnot(None)).scalar() or 0
    v_used_period = db.query(func.count(VC.id)).filter(VC.used_at >= start).scalar() or 0
    return {
        "days": days, "revenue": int(revenue or 0), "orders": orders, "avg_order": int(revenue / orders) if orders else 0,
        "total_revenue": int(total_revenue), "orders_by_status": by_status,
        "daily_revenue": _daily(db, O.created_at, func.coalesce(func.sum(O.total), 0), days, paid),
        "top_products": [{"name": n, "qty": int(q), "revenue": int(r)} for n, q, r in top_products],
        "codes": {"by_status": code_status, "activated": activated, "vip": vip, "total": sum(code_status.values())},
        "daily_activations": _daily(db, AC.activated_at, func.count(), days),
        "resellers": resellers[:20],
        "verification": {"batches": db.query(func.count(VB.id)).scalar() or 0, "codes": v_total, "used": v_used, "used_rate": _pct(v_used, v_total), "used_period": v_used_period},
    }


# ------------------------------------------------------------------ security
@router.get("/security")
def security_stats(days: int = Query(30, ge=1, le=365), db: Session = Depends(get_db)):
    start = _start(days)
    S = models.UserSession
    now = datetime.utcnow()
    sessions = db.query(func.count(S.id)).filter(S.created_at >= start).scalar() or 0
    users = db.query(func.count(func.distinct(S.user_id))).filter(S.created_at >= start).scalar() or 0
    ips = db.query(func.count(func.distinct(S.ip_address))).filter(S.created_at >= start, S.ip_address.isnot(None)).scalar() or 0
    devices = db.query(S.device_label, func.count(S.id)).filter(S.created_at >= start).group_by(S.device_label).order_by(func.count(S.id).desc()).limit(8).all()
    shared_ips = (db.query(S.ip_address, func.count(func.distinct(S.user_id)))
                  .filter(S.created_at >= start, S.ip_address.isnot(None)).group_by(S.ip_address)
                  .having(func.count(func.distinct(S.user_id)) >= 3).order_by(func.count(func.distinct(S.user_id)).desc()).limit(10).all())
    many_ips = (db.query(U.full_name, U.email, func.count(func.distinct(S.ip_address)), func.count(S.id))
                .join(S, S.user_id == U.id).filter(S.created_at >= start, S.ip_address.isnot(None))
                .group_by(U.id, U.full_name, U.email).having(func.count(func.distinct(S.ip_address)) >= 3)
                .order_by(func.count(func.distinct(S.ip_address)).desc()).limit(10).all())
    B = models.BanRecord
    ban_status = {(s.value if hasattr(s, "value") else str(s)): c for s, c in db.query(B.status, func.count(B.id)).group_by(B.status).all()}
    reasons = db.query(B.reason, func.count(B.id)).group_by(B.reason).order_by(func.count(B.id).desc()).limit(6).all()
    staff = [models.Role.owner, models.Role.admin, models.Role.supervisor, models.Role.store_manager]
    return {
        "days": days, "sessions": sessions, "users": users, "ips": ips,
        "daily_sessions": _daily(db, S.created_at, func.count(), days),
        "devices": _rows(devices, "name", "count"),
        "shared_ips": [{"name": ip, "count": n} for ip, n in shared_ips],
        "many_ips": [{"name": f"{n} ({e})", "ips": i, "logins": l} for n, e, i, l in many_ips],
        "bans": {"by_status": ban_status, "in_period": db.query(func.count(B.id)).filter(B.created_at >= start).scalar() or 0,
                 "appeals": db.query(func.count(B.id)).filter(B.appealed_at.isnot(None), B.status != models.BanStatus.lifted).scalar() or 0,
                 "reasons": _rows(reasons, "name", "count")},
        "locked_now": db.query(func.count(U.id)).filter(U.locked_until.isnot(None), U.locked_until > now).scalar() or 0,
        "staff_without_2fa": db.query(func.count(U.id)).filter(U.role.in_(staff), U.totp_enabled.isnot(True)).scalar() or 0,
        "staff_total": db.query(func.count(U.id)).filter(U.role.in_(staff)).scalar() or 0,
    }
