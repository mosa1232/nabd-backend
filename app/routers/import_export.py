import io
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from openpyxl import Workbook, load_workbook
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..deps import admin_gate

router = APIRouter(prefix="/api/admin", tags=["import-export"], dependencies=[Depends(admin_gate)])

STUDENT_HEADERS = ["الاسم الكامل", "البريد الإلكتروني", "الجامعة", "المرحلة"]
QUESTION_HEADERS = ["المادة", "نص السؤال"]   # only used to recognise (and refuse) an old questions sheet


def _xlsx_response(wb: Workbook, filename: str) -> StreamingResponse:
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    # Content-Disposition headers must be Latin-1 — an Arabic filename needs
    # the RFC 5987 filename* form, with a plain ASCII name as fallback.
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=\"export.xlsx\"; filename*=UTF-8''{quote(filename)}"},
    )


# ---------------------------------------------------------------- templates
@router.get("/import/template/students")
def students_template():
    wb = Workbook()
    ws = wb.active
    ws.title = "طلاب"
    ws.append(STUDENT_HEADERS)
    ws.append(["مثال: زهراء علي", "zahra.example@uob.edu.iq", "جامعة بغداد", "المرحلة الثانية"])
    return _xlsx_response(wb, "قالب طلاب.xlsx")


# ------------------------------------------------------------------- export
@router.get("/export")
def export_data(datasets: str, db: Session = Depends(get_db)):
    """datasets: comma-separated subset of students,questions,orders,logs"""
    wanted = {d.strip() for d in datasets.split(",") if d.strip()}
    wb = Workbook()
    wb.remove(wb.active)

    if "students" in wanted:
        ws = wb.create_sheet("الطلاب")
        ws.append(["الاسم", "البريد الإلكتروني", "الجامعة", "المرحلة", "محظور"])
        for s in db.query(models.User).filter(models.User.role == models.Role.student).all():
            ws.append([
                s.full_name, s.email,
                s.university.name if s.university else "",
                s.stage.name if s.stage else "",
                "نعم" if s.is_banned else "لا",
            ])

    if "questions" in wanted:
        ws = wb.create_sheet("الأسئلة")
        ws.append(["المادة", "نص السؤال", "الخيارات", "الإجابة الصحيحة"])
        for q in db.query(models.Question).all():
            choices_text = " | ".join(c.text for c in q.choices)
            correct = next((c.text for c in q.choices if c.is_correct), "")
            ws.append([q.subject.name if q.subject else "", q.text, choices_text, correct])

    if "orders" in wanted:
        ws = wb.create_sheet("الطلبات")
        ws.append(["رقم الطلب", "المستخدم", "الإجمالي", "طريقة الدفع", "الحالة", "التاريخ"])
        for o in db.query(models.Order).all():
            user = db.get(models.User, o.user_id)
            ws.append([
                o.id, user.full_name if user else "", o.total, o.payment_method, o.status,
                o.created_at.strftime("%Y-%m-%d %H:%M") if o.created_at else "",
            ])

    if "logs" in wanted:
        ws = wb.create_sheet("سجل النشاطات")
        ws.append(["الوقت", "المستخدم", "الإجراء", "IP"])
        logs = db.query(models.ActivityLog).order_by(models.ActivityLog.created_at.desc()).limit(500).all()
        for entry in logs:
            user = db.get(models.User, entry.user_id) if entry.user_id else None
            ws.append([
                entry.created_at.strftime("%Y-%m-%d %H:%M") if entry.created_at else "",
                user.full_name if user else "", entry.action, entry.ip_address,
            ])

    if not wb.sheetnames:
        ws = wb.create_sheet("بيانات")
        ws.append(["لم يتم تحديد أي بيانات للتصدير"])

    return _xlsx_response(wb, "نبض-تصدير.xlsx")


# ------------------------------------------------------------------- import
def _import_students(db: Session, rows) -> dict:
    created, skipped, errors = 0, 0, []
    for i, row in enumerate(rows, start=2):
        if not row or not any(row):
            continue
        padded = list(row) + [None] * 4
        name, email, uni_name, stage_name = padded[:4]
        if not email or not name:
            errors.append(f"صف {i}: الاسم أو البريد الإلكتروني ناقص")
            continue
        email = str(email).strip()
        if db.query(models.User).filter(models.User.email == email).first():
            skipped += 1
            continue
        university = (
            db.query(models.University).filter(models.University.name == str(uni_name).strip()).first()
            if uni_name else None
        )
        stage = (
            db.query(models.Stage).filter(models.Stage.name == str(stage_name).strip()).first()
            if stage_name else None
        )
        db.add(models.User(
            email=email, full_name=str(name).strip(), role=models.Role.student,
            university_id=university.id if university else None,
            stage_id=stage.id if stage else None,
        ))
        created += 1
    db.commit()
    return {"kind": "students", "created": created, "skipped": skipped, "errors": errors}


@router.post("/import")
async def import_data(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Single dropzone for both templates — detects which one was uploaded
    from its header row rather than making the admin pick a file type."""
    try:
        wb = load_workbook(io.BytesIO(await file.read()), read_only=True)
    except Exception:
        # Not a readable .xlsx (wrong extension, corrupt, empty upload)
        raise HTTPException(400, "الملف غير صالح — ارفعي ملف Excel (.xlsx) من القوالب المتاحة")
    ws = wb.active
    header_row = next(ws.iter_rows(min_row=1, max_row=1, values_only=True), None)
    header = [str(h).strip() if h else "" for h in (header_row or [])]

    if header[:2] == STUDENT_HEADERS[:2]:
        rows = list(ws.iter_rows(min_row=2, values_only=True))
        return _import_students(db, rows)
    if header[:2] == QUESTION_HEADERS[:2]:
        raise HTTPException(403, "رفع الأسئلة من اختصاص الدكاترة ومساعديهم — من صفحة «أسئلتي» في حساب الدكتور")
    raise HTTPException(400, "تنسيق الملف غير معروف — استخدمي أحد القوالب المتاحة للتنزيل")
