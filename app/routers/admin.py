import secrets
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..deps import require_role
from ..security import hash_password

VALID_ROLES = {r.value for r in models.Role}

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20MB — plenty for booklets/slide images in this prototype
MAX_VIDEO_BYTES = 150 * 1024 * 1024  # 150MB — real lecture videos need more room than a PDF/photo

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_role("admin"))])


@router.get("/overview")
def overview(db: Session = Depends(get_db)):
    total_students = db.query(models.User).filter(models.User.role == models.Role.student).count()
    active_activations = db.query(models.ActivationCode).filter(
        models.ActivationCode.status == models.CodeStatus.active
    ).count()
    pending_bans = db.query(models.BanRecord).filter(
        models.BanRecord.status == models.BanStatus.active
    ).count()
    total_orders = db.query(func.coalesce(func.sum(models.Order.total), 0)).scalar()
    return {
        "total_students": total_students,
        "active_activations": active_activations,
        "pending_bans": pending_bans,
        "revenue_total": int(total_orders or 0),
    }


@router.get("/users", response_model=list[schemas.UserOut])
def list_users(role: str | None = None, db: Session = Depends(get_db)):
    q = db.query(models.User)
    if role:
        q = q.filter(models.User.role == role)
    return q.all()


@router.post("/users", response_model=schemas.UserOut)
def create_user(body: schemas.UserCreateIn, db: Session = Depends(get_db)):
    if body.role not in VALID_ROLES:
        raise HTTPException(400, "دور غير صالح")
    if db.query(models.User).filter(models.User.email == body.email.strip()).first():
        raise HTTPException(400, "البريد الإلكتروني مستخدم مسبقاً")
    user = models.User(
        email=body.email.strip(),
        full_name=body.full_name.strip(),
        role=body.role,
        password_hash=hash_password(body.password) if body.password else None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}", response_model=schemas.UserOut)
def update_user(user_id: str, body: schemas.UserUpdateIn, db: Session = Depends(get_db)):
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(404, "المستخدم غير موجود")
    if body.role not in VALID_ROLES:
        raise HTTPException(400, "دور غير صالح")
    dup = db.query(models.User).filter(models.User.email == body.email.strip(), models.User.id != user_id).first()
    if dup:
        raise HTTPException(400, "البريد الإلكتروني مستخدم مسبقاً من حساب آخر")
    user.email = body.email.strip()
    user.full_name = body.full_name.strip()
    user.role = body.role
    if body.password:
        user.password_hash = hash_password(body.password)
    db.commit()
    db.refresh(user)
    return user


@router.post("/resellers/{reseller_id}/codes")
def generate_reseller_codes(
    reseller_id: str,
    count: int = 1,
    subject_id: str | None = None,
    db: Session = Depends(get_db),
):
    """Mints new idle activation codes and assigns them to a reseller — the
    Accounts screen's "توليد أكواد" action. Codes stay idle (unsold) until
    the reseller actually hands one out and a student redeems it."""
    reseller = db.get(models.User, reseller_id)
    if not reseller or reseller.role != models.Role.reseller:
        raise HTTPException(404, "المندوب غير موجود")
    if not (1 <= count <= 100):
        raise HTTPException(400, "العدد يجب أن يكون بين 1 و100")
    if subject_id and not db.get(models.Subject, subject_id):
        raise HTTPException(404, "المادة غير موجودة")

    codes = []
    for _ in range(count):
        code_str = f"NBD-{secrets.token_hex(3).upper()}"
        db.add(models.ActivationCode(
            code=code_str, subject_id=subject_id,
            status=models.CodeStatus.idle, reseller_id=reseller_id,
        ))
        codes.append(code_str)
    db.commit()
    return {"codes": codes}


@router.get("/resellers/{reseller_id}/codes")
def list_reseller_codes_admin(reseller_id: str, db: Session = Depends(get_db)):
    """Unmasked view of a reseller's code inventory — lets an admin actually
    read out an idle code to hand a student directly, instead of only seeing
    the reseller's own masked view (••••)."""
    reseller = db.get(models.User, reseller_id)
    if not reseller or reseller.role != models.Role.reseller:
        raise HTTPException(404, "المندوب غير موجود")
    codes = (
        db.query(models.ActivationCode)
        .filter(models.ActivationCode.reseller_id == reseller_id)
        .order_by(models.ActivationCode.status, models.ActivationCode.sold_at.desc().nullslast())
        .all()
    )
    return [
        {
            "id": c.id, "code": c.code, "status": c.status,
            "subject_name": c.subject.name if c.subject_id else "VIP — جميع المواد",
            "sold_at": c.sold_at,
        }
        for c in codes
    ]


@router.post("/users/{user_id}/ban")
def ban_user(user_id: str, reason: str, db: Session = Depends(get_db)):
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(404, "المستخدم غير موجود")
    user.is_banned = True
    db.add(models.BanRecord(user_id=user_id, reason=reason, status=models.BanStatus.active))
    db.commit()
    return {"ok": True}


@router.post("/users/{user_id}/unban")
def unban_user(user_id: str, db: Session = Depends(get_db)):
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(404, "المستخدم غير موجود")
    user.is_banned = False
    db.query(models.BanRecord).filter(
        models.BanRecord.user_id == user_id,
        models.BanRecord.status == models.BanStatus.active,
    ).update({"status": models.BanStatus.lifted})
    db.commit()
    return {"ok": True}


@router.post("/users/{user_id}/2fa/reset")
def reset_2fa(user_id: str, db: Session = Depends(get_db)):
    """Safety net for someone locked out of their own account (lost phone,
    uninstalled the authenticator app, etc.) — an admin can turn 2FA back
    off for them since there's no recovery-code system."""
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(404, "المستخدم غير موجود")
    user.totp_enabled = False
    user.totp_secret = None
    db.commit()
    return {"ok": True}


@router.get("/logs")
def list_logs(limit: int = 50, db: Session = Depends(get_db)):
    logs = (
        db.query(models.ActivityLog)
        .order_by(models.ActivityLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {"id": l.id, "user_id": l.user_id, "action": l.action, "ip_address": l.ip_address, "created_at": l.created_at}
        for l in logs
    ]


@router.get("/bans")
def list_bans(db: Session = Depends(get_db)):
    bans = db.query(models.BanRecord).order_by(models.BanRecord.created_at.desc()).all()
    out = []
    for b in bans:
        user = db.get(models.User, b.user_id)
        out.append({
            "id": b.id, "user_id": b.user_id, "user_name": user.full_name if user else "—",
            "reason": b.reason, "status": b.status, "created_at": b.created_at,
            "appeal_message": b.appeal_message, "appealed_at": b.appealed_at,
        })
    return out


@router.post("/bans/{ban_id}/approve-appeal")
def approve_appeal(ban_id: str, db: Session = Depends(get_db)):
    """Upholds the appeal — lifts the ban entirely."""
    record = db.get(models.BanRecord, ban_id)
    if not record:
        raise HTTPException(404, "سجل الحظر غير موجود")
    record.status = models.BanStatus.lifted
    user = db.get(models.User, record.user_id)
    if user:
        user.is_banned = False
    db.commit()
    return {"ok": True}


@router.post("/bans/{ban_id}/reject-appeal")
def reject_appeal(ban_id: str, db: Session = Depends(get_db)):
    """Denies the appeal — the account stays banned."""
    record = db.get(models.BanRecord, ban_id)
    if not record:
        raise HTTPException(404, "سجل الحظر غير موجود")
    record.status = models.BanStatus.active
    db.commit()
    return {"ok": True}


@router.get("/catalog")
def admin_catalog(db: Session = Depends(get_db)):
    """Flat, indented view of the section > university > stage > subject
    tree with content counts — what the Catalog Manager screen renders.
    Each row carries its own id so the UI can attach new children to it."""
    rows = []
    for section in db.query(models.Section).all():
        unis = db.query(models.University).filter(models.University.section_id == section.id).all()
        rows.append({"id": section.id, "level": 0, "type": "section", "name": section.name, "meta": f"{len(unis)} جامعة"})
        for uni in unis:
            stages = db.query(models.Stage).filter(models.Stage.university_id == uni.id).all()
            rows.append({"id": uni.id, "level": 1, "type": "university", "name": uni.name, "meta": f"{len(stages)} مرحلة"})
            for stage in stages:
                subjects = db.query(models.Subject).filter(models.Subject.stage_id == stage.id).all()
                rows.append({"id": stage.id, "level": 2, "type": "stage", "name": stage.name, "meta": f"{len(subjects)} مادة"})
                for subj in subjects:
                    q_count = db.query(models.Question).filter(models.Question.subject_id == subj.id).count()
                    rows.append({"id": subj.id, "level": 3, "type": "subject", "name": subj.name, "meta": f"{q_count} سؤال"})
    return rows


@router.post("/catalog/sections")
def create_section(name: str, db: Session = Depends(get_db)):
    s = models.Section(name=name.strip())
    db.add(s)
    db.commit()
    db.refresh(s)
    return {"id": s.id}


@router.post("/catalog/universities")
def create_university(name: str, section_id: str, db: Session = Depends(get_db)):
    if not db.get(models.Section, section_id):
        raise HTTPException(404, "القسم غير موجود")
    u = models.University(name=name.strip(), section_id=section_id)
    db.add(u)
    db.commit()
    db.refresh(u)
    return {"id": u.id}


@router.post("/catalog/stages")
def create_stage(name: str, university_id: str, db: Session = Depends(get_db)):
    if not db.get(models.University, university_id):
        raise HTTPException(404, "الجامعة غير موجودة")
    st = models.Stage(name=name.strip(), university_id=university_id)
    db.add(st)
    db.commit()
    db.refresh(st)
    return {"id": st.id}


@router.post("/catalog/subjects")
def create_subject(name: str, stage_id: str, db: Session = Depends(get_db)):
    if not db.get(models.Stage, stage_id):
        raise HTTPException(404, "المرحلة غير موجودة")
    subj = models.Subject(name=name.strip(), stage_id=stage_id)
    db.add(subj)
    db.commit()
    db.refresh(subj)
    return {"id": subj.id}


# ---------------------------------------------------- catalog rename/delete
# Deletes are blocked ("leaf-first") whenever real content still hangs off
# the node — safer than silently cascading through questions, professor
# profiles, courses, etc. that nothing in this schema cascade-deletes.
@router.put("/catalog/sections/{section_id}")
def rename_section(section_id: str, name: str, db: Session = Depends(get_db)):
    s = db.get(models.Section, section_id)
    if not s:
        raise HTTPException(404, "القسم غير موجود")
    s.name = name.strip()
    db.commit()
    return {"ok": True}


@router.delete("/catalog/sections/{section_id}")
def delete_section(section_id: str, db: Session = Depends(get_db)):
    s = db.get(models.Section, section_id)
    if not s:
        raise HTTPException(404, "القسم غير موجود")
    if db.query(models.University).filter(models.University.section_id == section_id).count():
        raise HTTPException(400, "لا يمكن حذف القسم — يحتوي على جامعات. احذفيها أولاً")
    db.delete(s)
    db.commit()
    return {"ok": True}


@router.put("/catalog/universities/{university_id}")
def rename_university(university_id: str, name: str, db: Session = Depends(get_db)):
    u = db.get(models.University, university_id)
    if not u:
        raise HTTPException(404, "الجامعة غير موجودة")
    u.name = name.strip()
    db.commit()
    return {"ok": True}


@router.delete("/catalog/universities/{university_id}")
def delete_university(university_id: str, db: Session = Depends(get_db)):
    u = db.get(models.University, university_id)
    if not u:
        raise HTTPException(404, "الجامعة غير موجودة")
    if db.query(models.Stage).filter(models.Stage.university_id == university_id).count():
        raise HTTPException(400, "لا يمكن حذف الجامعة — تحتوي على مراحل. احذفيها أولاً")
    db.delete(u)
    db.commit()
    return {"ok": True}


@router.put("/catalog/stages/{stage_id}")
def rename_stage(stage_id: str, name: str, db: Session = Depends(get_db)):
    st = db.get(models.Stage, stage_id)
    if not st:
        raise HTTPException(404, "المرحلة غير موجودة")
    st.name = name.strip()
    db.commit()
    return {"ok": True}


@router.delete("/catalog/stages/{stage_id}")
def delete_stage(stage_id: str, db: Session = Depends(get_db)):
    st = db.get(models.Stage, stage_id)
    if not st:
        raise HTTPException(404, "المرحلة غير موجودة")
    if db.query(models.Subject).filter(models.Subject.stage_id == stage_id).count():
        raise HTTPException(400, "لا يمكن حذف المرحلة — تحتوي على مواد. احذفيها أولاً")
    db.delete(st)
    db.commit()
    return {"ok": True}


@router.put("/catalog/subjects/{subject_id}")
def rename_subject(subject_id: str, name: str, db: Session = Depends(get_db)):
    subj = db.get(models.Subject, subject_id)
    if not subj:
        raise HTTPException(404, "المادة غير موجودة")
    subj.name = name.strip()
    db.commit()
    return {"ok": True}


@router.delete("/catalog/subjects/{subject_id}")
def delete_subject(subject_id: str, db: Session = Depends(get_db)):
    subj = db.get(models.Subject, subject_id)
    if not subj:
        raise HTTPException(404, "المادة غير موجودة")
    blockers = []
    if db.query(models.Question).filter(models.Question.subject_id == subject_id).count():
        blockers.append("أسئلة")
    if db.query(models.ProfessorProfile).filter(models.ProfessorProfile.subject_id == subject_id).count():
        blockers.append("ملفات دكاترة")
    if db.query(models.Course).filter(models.Course.subject_id == subject_id).count():
        blockers.append("كورسات")
    if db.query(models.Exam).filter(models.Exam.subject_id == subject_id).count():
        blockers.append("امتحانات")
    if blockers:
        raise HTTPException(400, f"لا يمكن حذف المادة — مرتبطة بـ: {', '.join(blockers)}. عالجي هذي أولاً")
    db.delete(subj)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- questions
@router.get("/questions", response_model=list[schemas.QuestionAdminOut])
def list_questions_admin(subject_id: str, db: Session = Depends(get_db)):
    return (
        db.query(models.Question)
        .options(joinedload(models.Question.choices))
        .filter(models.Question.subject_id == subject_id)
        .all()
    )


def _validate_choices(choices: list[schemas.ChoiceIn]):
    if len(choices) < 2:
        raise HTTPException(400, "يجب إضافة خيارين على الأقل")
    if not any(c.is_correct for c in choices):
        raise HTTPException(400, "يجب تحديد إجابة صحيحة واحدة على الأقل")


@router.post("/questions", response_model=schemas.QuestionAdminOut)
def create_question_admin(body: schemas.QuestionAdminIn, db: Session = Depends(get_db)):
    if not db.get(models.Subject, body.subject_id):
        raise HTTPException(404, "المادة غير موجودة")
    _validate_choices(body.choices)
    q = models.Question(
        subject_id=body.subject_id, text=body.text, eyebrow=body.eyebrow,
        rationale=body.rationale, image_url=body.image_url,
    )
    db.add(q)
    db.flush()
    for idx, c in enumerate(body.choices):
        db.add(models.Choice(question_id=q.id, text=c.text, is_correct=c.is_correct, order_index=idx))
    db.commit()
    db.refresh(q)
    return q


@router.put("/questions/{question_id}", response_model=schemas.QuestionAdminOut)
def update_question_admin(question_id: str, body: schemas.QuestionAdminIn, db: Session = Depends(get_db)):
    q = db.get(models.Question, question_id)
    if not q:
        raise HTTPException(404, "السؤال غير موجود")
    if not db.get(models.Subject, body.subject_id):
        raise HTTPException(404, "المادة غير موجودة")
    _validate_choices(body.choices)
    q.text = body.text
    q.eyebrow = body.eyebrow
    q.rationale = body.rationale
    q.image_url = body.image_url
    q.subject_id = body.subject_id
    db.query(models.Choice).filter(models.Choice.question_id == question_id).delete()
    for idx, c in enumerate(body.choices):
        db.add(models.Choice(question_id=q.id, text=c.text, is_correct=c.is_correct, order_index=idx))
    db.commit()
    db.refresh(q)
    return q


@router.delete("/questions/{question_id}")
def delete_question_admin(question_id: str, db: Session = Depends(get_db)):
    q = db.get(models.Question, question_id)
    if not q:
        raise HTTPException(404, "السؤال غير موجود")
    db.query(models.StudentAnswer).filter(models.StudentAnswer.question_id == question_id).delete()
    db.delete(q)  # Question.choices cascades via the ORM relationship
    db.commit()
    return {"ok": True}


@router.get("/weak-topics")
def weak_topics(limit: int = 5, db: Session = Depends(get_db)):
    """Powers the "أكثر نقاط الضعف شيوعاً" chart — real accuracy per topic
    (Question.eyebrow, falling back to the subject name) across every
    student's answers, instead of the old hardcoded bars."""
    rows = (
        db.query(models.StudentAnswer, models.Question)
        .join(models.Question, models.Question.id == models.StudentAnswer.question_id)
        .all()
    )
    by_topic: dict[str, list[bool]] = {}
    for answer, question in rows:
        topic = question.eyebrow or question.subject.name
        by_topic.setdefault(topic, []).append(answer.is_correct)

    result = [
        {"topic": topic, "weakness_pct": round(100 - 100 * sum(results) / len(results)), "sample_size": len(results)}
        for topic, results in by_topic.items()
    ]
    result.sort(key=lambda r: r["weakness_pct"], reverse=True)
    return result[:limit]


@router.get("/students")
def list_students(db: Session = Depends(get_db)):
    students = db.query(models.User).filter(models.User.role == models.Role.student).all()
    out = []
    for s in students:
        answers = db.query(models.StudentAnswer).filter(models.StudentAnswer.user_id == s.id).all()
        avg = round(100 * sum(a.is_correct for a in answers) / len(answers)) if answers else None
        out.append({
            "id": s.id, "name": s.full_name, "email": s.email,
            "university": s.university.name if s.university else "—",
            "stage": s.stage.name if s.stage else "—",
            "is_banned": s.is_banned,
            "avg_score": avg,
            "answered_count": len(answers),
        })
    return out


@router.get("/media")
def list_media(db: Session = Depends(get_db)):
    files = db.query(models.MediaFile).order_by(models.MediaFile.created_at.desc()).all()
    return [
        {"id": f.id, "filename": f.filename, "url": f.url, "content_type": f.content_type,
         "size_bytes": f.size_bytes, "created_at": f.created_at}
        for f in files
    ]


@router.post("/media")
def register_media(filename: str, url: str, content_type: str = "", size_bytes: int = 0,
                    db: Session = Depends(get_db)):
    """Registers metadata for a file already uploaded to storage (S3/etc) —
    for when a real cloud bucket is wired in later. See /media/upload below
    for the actual upload path this prototype uses today."""
    m = models.MediaFile(filename=filename, url=url, content_type=content_type, size_bytes=size_bytes)
    db.add(m)
    db.commit()
    db.refresh(m)
    return {"id": m.id}


@router.post("/media/upload")
async def upload_media(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: models.User = Depends(require_role("admin")),
):
    """Powers the Media screen's "رفع ملف" button — saves the file to local
    disk (served back via the /media-files static mount in app/main.py) and
    records its metadata. Good enough for this prototype; swap for a real
    object store (S3/etc) in production."""
    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(400, "الملف أكبر من الحد المسموح (20 ميغابايت)")

    safe_name = Path(file.filename or "file").name
    stored_name = f"{secrets.token_hex(8)}_{safe_name}"
    (UPLOAD_DIR / stored_name).write_bytes(contents)

    m = models.MediaFile(
        filename=safe_name,
        url=f"/media-files/{stored_name}",
        content_type=file.content_type or "",
        size_bytes=len(contents),
        uploaded_by=user.id,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return {"id": m.id, "url": m.url}


# ============================================================ ADMIN: store
VALID_PRODUCT_TYPES = {t.value for t in models.ProductType}


@router.get("/store/products", response_model=list[schemas.ProductAdminOut])
def list_products_admin(db: Session = Depends(get_db)):
    return db.query(models.Product).all()


@router.post("/store/products", response_model=schemas.ProductAdminOut)
def create_product(body: schemas.ProductIn, db: Session = Depends(get_db)):
    if body.type not in VALID_PRODUCT_TYPES:
        raise HTTPException(400, "نوع المنتج غير صالح")
    if body.grants_subject_id and not db.get(models.Subject, body.grants_subject_id):
        raise HTTPException(404, "المادة غير موجودة")
    product = models.Product(
        name=body.name.strip(), price=body.price, type=body.type,
        is_activation_code=body.is_activation_code, grants_subject_id=body.grants_subject_id,
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@router.put("/store/products/{product_id}", response_model=schemas.ProductAdminOut)
def update_product(product_id: str, body: schemas.ProductIn, db: Session = Depends(get_db)):
    product = db.get(models.Product, product_id)
    if not product:
        raise HTTPException(404, "المنتج غير موجود")
    if body.type not in VALID_PRODUCT_TYPES:
        raise HTTPException(400, "نوع المنتج غير صالح")
    if body.grants_subject_id and not db.get(models.Subject, body.grants_subject_id):
        raise HTTPException(404, "المادة غير موجودة")
    product.name = body.name.strip()
    product.price = body.price
    product.type = body.type
    product.is_activation_code = body.is_activation_code
    product.grants_subject_id = body.grants_subject_id
    db.commit()
    db.refresh(product)
    return product


@router.delete("/store/products/{product_id}")
def delete_product(product_id: str, db: Session = Depends(get_db)):
    product = db.get(models.Product, product_id)
    if not product:
        raise HTTPException(404, "المنتج غير موجود")
    if db.query(models.OrderItem).filter(models.OrderItem.product_id == product_id).count():
        raise HTTPException(400, "لا يمكن حذف منتج له طلبات مسجّلة")
    db.delete(product)
    db.commit()
    return {"ok": True}


@router.get("/store/orders", response_model=list[schemas.OrderAdminOut])
def list_orders_admin(db: Session = Depends(get_db)):
    orders = db.query(models.Order).order_by(models.Order.created_at.desc()).all()
    out = []
    for o in orders:
        buyer = db.get(models.User, o.user_id)
        out.append(schemas.OrderAdminOut(
            id=o.id,
            buyer_name=buyer.full_name if buyer else "—",
            buyer_email=buyer.email if buyer else "—",
            total=o.total,
            status=o.status,
            payment_method=o.payment_method,
            created_at=o.created_at,
            delivery_name=o.delivery_name,
            delivery_phone=o.delivery_phone,
            delivery_address=o.delivery_address,
            items=[
                schemas.OrderAdminItemOut(
                    product_name=item.product.name if item.product else "منتج محذوف",
                    qty=item.qty, price=item.price,
                )
                for item in o.items
            ],
        ))
    return out


@router.put("/store/orders/{order_id}/status")
def update_order_status(order_id: str, status: str, db: Session = Depends(get_db)):
    valid_statuses = {s.value for s in models.OrderStatus}
    if status not in valid_statuses:
        raise HTTPException(400, "حالة غير صالحة")
    order = db.get(models.Order, order_id)
    if not order:
        raise HTTPException(404, "الطلب غير موجود")
    order.status = status
    db.commit()
    return {"ok": True}


# ===================================================== ADMIN: notifications
@router.get("/notifications")
def list_notifications_admin(db: Session = Depends(get_db)):
    notifs = db.query(models.Notification).order_by(models.Notification.created_at.desc()).limit(50).all()
    return [
        {
            "id": n.id, "title": n.title, "body": n.body, "created_at": n.created_at,
            "user_id": n.user_id, "broadcast": n.user_id is None,
        }
        for n in notifs
    ]


@router.post("/notifications")
def send_notification(
    body: schemas.NotificationCreateIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_role("admin")),
):
    if body.user_id and not db.get(models.User, body.user_id):
        raise HTTPException(404, "المستخدم غير موجود")
    n = models.Notification(title=body.title.strip(), body=body.body.strip(), user_id=body.user_id, created_by=user.id)
    db.add(n)
    db.commit()
    db.refresh(n)
    return {"id": n.id, "title": n.title, "body": n.body, "created_at": n.created_at}

