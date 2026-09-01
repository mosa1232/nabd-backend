from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db

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
