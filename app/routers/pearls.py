"""Clinical pearls — short clinical cases with a gated body.

Two read endpoints, deliberately separate:

- /preview  is public. It exists for the landing page, where a visitor who
            hasn't signed up yet sees that real cases exist without being
            handed their content. The response has no `body` field at all,
            so the gate holds against anyone reading the network tab — a
            CSS blur on the client would not.
- ""        needs a session and returns the full case.

Creating and editing them is admin work and lives in routers/admin.py with
the rest of the admin CRUD.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/pearls", tags=["clinical-pearls"])


@router.get("/preview", response_model=list[schemas.ClinicalPearlPreviewOut])
def preview_pearls(limit: int = Query(3, ge=1, le=12), db: Session = Depends(get_db)):
    """Titles only, newest first. No auth — this is what the landing page
    teases to a visitor who hasn't signed in."""
    return (
        db.query(models.ClinicalPearl)
        .order_by(models.ClinicalPearl.created_at.desc())
        .limit(limit)
        .all()
    )


def _visible_to(query, user: models.User):
    """A student sees the pearls of their own college plus the ones marked
    for every college. Staff (admin/professor/…) see everything."""
    if user.role != models.Role.student:
        return query
    if user.section_id:
        return query.filter(or_(
            models.ClinicalPearl.section_id == user.section_id,
            models.ClinicalPearl.section_id.is_(None),
        ))
    return query.filter(models.ClinicalPearl.section_id.is_(None))


@router.get("", response_model=list[schemas.ClinicalPearlOut])
def list_pearls(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    return (
        _visible_to(db.query(models.ClinicalPearl), user)
        .order_by(models.ClinicalPearl.created_at.desc())
        .all()
    )


@router.get("/{pearl_id}", response_model=schemas.ClinicalPearlOut)
def get_pearl(pearl_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    pearl = _visible_to(db.query(models.ClinicalPearl), user).filter(models.ClinicalPearl.id == pearl_id).first()
    if not pearl:
        raise HTTPException(404, "اللمحة غير موجودة")
    return pearl
