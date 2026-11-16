import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/store", tags=["store"])

CODE_VALIDITY_DAYS = 365  # matches app/routers/activation.py's redemption window


@router.get("/categories", response_model=list[schemas.StoreCategoryOut])
def list_categories(db: Session = Depends(get_db)):
    """The store's sections, for the filter chips on the student store page."""
    return db.query(models.StoreCategory).order_by(models.StoreCategory.sort_order, models.StoreCategory.name).all()


@router.get("/products", response_model=list[schemas.ProductOut])
def list_products(category_id: str | None = None, db: Session = Depends(get_db)):
    q = db.query(models.Product)
    if category_id:
        q = q.filter(models.Product.category_id == category_id)
    return q.all()


@router.get("/orders")
def my_orders(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """The signed-in student's own orders, newest first, with the activation
    codes a paid order produced (so they can copy a code without asking anyone)."""
    orders = db.query(models.Order).filter(models.Order.user_id == user.id).order_by(models.Order.created_at.desc()).limit(100).all()
    ids = [o.id for o in orders]
    codes = {}
    if ids:
        for c in db.query(models.ActivationCode).filter(models.ActivationCode.order_id.in_(ids)).all():
            codes.setdefault(c.order_id, []).append({
                "code": c.code, "status": c.status.value if hasattr(c.status, "value") else str(c.status),
                "subject": c.subject.name if c.subject_id and c.subject else None,
            })
    return [{
        "id": o.id, "total": o.total, "status": o.status.value if hasattr(o.status, "value") else str(o.status),
        "payment_method": o.payment_method, "created_at": o.created_at,
        "delivery": {"name": o.delivery_name, "phone": o.delivery_phone, "address": o.delivery_address} if o.delivery_address else None,
        "items": [{"name": i.product.name if i.product else "منتج محذوف", "qty": i.qty, "price": i.price} for i in o.items],
        "codes": codes.get(o.id, []),
    } for o in orders]


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
    db.commit()
    db.refresh(order)

    # No activation codes are granted here. There's no payment-gateway
    # callback yet, so a freshly placed order is exactly that — unpaid.
    # Codes are issued by issue_codes_for_paid_order() once an admin marks
    # the order paid/fulfilled; until then a student can place all the
    # orders they like without unlocking anything.
    return schemas.OrderOut.model_validate(order, from_attributes=True)


def issue_codes_for_paid_order(db: Session, order: models.Order) -> list[str]:
    """Issues the activation codes an order paid for. Idempotent: an order
    that already produced codes never produces more, so flipping its status
    back and forth in the admin panel can't mint free VIP access."""
    already = db.query(models.ActivationCode).filter(models.ActivationCode.order_id == order.id).first()
    if already:
        return []

    granted: list[str] = []
    for item in order.items:
        product = db.get(models.Product, item.product_id)
        if not product or not product.is_activation_code:
            continue
        for _ in range(item.qty):
            code_str = f"NBD-{secrets.token_hex(3).upper()}"
            db.add(models.ActivationCode(
                code=code_str,
                subject_id=product.grants_subject_id,
                status=models.CodeStatus.active,
                activated_by_user_id=order.user_id,
                activated_at=datetime.utcnow(),
                expires_at=datetime.utcnow() + timedelta(days=CODE_VALIDITY_DAYS),
                order_id=order.id,
            ))
            granted.append(code_str)
    db.commit()
    return granted
