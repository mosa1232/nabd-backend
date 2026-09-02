from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/students", tags=["students"])


@router.get("/search")
def search_students(q: str = "", limit: int = 20, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Powers the student-directory search — any logged-in account can look
    up a student by name and open their public profile card."""
    query = db.query(models.User).filter(models.User.role == models.Role.student)
    term = q.strip()
    if term:
        query = query.filter(models.User.full_name.ilike(f"%{term}%"))
    students = query.order_by(models.User.full_name).limit(limit).all()
    return [
        {"id": s.id, "full_name": s.full_name, "photo_url": s.photo_url, "caption": s.caption}
        for s in students
    ]


def _streak_days(db: Session, user_id: str) -> int:
    answer_dates = db.query(models.StudentAnswer.answered_at).filter(models.StudentAnswer.user_id == user_id).all()
    days_with_answers = {row[0].date() for row in answer_dates}
    cursor = datetime.utcnow().date()
    if cursor not in days_with_answers:
        cursor -= timedelta(days=1)
    streak = 0
    while cursor in days_with_answers:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


@router.get("/{student_id}/profile")
def get_student_profile(student_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """The public profile card shown when tapping a student from search or
    the leaderboard — name, caption, photo, skills, rank, and streak. Never
    exposes email, phone, or anything else private."""
    target = db.get(models.User, student_id)
    if not target or target.role != models.Role.student:
        raise HTTPException(404, "الطالب غير موجود")

    peers_q = db.query(models.User).filter(models.User.role == models.Role.student)
    if target.university_id:
        peers_q = peers_q.filter(models.User.university_id == target.university_id)
    peers = peers_q.all()

    correct_by_user: dict[str, int] = {}
    answers = db.query(models.StudentAnswer).filter(
        models.StudentAnswer.user_id.in_([p.id for p in peers])
    ).all()
    for a in answers:
        if a.is_correct:
            correct_by_user[a.user_id] = correct_by_user.get(a.user_id, 0) + 1

    ranked = sorted(peers, key=lambda s: (-correct_by_user.get(s.id, 0), s.id))
    rank = next((i + 1 for i, s in enumerate(ranked) if s.id == target.id), None)

    skills = db.query(models.UserSkill).filter(models.UserSkill.user_id == target.id).order_by(models.UserSkill.created_at).all()

    return {
        "id": target.id,
        "full_name": target.full_name,
        "caption": target.caption,
        "photo_url": target.photo_url,
        "skills": [s.text for s in skills],
        "rank": rank,
        "total_ranked": len(ranked),
        "streak_days": _streak_days(db, target.id),
        "correct_count": correct_by_user.get(target.id, 0),
    }
