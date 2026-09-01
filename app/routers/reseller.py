import secrets

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
    # The code itself is a reseller's own inventory — they need to read it out
    # to actually hand it to a buyer. What stays hidden is *who* redeemed it
    # (per the SRS: no student-data access) — this response never names them.
    return [
        {
            "id": c.id,
            "code": c.code,
            "status": c.status,
            "subject_name": c.subject.name if c.subject_id else "VIP — جميع المواد",
            "sold_at": c.sold_at,
        }
        for c in codes
    ]


@router.post("/codes")
def take_codes(
    count: int = 1,
    subject_id: str | None = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Self-service version of the admin's "توليد أكواد" action — the
    reseller dashboard's "أخذ كود" button. Mints idle codes straight into
    the caller's own inventory, no admin step in between."""
    _require_reseller(user)
    if not (1 <= count <= 100):
        raise HTTPException(400, "العدد يجب أن يكون بين 1 و100")
    if subject_id and not db.get(models.Subject, subject_id):
        raise HTTPException(404, "المادة غير موجودة")

    codes = []
    for _ in range(count):
        code_str = f"NBD-{secrets.token_hex(3).upper()}"
        db.add(models.ActivationCode(
            code=code_str, subject_id=subject_id,
            status=models.CodeStatus.idle, reseller_id=user.id,
        ))
        codes.append(code_str)
    db.commit()
    return {"codes": codes}
