"""The general representative (الممثل العام) of a college / stage.

Uploads an Excel of student names → one single-use code per name → downloads
the sheet (name + code) to hand out. Students then verify their accounts with
those codes (routers/verification.py). A representative only ever sees the
rosters of their own scope, and never any student's account data.
"""
from datetime import datetime
from io import BytesIO
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import codes as codelib
from .. import models
from ..database import get_db
from ..deps import get_current_user, user_permissions

router = APIRouter(prefix="/api/rep", tags=["representative"])


def _rep(user: models.User = Depends(get_current_user)) -> models.User:
    if user.role != models.Role.representative or "rep.codes" not in user_permissions(user):
        raise HTTPException(403, "هذه الواجهة مخصصة للممثل العام فقط")
    if not user.scope_university_id:
        raise HTTPException(400, "حسابك غير مرتبط بجامعة/كلية بعد — اطلب من المشرف تحديد نطاقك")
    return user


def _scope_labels(db: Session, user: models.User) -> dict:
    uni = db.get(models.University, user.scope_university_id)
    section = db.get(models.Section, uni.section_id) if uni else None
    stage = db.get(models.Stage, user.scope_stage_id) if user.scope_stage_id else None
    return {
        "university": uni.name if uni else "",
        "college": section.name if section else "",
        "stage": stage.name if stage else None,
    }


def _in_scope(batch: models.VerificationBatch, user: models.User) -> bool:
    if batch.university_id != user.scope_university_id:
        return False
    return user.scope_stage_id is None or batch.stage_id == user.scope_stage_id


def _own_batch(db: Session, user: models.User, batch_id: str) -> models.VerificationBatch:
    b = db.get(models.VerificationBatch, batch_id)
    if not b or not _in_scope(b, user):
        raise HTTPException(404, "الدفعة غير موجودة")
    return b


def _unique_codes(db: Session, n: int) -> list[str]:
    """n fresh codes, none of which exist yet."""
    out: set[str] = set()
    for _ in range(8):
        while len(out) < n:
            out.add(codelib.generate_code())
        taken = set()
        pool = list(out)
        for i in range(0, len(pool), 500):
            taken |= {c for (c,) in db.query(models.VerificationCode.code).filter(
                models.VerificationCode.code.in_(pool[i:i + 500])).all()}
        if not taken:
            return list(out)
        out -= taken
    raise HTTPException(500, "تعذّر توليد أكواد فريدة — حاول مرة أخرى")


def _xlsx(wb: Workbook, filename: str) -> StreamingResponse:
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=\"codes.xlsx\"; filename*=UTF-8''{quote(filename)}"},
    )


def _put(ws, row: list) -> None:
    """Appends a row with every text cell stored as a string. A student name
    like "=HYPERLINK(...)" must never become a live formula in Excel."""
    ws.append(row)
    for cell in ws[ws.max_row]:
        if isinstance(cell.value, str):
            cell.data_type = "s"


@router.get("/me")
def my_scope(db: Session = Depends(get_db), user: models.User = Depends(_rep)):
    labels = _scope_labels(db, user)
    stages = db.query(models.Stage).filter(models.Stage.university_id == user.scope_university_id).order_by(models.Stage.name).all()
    if user.scope_stage_id:
        stages = [s for s in stages if s.id == user.scope_stage_id]
    batch_ids = [b.id for b in db.query(models.VerificationBatch).filter(
        models.VerificationBatch.university_id == user.scope_university_id).all() if _in_scope(b, user)]
    total = used = 0
    if batch_ids:
        total = db.query(func.count(models.VerificationCode.id)).filter(models.VerificationCode.batch_id.in_(batch_ids)).scalar() or 0
        used = db.query(func.count(models.VerificationCode.id)).filter(
            models.VerificationCode.batch_id.in_(batch_ids), models.VerificationCode.used_by_user_id.isnot(None)).scalar() or 0
    return {**labels, "stages": [{"id": s.id, "name": s.name} for s in stages],
            "stage_locked": bool(user.scope_stage_id), "batches": len(batch_ids), "codes": total, "verified": used}


@router.get("/template")
def template(user: models.User = Depends(_rep)):
    wb = Workbook()
    ws = wb.active
    ws.title = "الأسماء"
    ws.append(["الاسم"])
    for n in ("مثال: زهراء علي حسين", "مثال: حسين كاظم محمد"):
        ws.append([n])
    return _xlsx(wb, "قالب أسماء الطلاب.xlsx")


@router.post("/batches")
async def create_batch(
    file: UploadFile = File(...),
    stage_id: str = Form(""),
    db: Session = Depends(get_db),
    user: models.User = Depends(_rep),
):
    """Reads the names out of the uploaded sheet and mints a code for each."""
    names, dupes = codelib.parse_names(await file.read())

    stage = None
    if user.scope_stage_id:
        stage = user.scope_stage_id                     # a stage-scoped rep can only use their stage
    elif stage_id:
        st = db.get(models.Stage, stage_id)
        if not st or st.university_id != user.scope_university_id:
            raise HTTPException(400, "المرحلة المختارة لا تتبع جامعتك/كليتك")
        stage = st.id

    batch = models.VerificationBatch(
        created_by=user.id, university_id=user.scope_university_id, stage_id=stage,
        filename=(file.filename or "")[:200], total=len(names),
    )
    db.add(batch)
    db.flush()
    for name, code in zip(names, _unique_codes(db, len(names))):
        db.add(models.VerificationCode(batch_id=batch.id, student_name=name, code=code))
    db.add(models.ActivityLog(user_id=user.id, action=f"توليد {len(names)} كود توثيق من ملف", ip_address=""))
    db.commit()
    return {"batch_id": batch.id, "total": len(names), "duplicates_skipped": len(dupes), "duplicate_names": dupes[:10]}


def _batch_row(db: Session, b: models.VerificationBatch) -> dict:
    used = db.query(func.count(models.VerificationCode.id)).filter(
        models.VerificationCode.batch_id == b.id, models.VerificationCode.used_by_user_id.isnot(None)).scalar() or 0
    stage = db.get(models.Stage, b.stage_id) if b.stage_id else None
    return {"id": b.id, "filename": b.filename, "stage": stage.name if stage else "كل المراحل",
            "total": b.total, "used": used, "created_at": b.created_at}


@router.get("/batches")
def list_batches(db: Session = Depends(get_db), user: models.User = Depends(_rep)):
    rows = db.query(models.VerificationBatch).filter(
        models.VerificationBatch.university_id == user.scope_university_id
    ).order_by(models.VerificationBatch.created_at.desc()).all()
    return [_batch_row(db, b) for b in rows if _in_scope(b, user)]


@router.get("/batches/{batch_id}")
def batch_detail(batch_id: str, db: Session = Depends(get_db), user: models.User = Depends(_rep)):
    b = _own_batch(db, user, batch_id)
    items = db.query(models.VerificationCode).filter(models.VerificationCode.batch_id == b.id).order_by(models.VerificationCode.student_name).all()
    return {**_batch_row(db, b), "codes": [
        {"id": c.id, "name": c.student_name, "code": codelib.format_code(c.code),
         "status": "revoked" if c.revoked else ("used" if c.used_by_user_id else "unused")}
        for c in items]}


@router.get("/batches/{batch_id}/download")
def download_batch(batch_id: str, db: Session = Depends(get_db), user: models.User = Depends(_rep)):
    b = _own_batch(db, user, batch_id)
    labels = _scope_labels(db, user)
    stage = db.get(models.Stage, b.stage_id) if b.stage_id else None
    wb = Workbook()
    ws = wb.active
    ws.title = "الأكواد"
    ws.sheet_view.rightToLeft = True
    _put(ws, ["الاسم", "الكود", "الجامعة", "الكلية", "المرحلة", "الحالة"])
    status = {"revoked": "ملغى", "used": "مستخدم", "unused": "غير مستخدم"}
    for c in db.query(models.VerificationCode).filter(models.VerificationCode.batch_id == b.id).order_by(models.VerificationCode.student_name).all():
        st = "revoked" if c.revoked else ("used" if c.used_by_user_id else "unused")
        _put(ws, [c.student_name, codelib.format_code(c.code), labels["university"], labels["college"],
                  stage.name if stage else "كل المراحل", status[st]])
    for col, w in zip("ABCDEF", (32, 14, 22, 22, 18, 14)):
        ws.column_dimensions[col].width = w
    db.add(models.ActivityLog(user_id=user.id, action="تنزيل ملف أكواد التوثيق", ip_address=""))
    db.commit()
    return _xlsx(wb, f"أكواد التوثيق {datetime.utcnow():%Y-%m-%d}.xlsx")


def _own_code(db: Session, user: models.User, code_id: str) -> models.VerificationCode:
    c = db.get(models.VerificationCode, code_id)
    if not c or not _in_scope(c.batch, user):
        raise HTTPException(404, "الكود غير موجود")
    return c


@router.post("/codes/{code_id}/revoke")
def revoke_code(code_id: str, db: Session = Depends(get_db), user: models.User = Depends(_rep)):
    c = _own_code(db, user, code_id)
    if c.used_by_user_id:
        raise HTTPException(400, "هذا الكود استُعمل فعلًا ولا يمكن إلغاؤه")
    c.revoked = True
    db.commit()
    return {"ok": True}


@router.post("/codes/{code_id}/regenerate")
def regenerate_code(code_id: str, db: Session = Depends(get_db), user: models.User = Depends(_rep)):
    """A lost or leaked code (not yet used) is replaced by a fresh one."""
    c = _own_code(db, user, code_id)
    if c.used_by_user_id:
        raise HTTPException(400, "هذا الكود استُعمل فعلًا ولا يمكن استبداله")
    c.code = _unique_codes(db, 1)[0]
    c.revoked = False
    db.commit()
    return {"code": codelib.format_code(c.code)}


@router.delete("/batches/{batch_id}")
def delete_batch(batch_id: str, db: Session = Depends(get_db), user: models.User = Depends(_rep)):
    b = _own_batch(db, user, batch_id)
    if db.query(models.VerificationCode).filter(models.VerificationCode.batch_id == b.id, models.VerificationCode.used_by_user_id.isnot(None)).count():
        raise HTTPException(400, "بعض أكواد هذه الدفعة استُعملت فلا يمكن حذفها — ألغِ الأكواد غير المستعملة بدل ذلك")
    db.query(models.VerificationCode).filter(models.VerificationCode.batch_id == b.id).delete()
    db.delete(b)
    db.commit()
    return {"ok": True}
