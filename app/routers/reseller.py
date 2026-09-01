from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/reseller", tags=["reseller"])


def _require_reseller(user: models.User) -> None:
    if user.role != models.Role.reseller:
        raise HTTPException(403, "هذه الواجهة مخصصة للمندوبين فقط")


@router.get("/summary")
def summary(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    _require_reseller(user)
    codes = db.query(models.ActivationCode).filter(models.ActivationCode.reseller_id == user.id).all()
    sold = [c for c in codes if c.sold_at is not None]
    activated = [c for c in codes if c.status == models.CodeStatus.active]
    return {
        "available": len(codes) - len(sold),
        "sold": len(sold),
        "activated": len(activated),
    }


@router.get("/codes")
def my_codes(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    _require_reseller(user)
    codes = (
        db.query(models.ActivationCode)
        .filter(models.ActivationCode.reseller_id == user.id)
        .order_by(models.ActivationCode.sold_at.desc().nullslast())
        .all()
    )
    # Codes are masked — a reseller can see they were sold/activated, never
    # the student who redeemed them (per the SRS: no student-data access).
    return [
        {
            "id": c.id,
            "code_masked": c.code[:4] + "••••",
            "status": c.status,
            "sold_at": c.sold_at,
        }
        for c in codes
    ]
