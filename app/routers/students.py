from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import models, ranking
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/students", tags=["students"])


@router.get("/search")
def search_students(q: str = "", limit: int = Query(20, ge=1, le=50), db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
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


@router.get("/{student_id}/profile")
def get_student_profile(student_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """The public profile card shown when tapping a student from search or
    the leaderboard — name, caption, photo, skills, rank, and streak. Never
    exposes email, phone, or anything else private."""
    target = db.get(models.User, student_id)
    if not target or target.role != models.Role.student:
        raise HTTPException(404, "الطالب غير موجود")

    ranked = ranking.ranked_pairs(db, ranking.peer_ids(db, target))
    skills = db.query(models.UserSkill).filter(models.UserSkill.user_id == target.id).order_by(models.UserSkill.created_at).all()

    return {
        "id": target.id,
        "full_name": target.full_name,
        "caption": target.caption,
        "photo_url": target.photo_url,
        "skills": [s.text for s in skills],
        "rank": ranking.rank_of(ranked, target.id),
        "total_ranked": len(ranked),
        "streak_days": ranking.streak_days(db, target.id),
        "correct_count": next((score for uid, score in ranked if uid == target.id), 0),
    }
