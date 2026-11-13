"""Verification codes: reading a roster out of an Excel file and minting codes.

A representative uploads an .xlsx of student names; every name gets its own
single-use code. The student later types that code to verify their account,
which ties them to the right university / college / stage and to the name on
the roster.
"""
from __future__ import annotations

import re
import secrets
from io import BytesIO

from fastapi import HTTPException
from openpyxl import load_workbook

MAX_ROWS = 5000
MAX_BYTES = 5 * 1024 * 1024
MAX_NAME_LEN = 120

# 31 characters: no 0/O, 1/I/L — a code read aloud or copied by hand must not
# be ambiguous. 31^8 ≈ 8.5e11 combinations.
ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
CODE_LEN = 8

_HEADER_NAMES = {
    "الاسم", "الاسم الكامل", "اسم الطالب", "اسم", "الاسم الثلاثي", "الاسم الرباعي",
    "name", "full name", "fullname", "student", "student name", "names",
}
_CONTROL = re.compile(r"[\x00-\x1f\x7f-\x9f​-‏‪-‮⁦-⁩]")


def generate_code() -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(CODE_LEN))


def format_code(code: str) -> str:
    return f"{code[:4]}-{code[4:]}"


def normalize_code(raw: str) -> str:
    """What a student types → what is stored (case, dashes and spaces ignored)."""
    return re.sub(r"[^A-Za-z0-9]", "", raw or "").upper()


def clean_name(value) -> str:
    text = _CONTROL.sub("", str(value if value is not None else "")).strip()
    text = re.sub(r"\s+", " ", text)
    return text[:MAX_NAME_LEN]


def _name_key(name: str) -> str:
    return re.sub(r"\s+", " ", name).strip().casefold()


def parse_names(data: bytes) -> tuple[list[str], list[str]]:
    """Returns (unique names in file order, duplicate names that were skipped).

    The first column is used, or the column titled "الاسم" / "Name" if the
    sheet has a header row. Blank rows, bare numbers (row counters) and
    one-letter cells are ignored."""
    if not data:
        raise HTTPException(400, "الملف فارغ")
    if len(data) > MAX_BYTES:
        raise HTTPException(400, "الملف أكبر من 5 ميغابايت")
    if not data.startswith(b"PK"):   # an .xlsx is a zip; an old .xls or a renamed file is not
        raise HTTPException(400, "الملف ليس بصيغة Excel الحديثة (.xlsx) — احفظه من Excel بصيغة .xlsx")
    try:
        wb = load_workbook(BytesIO(data), read_only=True, data_only=True)
        ws = wb.worksheets[0]
        rows = ws.iter_rows(values_only=True)
        first = next(rows, None)
    except Exception:
        raise HTTPException(400, "تعذّرت قراءة ملف Excel — تأكد أنه سليم وغير محمي بكلمة سر")
    if first is None:
        raise HTTPException(400, "الملف لا يحتوي على بيانات")

    col = 0
    header_hit = [i for i, v in enumerate(first) if clean_name(v).casefold() in _HEADER_NAMES]
    pending = []
    if header_hit:
        col = header_hit[0]
    else:
        pending.append(first)          # no header row: the first row is data too

    names, dupes, seen = [], [], set()
    def take(row):
        if row is None or col >= len(row):
            return
        name = clean_name(row[col])
        if len(name) < 2 or name.replace(" ", "").isdigit():
            return
        key = _name_key(name)
        if key in seen:
            dupes.append(name)
            return
        seen.add(key)
        names.append(name)

    for r in pending:
        take(r)
    for i, r in enumerate(rows):
        if i > MAX_ROWS * 4:
            raise HTTPException(400, "الملف كبير جدًا")
        take(r)
        if len(names) > MAX_ROWS:
            raise HTTPException(400, f"الحد الأقصى {MAX_ROWS} اسم في الملف الواحد — قسّمه إلى عدة ملفات")
    if not names:
        raise HTTPException(400, "لم أجد أسماء في الملف — ضع الأسماء في العمود الأول (أو تحت عنوان «الاسم»)")
    return names, dupes
