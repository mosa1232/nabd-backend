"""Shared ranking / streak helpers.

These used to be copy-pasted across three endpoints (/auth/me/stats,
/auth/leaderboard and /api/students/{id}/profile), and every copy loaded
*every answer row of every student in the university* into Python just to
count correct answers — 2.5M rows on a 5k-student university, on every home
screen load. They're aggregates now: the database does the counting.
"""
from datetime import date, datetime, timedelta

from sqlalchemy import case, distinct, func
from sqlalchemy.orm import Session

from . import models


def peer_ids(db: Session, user: models.User) -> list[str]:
    """The student's ranking cohort — their own university when they have
    one, otherwise every student on the platform."""
    q = db.query(models.User.id).filter(models.User.role == models.Role.student)
    if user.university_id:
        q = q.filter(models.User.university_id == user.university_id)
    return [row[0] for row in q.all()]


def correct_counts(db: Session, user_ids: list[str]) -> dict[str, int]:
    """{user_id: number of DISTINCT questions answered correctly}.

    Distinct on purpose: scoring raw rows let a student answer one easy
    question hundreds of times to climb the leaderboard.
    """
    if not user_ids:
        return {}
    rows = (
        db.query(
            models.StudentAnswer.user_id,
            func.count(distinct(models.StudentAnswer.question_id)),
        )
        .filter(
            models.StudentAnswer.user_id.in_(user_ids),
            models.StudentAnswer.is_correct.is_(True),
        )
        .group_by(models.StudentAnswer.user_id)
        .all()
    )
    return {user_id: count for user_id, count in rows}


def accuracy_pct(db: Session, user_id: str) -> int | None:
    """Share of this student's answers that were correct, as a whole
    percentage. None when they haven't answered anything yet — the caller
    shows a dash rather than an invented 0%.

    Per attempt, not per distinct question: a student who missed the same
    question six times and finally got it should not read as 100%. (Ranking
    still counts distinct questions — see correct_counts — because there the
    risk is farming one easy question, not flattering the accuracy figure.)
    """
    total, correct = (
        db.query(
            func.count(models.StudentAnswer.id),
            func.sum(case((models.StudentAnswer.is_correct.is_(True), 1), else_=0)),
        )
        .filter(models.StudentAnswer.user_id == user_id)
        .one()
    )
    if not total:
        return None
    return round(100 * (correct or 0) / total)


def ranked_pairs(db: Session, user_ids: list[str]) -> list[tuple[str, int]]:
    """[(user_id, score)] ordered best-first, ties broken by id for stability."""
    scores = correct_counts(db, user_ids)
    return sorted(((uid, scores.get(uid, 0)) for uid in user_ids), key=lambda p: (-p[1], p[0]))


def rank_of(ranked: list[tuple[str, int]], user_id: str) -> int | None:
    return next((i + 1 for i, (uid, _) in enumerate(ranked) if uid == user_id), None)


def streak_days(db: Session, user_id: str) -> int:
    """Consecutive days up to today with at least one answer. Selects the
    distinct answer *dates* rather than pulling every timestamp."""
    # func.date(), not CAST(... AS DATE). Both backends have a date()
    # function, but SQLite's CAST AS DATE is a trap: with no real date type
    # it applies numeric affinity and returns 2026 for '2026-08-31 07:02:32'.
    # date() returns '2026-08-31' on SQLite and a real date on PostgreSQL,
    # which is why the loop below still normalises both shapes.
    day = func.date(models.StudentAnswer.answered_at).label("day")
    rows = (
        db.query(day)
        .filter(models.StudentAnswer.user_id == user_id)
        .distinct()
        .all()
    )
    days: set[date] = set()
    for (value,) in rows:
        if value is None:
            continue
        # SQLite's date() returns a string; Postgres returns a real date.
        days.add(value if isinstance(value, date) else datetime.strptime(str(value)[:10], "%Y-%m-%d").date())

    cursor = datetime.utcnow().date()
    if cursor not in days:
        cursor -= timedelta(days=1)  # today isn't a broken streak until it ends
    streak = 0
    while cursor in days:
        streak += 1
        cursor -= timedelta(days=1)
    return streak
