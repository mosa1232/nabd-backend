from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/catalog", tags=["catalog"])


@router.get("/tree", response_model=list[schemas.SectionOut])
def get_catalog_tree(db: Session = Depends(get_db)):
    sections = (
        db.query(models.Section)
        .options(
            joinedload(models.Section.universities)
            .joinedload(models.University.stages)
            .joinedload(models.Stage.subjects)
        )
        .all()
    )
    return sections


@router.get("/mine")
def my_catalog(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Everything the signed-in student needs to study, resolved from the
    college / university / stage saved on their profile — so the app never
    has to ask them to pick these again. `stages` lists the other stages of
    their university for the one-tap stage switch."""
    if not user.university_id:
        raise HTTPException(400, "أكمل بياناتك أولاً")
    university = db.get(models.University, user.university_id)
    section = db.get(models.Section, user.section_id) if user.section_id else None
    stages = (
        db.query(models.Stage)
        .filter(models.Stage.university_id == user.university_id)
        .all()
    )
    current = next((s for s in stages if s.id == user.stage_id), None)
    subjects = (
        db.query(models.Subject).filter(models.Subject.stage_id == current.id).all()
        if current else []
    )
    return {
        "section": {"id": section.id, "name": section.name} if section else None,
        "university": {"id": university.id, "name": university.name} if university else None,
        "stage": {"id": current.id, "name": current.name} if current else None,
        "subjects": [{"id": s.id, "name": s.name} for s in subjects],
        "stages": [{"id": s.id, "name": s.name} for s in stages],
    }
