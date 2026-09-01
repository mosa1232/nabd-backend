import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/store", tags=["store"])

CODE_VALIDITY_DAYS = 365  # matches app/routers/activation.py's redemption window


@router.get("/products", response_model=list[schemas.ProductOut])
def list_products(db: Session = Depends(get_db)):
    return db.query(models.Product).all()


@router.post("/orders", response_model=schemas.OrderOut)
def create_order(
    body: schemas.OrderIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if not body.items:
        raise HTTPException(400, "السلة فارغة")

    products = {p.id: p for p in db.query(models.Product).filter(
        models.Product.id.in_([i.product_id for i in body.items])
    ).all()}

    has_physical = False
    total = 0
    order_items = []
    for item in body.items:
        product = products.get(item.product_id)
        if not product:
            raise HTTPException(404, f"منتج غير موجود: {item.product_id}")
        if product.type == models.ProductType.physical:
            has_physical = True
        total += product.price * item.qty
        order_items.append(models.OrderItem(product_id=product.id, qty=item.qty, price=product.price))

    # Mirrors the spec: COD is only ever valid when the cart has a physical item.
    if body.payment_method == "cod" and not has_physical:
        raise HTTPException(400, "الدفع عند الاستلام متاح فقط للطلبات التي تحوي منتجات ملموسة")

    # Physical items need somewhere to actually ship to.
    if has_physical and not (body.delivery_name and body.delivery_phone and body.delivery_address):
        raise HTTPException(400, "معلومات التوصيل (الاسم، الهاتف، العنوان) مطلوبة للطلبات التي تحوي منتجات ملموسة")

    order = models.Order(
        user_id=user.id,
        total=total,
        payment_method=body.payment_method,
        status=models.OrderStatus.pending,
        delivery_name=body.delivery_name if has_physical else None,
        delivery_phone=body.delivery_phone if has_physical else None,
        delivery_address=body.delivery_address if has_physical else None,
    )
    order.items = order_items
    db.add(order)

    # This prototype has no real payment-gateway callback, so — same as the
    # rest of the checkout flow — a placed order is treated as good to go:
    # activation-code products issue a real, already-activated code right away.
    granted_codes: list[str] = []
    for item in body.items:
        product = products[item.product_id]
        if not product.is_activation_code:
            continue
        for _ in range(item.qty):
            code_str = f"NBD-{secrets.token_hex(3).upper()}"
            db.add(models.ActivationCode(
                code=code_str,
                subject_id=product.grants_subject_id,
                status=models.CodeStatus.active,
                activated_by_user_id=user.id,
                activated_at=datetime.utcnow(),
                expires_at=datetime.utcnow() + timedelta(days=CODE_VALIDITY_DAYS),
            ))
            granted_codes.append(code_str)

    db.commit()
    db.refresh(order)
    result = schemas.OrderOut.model_validate(order, from_attributes=True)
    result.granted_activation_codes = granted_codes
    return result
