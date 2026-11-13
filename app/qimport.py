"""Reads questions out of an Excel sheet or a Word file a doctor uploaded.

Nothing here touches the database: both parsers return (drafts, errors) and the
doctor reviews the drafts before saving them through the normal bulk endpoint.
A draft has the same shape the AI generator produces:

    {"text", "qtype", "choices": [{"text", "is_correct"}], "rationale",
     "model_answer", "eyebrow"}

Word files are read with the standard library only (zipfile + ElementTree):
DOCTYPE/ENTITY declarations are refused and every size is capped, so a hostile
file cannot expand into memory.
"""
import io
import re
import zipfile
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape

from openpyxl import Workbook, load_workbook

MAX_QUESTIONS = 300
MAX_BYTES = 8 * 1024 * 1024
MAX_XML_BYTES = 20 * 1024 * 1024
MAX_TEXT, MAX_OPTION, MAX_LONG, MAX_OPTIONS = 2000, 500, 4000, 6

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
_ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")

HEADERS = ["نص السؤال", "النوع", "الخيار 1", "الخيار 2", "الخيار 3", "الخيار 4",
           "الإجابة الصحيحة", "الإجابة النموذجية", "الشرح", "العنوان الفرعي"]

TRUE_WORDS = {"صح", "صحيح", "true", "t", "yes", "نعم"}
FALSE_WORDS = {"خطا", "خطأ", "غلط", "false", "f", "no", "لا"}
LETTERS = {"أ": 0, "ا": 0, "ب": 1, "ج": 2, "د": 3, "ه": 4, "هـ": 4, "و": 5,
           "a": 0, "b": 1, "c": 2, "d": 3, "e": 4, "f": 5}


class ImportFileError(Exception):
    """The file as a whole is unusable (not an xlsx/docx, too big, unsafe)."""


# ------------------------------------------------------------------ helpers
def norm(s) -> str:
    s = str(s or "").strip().lower().translate(_ARABIC_DIGITS)
    for a, b in (("أ", "ا"), ("إ", "ا"), ("آ", "ا"), ("ى", "ي"), ("ة", "ه"), ("ـ", "")):
        s = s.replace(a, b)
    s = re.sub(r"[^\w\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _cell(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()


def _type_of(s: str):
    n = norm(s)
    if not n:
        return None
    if n in ("mcq", "اختيار من متعدد", "اختيار متعدد", "متعدد", "اختياري", "اختيارات"):
        return "mcq"
    if n in ("true false", "tf", "true_false", "صح وخطا", "صح او خطا", "صح خطا", "صح"):
        return "true_false"
    if n in ("essay", "مقالي", "مقال", "مقاليه"):
        return "essay"
    return "?"


def _truthy_token(tok: str):
    n = norm(tok)
    if n in TRUE_WORDS or n in {norm(w) for w in TRUE_WORDS}:
        return True
    if n in FALSE_WORDS or n in {norm(w) for w in FALSE_WORDS}:
        return False
    return None


def _resolve_correct(options: list[str], token: str) -> list[int] | None:
    """Option indexes named by a cell like "2", "1,3", "ب" or the option's text."""
    tok = token.strip().translate(_ARABIC_DIGITS)
    if not tok:
        return []
    parts = [p for p in re.split(r"[,،;؛\s]+", tok) if p]
    if parts and all(p.isdigit() for p in parts):
        idx = [int(p) - 1 for p in parts]
        return idx if all(0 <= i < len(options) for i in idx) else None
    if parts and all(p.lower() in LETTERS for p in parts):
        idx = [LETTERS[p.lower()] for p in parts]
        return idx if all(i < len(options) for i in idx) else None
    n = norm(tok)
    for i, o in enumerate(options):
        if norm(o) == n:
            return [i]
    return None


def build_question(where: str, text: str, type_hint, options: list[str], correct_tok: str,
                   marked: list[int], model_answer: str, rationale: str, eyebrow: str):
    """Turns raw fields into (draft, None) or (None, error message)."""
    text = (text or "").strip()
    if not text:
        return None, "نص السؤال فارغ"
    if len(text) > MAX_TEXT:
        return None, f"نص السؤال أطول من {MAX_TEXT} حرفًا"
    options = [o.strip() for o in options if o and o.strip()]
    if len(options) > MAX_OPTIONS:
        return None, f"عدد الخيارات أكثر من {MAX_OPTIONS}"
    if any(len(o) > MAX_OPTION for o in options):
        return None, f"أحد الخيارات أطول من {MAX_OPTION} حرفًا"
    if len(model_answer) > MAX_LONG or len(rationale) > MAX_LONG:
        return None, f"الشرح/الإجابة النموذجية أطول من {MAX_LONG} حرفًا"

    qtype = _type_of(type_hint) if type_hint else None
    if qtype == "?":
        return None, f"نوع السؤال غير معروف: «{type_hint}» (استخدم: اختيار من متعدد / صح وخطأ / مقالي)"
    if qtype is None:
        if {norm(o) for o in options} in ({"صح", "خطا"}, {"true", "false"}) or (not options and _truthy_token(correct_tok) is not None):
            qtype = "true_false"
        elif len(options) >= 2:
            qtype = "mcq"
        else:
            qtype = "essay"

    draft = {"text": text, "qtype": qtype, "choices": [], "rationale": rationale.strip(),
             "model_answer": "", "eyebrow": (eyebrow or "").strip()[:100]}

    if qtype == "essay":
        if not model_answer.strip():
            return None, "السؤال المقالي يحتاج «الإجابة النموذجية»"
        draft["model_answer"] = model_answer.strip()
        return draft, None

    if qtype == "true_false":
        val = _truthy_token(correct_tok) if correct_tok.strip() else None
        if val is None and marked and options:
            val = _truthy_token(options[marked[0]]) if marked[0] < len(options) else None
        if val is None and correct_tok.strip() and options:
            idx = _resolve_correct(options, correct_tok)
            if idx:
                val = _truthy_token(options[idx[0]])
        if val is None:
            return None, "حدد الإجابة الصحيحة: صح أو خطأ"
        draft["choices"] = [{"text": "صح", "is_correct": val}, {"text": "خطأ", "is_correct": not val}]
        return draft, None

    if len(options) < 2:
        return None, "السؤال متعدد الخيارات يحتاج خيارين على الأقل"
    idx = marked
    if correct_tok.strip():
        idx = _resolve_correct(options, correct_tok)
        if idx is None:
            return None, f"الإجابة الصحيحة «{correct_tok}» لا تطابق أي خيار"
    if not idx:
        return None, "لم تُحدَّد الإجابة الصحيحة"
    if len(set(options)) != len(options):
        return None, "يوجد خياران متطابقان"
    draft["choices"] = [{"text": o, "is_correct": i in idx} for i, o in enumerate(options)]
    return draft, None


# -------------------------------------------------------------------- excel
def _header_map(cells: list) -> dict:
    """Column index → field, from a header row; {} if it has no question column."""
    m: dict = {}
    for i, c in enumerate(cells):
        n = norm(c)
        if not n:
            continue
        opt = re.search(r"(?:الخيار|الاختيار|خيار|اختيار|option|choice)\s*(\d)", n)
        if "نموذج" in n or "model answer" in n:
            f = "model"
        elif opt:
            f = f"opt{int(opt.group(1))}"
        elif "صحيح" in n or "correct" in n or n in ("الاجابه", "اجابه", "answer"):
            f = "correct"
        elif n in ("النوع", "نوع", "type") or "نوع" in n:
            f = "type"
        elif any(k in n for k in ("شرح", "تفسير", "توضيح", "rationale", "explanation")):
            f = "rationale"
        elif any(k in n for k in ("عنوان", "موضوع", "topic")):
            f = "topic"
        elif "سؤال" in n or "سوال" in n or "question" in n or n == "text":
            f = "question"
        else:
            continue
        m.setdefault(f, i)
    return m if "question" in m else {}


def _row_to_draft(where: str, row: list, m: dict):
    def get(f):
        i = m.get(f)
        return _cell(row[i]) if i is not None and i < len(row) else ""
    opts = [get(f"opt{k}") for k in range(1, 9) if f"opt{k}" in m]
    if sum(1 for o in opts if o) > MAX_OPTIONS:
        return None, f"عدد الخيارات أكثر من {MAX_OPTIONS}"
    # keep empty slots out but preserve the numbering the sheet used for answers
    numbered = [o for o in opts]
    while numbered and not numbered[-1]:
        numbered.pop()
    if any(not o for o in numbered):
        # a gap (option 3 empty, option 4 filled): the answer number still refers
        # to the column, so keep positions for the lookup then compact.
        pos = [i for i, o in enumerate(numbered) if o]
        tok = get("correct").translate(_ARABIC_DIGITS)
        if tok and all(p.isdigit() for p in re.split(r"[,،;؛\s]+", tok) if p):
            mapped = [str(pos.index(int(p) - 1) + 1) for p in re.split(r"[,،;؛\s]+", tok) if p and int(p) - 1 in pos]
            if len(mapped) == len([p for p in re.split(r"[,،;؛\s]+", tok) if p]):
                row = list(row)
                correct_col = m["correct"]
                row[correct_col] = ",".join(mapped)
        numbered = [numbered[i] for i in pos]
    return build_question(where, get("question"), get("type"), numbered, get("correct"), [],
                          get("model"), get("rationale"), get("topic"))


def _check_size(data: bytes, kind: str, magic: bytes = b"PK") -> None:
    if not data:
        raise ImportFileError("الملف فارغ")
    if len(data) > MAX_BYTES:
        raise ImportFileError("حجم الملف أكبر من 8 ميغابايت")
    if not data.startswith(magic):
        raise ImportFileError(f"الملف غير صالح — ارفع ملف {kind} حقيقيًا")


def parse_excel(data: bytes):
    _check_size(data, "Excel (.xlsx)")
    try:
        wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    except Exception:
        raise ImportFileError("تعذّرت قراءة ملف Excel — تأكد أنه بصيغة .xlsx وغير تالف")
    drafts, errors = [], []
    found_header = False
    for ws in wb.worksheets:
        header = None
        for rno, row in enumerate(ws.iter_rows(values_only=True), start=1):
            if rno > 5000:
                break
            if header is None:
                if rno > 6:
                    break
                m = _header_map(list(row))
                if m:
                    header, found_header = m, True
                continue
            row = list(row)
            if not any(_cell(c) for c in row):
                continue
            if len(drafts) + len(errors) >= MAX_QUESTIONS + 50:
                errors.append({"where": "الملف", "message": "تم إيقاف القراءة: الملف يحتوي أسئلة كثيرة جدًا"})
                break
            where = f"صف {rno}" if len(wb.worksheets) == 1 else f"ورقة «{ws.title}» صف {rno}"
            d, err = _row_to_draft(where, row, header)
            if err:
                errors.append({"where": where, "message": err})
            else:
                drafts.append(d)
    wb.close()
    if not found_header:
        raise ImportFileError("لم أجد صف العناوين — يجب أن يحتوي الصف الأول على عمود «نص السؤال». حمّل القالب واملأه")
    return _cap(drafts, errors)


def _cap(drafts, errors):
    if len(drafts) > MAX_QUESTIONS:
        errors.append({"where": "الملف", "message": f"تم أخذ أول {MAX_QUESTIONS} سؤالًا فقط وتجاهل الباقي"})
        drafts = drafts[:MAX_QUESTIONS]
    return drafts, errors


# --------------------------------------------------------------------- word
_MODEL_RE = re.compile(r"^\s*(?:(?:الاجابة|الإجابة|جواب)\s+(?:النموذجية|النموذجيه)|model\s*answer)\s*[:：\-]\s*(.*)$", re.I)
_ANS_RE = re.compile(r"^\s*(?:(?:الاجابة|الإجابة)(?:\s+(?:الصحيحة|الصحيحه))?|الجواب(?:\s+الصحيح)?|answer|correct(?:\s+answer)?)\s*[:：\-]\s*(.*)$", re.I)
_RAT_RE = re.compile(r"^\s*(?:الشرح|التفسير|التوضيح|التعليل|explanation|rationale)\s*[:：\-]\s*(.*)$", re.I)
_TOPIC_RE = re.compile(r"^\s*(?:الموضوع|العنوان الفرعي|topic)\s*[:：]\s*(.*)$", re.I)
_TYPE_RE = re.compile(r"^\s*(?:نوع السؤال|النوع|type)\s*[:：]\s*(.*)$", re.I)
_Q_RE = re.compile(
    r"^\s*(?:(?:السؤال|سؤال|س|Q|Question)\s*(?:رقم\s*)?([0-9٠-٩]+)\s*[\.\)\-:：،]?|([0-9٠-٩]+)\s*[\.\)\-:：،])\s*(.*)$", re.I | re.S)
_OPT_RE = re.compile(r"^\s*\*?\s*[\(\[]?(أ|ا|ب|ج|د|هـ|ه|و|[A-Fa-f])\s*[\)\]\.\-:：]\s*(.*)$", re.S)
_MARKS = ("✓", "✔", "√", "☑")


def _strip_marks(t: str):
    """Removes a correct-answer marker (*, ✓ …) and says whether one was there."""
    s = t.strip()
    marked = False
    if s.startswith("*"):
        s, marked = s.lstrip("* ").strip(), True
    if s.endswith("*"):
        s, marked = s.rstrip("* ").strip(), True
    for mk in _MARKS:
        if s.startswith(mk):
            s, marked = s[len(mk):].strip(), True
        if s.endswith(mk):
            s, marked = s[:-len(mk)].strip(), True
    return s, marked


def _bold_on(r) -> bool:
    rpr = r.find(f"{W}rPr")
    if rpr is None:
        return False
    b = rpr.find(f"{W}b")
    return b is not None and b.get(f"{W}val", "true").lower() not in ("0", "false", "off")


def _para(p) -> dict:
    chars: list[tuple[str, bool]] = []
    for r in p.iter(f"{W}r"):
        bold = _bold_on(r)
        for el in r:
            if el.tag == f"{W}t" and el.text:
                chars.extend((c, bold) for c in el.text)
            elif el.tag == f"{W}tab":
                chars.append((" ", bold))
            elif el.tag in (f"{W}br", f"{W}cr"):
                chars.append(("\n", bold))
    text = "".join(c for c, _ in chars)
    ppr = p.find(f"{W}pPr")
    numid = ilvl = None
    if ppr is not None:
        npr = ppr.find(f"{W}numPr")
        if npr is not None:
            n, l = npr.find(f"{W}numId"), npr.find(f"{W}ilvl")
            numid = n.get(f"{W}val") if n is not None else None
            ilvl = int(l.get(f"{W}val", "0")) if l is not None and (l.get(f"{W}val", "0")).isdigit() else 0
            if numid == "0":
                numid = None
    return {"chars": chars, "text": text, "numid": numid, "ilvl": ilvl}


def _all_bold(chars, skip: int) -> bool:
    body = [(c, b) for c, b in chars[skip:] if not c.isspace()]
    return bool(body) and all(b for _, b in body)


def _read_docx(data: bytes):
    _check_size(data, "Word (.docx)")
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
        info = z.getinfo("word/document.xml")
    except Exception:
        raise ImportFileError("تعذّرت قراءة ملف Word — يجب أن يكون بصيغة .docx (وليس .doc القديمة)")
    if info.file_size > MAX_XML_BYTES or sum(i.file_size for i in z.infolist()) > 10 * MAX_XML_BYTES:
        raise ImportFileError("محتوى الملف ضخم جدًا")
    xml = z.read("word/document.xml")
    head = xml[:4096].lower()
    if b"<!doctype" in xml.lower()[:200000] or b"<!entity" in xml.lower()[:200000] or b"<!doctype" in head:
        raise ImportFileError("الملف يحتوي على بنية غير مسموحة")
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        raise ImportFileError("ملف Word تالف")
    body = root.find(f"{W}body")
    if body is None:
        raise ImportFileError("ملف Word فارغ")
    items = []
    for el in body:
        if el.tag == f"{W}p":
            items.append(("p", _para(el)))
        elif el.tag == f"{W}tbl":
            rows = []
            for tr in el.iter(f"{W}tr"):
                rows.append(["\n".join(_para(p)["text"] for p in tc.iter(f"{W}p")).strip() for tc in tr.findall(f"{W}tc")])
            items.append(("t", rows))
    return items


class _Block:
    def __init__(self, label: str):
        self.label, self.text = label, ""
        self.opts: list[str] = []
        self.marked: list[int] = []
        self.ans = self.model = self.rat = self.topic = self.type = ""
        self.target = "text"


def parse_docx(data: bytes):
    items = _read_docx(data)
    drafts, errors = [], []
    blocks: list[_Block] = []
    q_numid = None
    seen_any_q = False

    def start(label):
        nonlocal seen_any_q
        seen_any_q = True
        b = _Block(label)
        blocks.append(b)
        return b

    cur: _Block | None = None
    for kind, item in items:
        if kind == "t":
            if not item:
                continue
            m = _header_map(item[0])
            if not m:
                errors.append({"where": "جدول", "message": "جدول بدون عمود «نص السؤال» — تم تجاهله"})
                continue
            for rno, row in enumerate(item[1:], start=2):
                if not any(_cell(c) for c in row):
                    continue
                where = f"جدول، صف {rno}"
                d, err = _row_to_draft(where, row, m)
                if err:
                    errors.append({"where": where, "message": err})
                else:
                    drafts.append(("t", where, d))
            cur = None
            continue

        text = item["text"].strip()
        if not text:
            continue
        chars = item["chars"]
        lead = len(item["text"]) - len(item["text"].lstrip())

        if cur is not None or True:
            mm = _MODEL_RE.match(text)
            if mm and cur:
                cur.model, cur.target = mm.group(1).strip(), "model"
                continue
            mm = _ANS_RE.match(text)
            if mm and cur:
                cur.ans, cur.target = mm.group(1).strip(), "ans"
                continue
            mm = _RAT_RE.match(text)
            if mm and cur:
                cur.rat, cur.target = mm.group(1).strip(), "rat"
                continue
            mm = _TOPIC_RE.match(text)
            if mm and cur:
                cur.topic, cur.target = mm.group(1).strip(), "topic"
                continue
            mm = _TYPE_RE.match(text)
            if mm and cur:
                cur.type, cur.target = mm.group(1).strip(), "type"
                continue

        qm = _Q_RE.match(text)
        om = _OPT_RE.match(text) if cur is not None else None
        # An option like "ب) ..." must win over a question label in the same block.
        if om and not (qm and qm.group(1) is not None):
            label_len = len(text) - len(om.group(2))
            opt_text, marked = _strip_marks(om.group(2))
            if text.lstrip().startswith("*"):
                marked = True
            if _all_bold(chars, lead + label_len) and len(cur.opts) >= 0:
                marked = marked or _all_bold(chars, lead + label_len)
            if not opt_text:
                continue
            if marked:
                cur.marked.append(len(cur.opts))
            cur.opts.append(opt_text)
            cur.target = "opt"
            continue
        if qm:
            q_numid = q_numid or item["numid"]
            cur = start(qm.group(1) or qm.group(2))
            cur.text = qm.group(3).strip()
            cur.target = "text"
            continue

        # Automatic Word numbering: the "1." / "أ." labels are not in the text.
        if item["numid"]:
            if cur is None and q_numid is None:
                q_numid = item["numid"]
            if item["numid"] == q_numid and not item["ilvl"]:
                cur = start(str(len(blocks) + 1))
                cur.text, cur.target = text, "text"
                continue
            if cur is not None:
                opt_text, marked = _strip_marks(text)
                if _all_bold(chars, lead) and len(cur.opts) >= 0 and not marked:
                    marked = any(b for _, b in chars if True) and _all_bold(chars, lead)
                if marked:
                    cur.marked.append(len(cur.opts))
                cur.opts.append(opt_text)
                cur.target = "opt"
                continue

        if cur is None:
            continue                      # title / instructions before the first question
        # continuation line of whatever came last
        if cur.target == "text":
            cur.text += "\n" + text
        elif cur.target == "model":
            cur.model += "\n" + text
        elif cur.target == "rat":
            cur.rat += "\n" + text
        elif cur.target == "opt" and cur.opts:
            cur.opts[-1] += " " + text
        elif cur.target == "ans":
            cur.ans += " " + text

    out = []
    for b in blocks:
        where = f"السؤال {b.label}"
        d, err = build_question(where, b.text, b.type, b.opts, b.ans, b.marked, b.model, b.rat, b.topic)
        if err:
            errors.append({"where": where, "message": err})
        else:
            out.append(d)
    out.extend(d for _, _, d in drafts)
    if not out and not errors and not seen_any_q:
        raise ImportFileError("لم أجد أي سؤال في الملف — رقّم الأسئلة (1. 2. 3.) وضع خيارات (أ) ب) ج) د)) أو حمّل القالب")
    return _cap(out, errors)


# ---------------------------------------------------------------- templates
def build_excel_template() -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "أسئلة"
    ws.sheet_view.rightToLeft = True
    rows = [
        HEADERS,
        ["أي عظم أطول عظم في جسم الإنسان؟", "اختيار من متعدد", "عظم الفخذ", "عظم العضد", "عظم الترقوة", "عظم الساق",
         1, "", "عظم الفخذ هو أطول وأقوى عظم في الجسم.", "الجهاز الهيكلي"],
        ["القلب البشري يتكون من أربع حجرات.", "صح وخطأ", "", "", "", "", "صح", "", "أذينان وبطينان.", ""],
        ["اشرح وظيفة غمد الميالين.", "مقالي", "", "", "", "", "",
         "يعزل المحور العصبي ويسرّع نقل الإشارة العصبية.", "", ""],
    ]
    for r in rows:
        ws.append(r)
        for c in ws[ws.max_row]:
            if isinstance(c.value, str):
                c.data_type = "s"
    for col, w in zip("ABCDEFGHIJ", (46, 18, 18, 18, 18, 18, 16, 36, 36, 18)):
        ws.column_dimensions[col].width = w
    info = wb.create_sheet("تعليمات")
    info.sheet_view.rightToLeft = True
    for line in [
        "كل صف = سؤال واحد. الأعمدة المطلوبة: نص السؤال فقط، والباقي حسب نوع السؤال.",
        "النوع: اختيار من متعدد / صح وخطأ / مقالي (إن تُرك فارغًا يُستنتج من الخيارات).",
        "الإجابة الصحيحة: رقم الخيار (1) أو (1,3) لأكثر من إجابة، أو الحرف (أ/ب/ج/د)، أو نص الخيار نفسه. لسؤال صح وخطأ اكتب: صح أو خطأ.",
        "الإجابة النموذجية: للأسئلة المقالية فقط.",
        "حتى 300 سؤال في الملف الواحد. ستظهر لك معاينة قبل الحفظ.",
    ]:
        info.append([line])
    info.column_dimensions["A"].width = 120
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _wp(text: str, bold: bool = False) -> str:
    rpr = "<w:rPr><w:b/></w:rPr>" if bold else ""
    return (f'<w:p><w:pPr><w:bidi/></w:pPr><w:r>{rpr}<w:t xml:space="preserve">{escape(text)}</w:t></w:r></w:p>')


def build_docx_template() -> bytes:
    lines = [
        ("قالب أسئلة نبض", True),
        ("ملاحظة: اكتب كل سؤال برقم ثم نقطة، وخياراته أ) ب) ج) د)، وضع علامة * بعد الخيار الصحيح أو اكتب «الإجابة: ب».", False),
        ("ملاحظة: يمكن إضافة «الشرح:» و«الإجابة النموذجية:» (للمقالي). حتى 300 سؤال. ستظهر لك معاينة قبل الحفظ.", False),
        ("1. أي عظم أطول عظم في جسم الإنسان؟", False),
        ("أ) عظم الفخذ *", False),
        ("ب) عظم العضد", False),
        ("ج) عظم الترقوة", False),
        ("د) عظم الساق", False),
        ("الشرح: عظم الفخذ هو أطول وأقوى عظم في الجسم.", False),
        ("2. القلب البشري يتكون من أربع حجرات.", False),
        ("أ) صح *", False),
        ("ب) خطأ", False),
        ("3. اشرح وظيفة غمد الميالين.", False),
        ("الإجابة النموذجية: يعزل المحور العصبي ويسرّع نقل الإشارة العصبية.", False),
    ]
    body = "".join(_wp(t, b) for t, b in lines)
    doc = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
           '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
           f'<w:body>{body}<w:sectPr/></w:body></w:document>')
    ct = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
          '<Default Extension="xml" ContentType="application/xml"/>'
          '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
          '</Types>')
    rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
            '</Relationships>')
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", ct)
        z.writestr("_rels/.rels", rels)
        z.writestr("word/document.xml", doc)
    return buf.getvalue()
