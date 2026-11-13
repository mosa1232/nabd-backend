import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..deps import get_current_user, user_permissions
from .admin import _daily_counts

router = APIRouter(prefix="/api/reseller", tags=["reseller"])


def _require_reseller(user: models.User, perm: str) -> None:
    """A reseller can do only what the store manager granted them — viewing
    their codes/sales (codes.view) and minting new ones (codes.generate)."""
    if user.role != models.Role.reseller:
        raise HTTPException(403, "هذه الواجهة مخصصة للمندوبين فقط")
    if perm not in user_permissions(user):
        raise HTTPException(403, "لا تملك صلاحية لهذا الإجراء — اطلبها من مدير المتجر")


@router.get("/me")
def my_access(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """What this reseller may do and how much quota is left — the dashboard
    uses it to show or hide the buttons."""
    if user.role != models.Role.reseller:
        raise HTTPException(403, "هذه الواجهة مخصصة للمندوبين فقط")
    held = db.query(models.ActivationCode).filter(models.ActivationCode.reseller_id == user.id).count()
    return {
        "permissions": sorted(p for p in user_permissions(user) if p.startswith("codes.")),
        "code_quota": user.code_quota,
        "codes_held": held,
        "quota_left": None if user.code_quota is None else max(user.code_quota - held, 0),
    }


@router.get("/summary")
def summary(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    _require_reseller(user, "codes.view")
    codes = db.query(models.ActivationCode).filter(models.ActivationCode.reseller_id == user.id).all()
    sold = [c for c in codes if c.sold_at is not None]
    activated = [c for c in codes if c.status == models.CodeStatus.active]
    return {
        "available": len(codes) - len(sold),
        "sold": len(sold),
        "activated": len(activated),
        # Real per-day sales for this reseller — the dashboard chart was a
        # hardcoded array labelled "(توضيحي)" before.
        "weekly_sales": _daily_counts(
            db,
            models.ActivationCode,
            models.ActivationCode.sold_at,
            extra_filter=models.ActivationCode.reseller_id == user.id,
        ),
    }


@router.get("/codes")
def my_codes(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    _require_reseller(user, "codes.view")
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
    the caller's own inventory, no admin step in between — within the
    quota the store manager set for this reseller."""
    _require_reseller(user, "codes.generate")
    if not (1 <= count <= 100):
        raise HTTPException(400, "العدد يجب أن يكون بين 1 و100")
    if subject_id and not db.get(models.Subject, subject_id):
        raise HTTPException(404, "المادة غير موجودة")
    if user.code_quota is not None:
        held = db.query(models.ActivationCode).filter(models.ActivationCode.reseller_id == user.id).count()
        if held + count > user.code_quota:
            raise HTTPException(400, f"تجاوزت الحد المسموح لك ({user.code_quota} كود) — المتبقي {max(user.code_quota - held, 0)}")

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
