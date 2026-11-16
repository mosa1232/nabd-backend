"""Back-office listings that need server-side filtering and paging: the student
register and the activity log. (Ban/notification/media upgrades live in
admin.py next to the endpoints they extend.)"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..deps import admin_gate

router = APIRouter(prefix="/api/admin", tags=["admin-ops"], dependencies=[Depends(admin_gate)])

U = models.User
SA = models.StudentAnswer


@router.get("/students/list")
def students_list(
    q: str = "", university_id: str = "", stage_id: str = "", status: str = "all", sort: str = "joined",
    page: int = Query(1, ge=1), per_page: int = Query(30, ge=5, le=100), db: Session = Depends(get_db),
):
    """The student register: filter, sort and page on the server (a platform can
    have tens of thousands of students). status: all | active | banned |
    verified | unverified | incomplete | inactive."""
    answers = (db.query(SA.user_id.label("uid"), func.count(SA.id).label("n"),
                        func.sum(case((SA.is_correct.is_(True), 1), else_=0)).label("ok"), func.max(SA.answered_at).label("last_answer"))
               .group_by(SA.user_id).subquery())
    seen = db.query(models.UserSession.user_id.label("uid"), func.max(models.UserSession.created_at).label("last_login")).group_by(models.UserSession.user_id).subquery()
    base = (db.query(U, answers.c.n, answers.c.ok, answers.c.last_answer, seen.c.last_login)
            .outerjoin(answers, answers.c.uid == U.id).outerjoin(seen, seen.c.uid == U.id)
            .filter(U.role == models.Role.student))

    term = (q or "").strip()
    if term:
        like = f"%{term}%"
        base = base.filter(or_(U.full_name.ilike(like), U.email.ilike(like), U.phone.ilike(like), U.username.ilike(like)))
    if university_id:
        base = base.filter(U.university_id == university_id)
    if stage_id:
        base = base.filter(U.stage_id == stage_id)
    week = datetime.utcnow() - timedelta(days=7)
    month = datetime.utcnow() - timedelta(days=30)
    if status == "banned":
        base = base.filter(U.is_banned.is_(True))
    elif status == "verified":
        base = base.filter(U.verified_at.isnot(None))
    elif status == "unverified":
        base = base.filter(U.verified_at.is_(None))
    elif status == "incomplete":
        base = base.filter(U.university_id.is_(None))
    elif status == "active":
        base = base.filter(answers.c.last_answer >= week)
    elif status == "inactive":
        base = base.filter(or_(answers.c.last_answer.is_(None), answers.c.last_answer < month))

    total = base.count()
    order = {
        "name": U.full_name.asc(),
        "answers": func.coalesce(answers.c.n, 0).desc(),
        "accuracy": (func.coalesce(answers.c.ok, 0) * 1.0 / func.nullif(answers.c.n, 0)).desc().nullslast(),
        "seen": seen.c.last_login.desc().nullslast(),
        "joined": U.created_at.desc(),
    }.get(sort, U.created_at.desc())
    rows = base.order_by(order, U.id).offset((page - 1) * per_page).limit(per_page).all()

    uni = {u.id: u.name for u in db.query(models.University.id, models.University.name).all()}
    stg = {s.id: s.name for s in db.query(models.Stage.id, models.Stage.name).all()}
    items = []
    for u, n, ok, last_answer, last_login in rows:
        n = int(n or 0)
        items.append({
            "id": u.id, "name": u.full_name, "email": u.email, "phone": u.phone,
            "university": uni.get(u.university_id), "stage": stg.get(u.stage_id), "graduate": bool(u.is_graduate),
            "answers": n, "accuracy": round(100 * int(ok or 0) / n) if n else None,
            "last_seen": last_login or last_answer, "joined": u.created_at,
            "verified": u.verified_at is not None, "banned": bool(u.is_banned),
        })

    S = U.role == models.Role.student
    summary = {
        "total": db.query(func.count(U.id)).filter(S).scalar() or 0,
        "banned": db.query(func.count(U.id)).filter(S, U.is_banned.is_(True)).scalar() or 0,
        "verified": db.query(func.count(U.id)).filter(S, U.verified_at.isnot(None)).scalar() or 0,
        "incomplete": db.query(func.count(U.id)).filter(S, U.university_id.is_(None)).scalar() or 0,
        "active_week": db.query(func.count(func.distinct(SA.user_id))).filter(SA.answered_at >= week).scalar() or 0,
    }
    return {"total": total, "page": page, "pages": max(1, -(-total // per_page)), "items": items, "summary": summary}


@router.get("/logs/search")
def logs_search(
    q: str = "", days: int = Query(0, ge=0, le=3650), user_id: str = "",
    offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db),
):
    L = models.ActivityLog
    query = db.query(L, U.full_name, U.email, U.role).outerjoin(U, U.id == L.user_id)
    if days:
        query = query.filter(L.created_at >= datetime.utcnow() - timedelta(days=days))
    if user_id:
        query = query.filter(L.user_id == user_id)
    term = (q or "").strip()
    if term:
        like = f"%{term}%"
        query = query.filter(or_(L.action.ilike(like), U.full_name.ilike(like), U.email.ilike(like), L.ip_address.ilike(like)))
    total = query.count()
    rows = query.order_by(L.created_at.desc()).offset(offset).limit(limit).all()
    return {
        "total": total, "offset": offset,
        "items": [{"id": l.id, "at": l.created_at, "action": l.action, "ip": l.ip_address, "user_id": l.user_id,
                   "user": name, "email": email, "role": role.value if role else None} for l, name, email, role in rows],
    }
