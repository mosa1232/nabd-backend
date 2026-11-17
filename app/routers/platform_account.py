"""Content posted in the platform's own name.

Questions, booklets, exams, courses and pearls all belong to a teaching
profile. For things the platform itself publishes there is a built-in
"منصة Kiur" teaching account (it cannot sign in: no password, an address that
receives nothing). Staff open its dashboard through the usual "view as" bar,
pick the subject, and everything they upload is saved under the platform's
name — students see it exactly like a doctor's content."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..deps import admin_gate

router = APIRouter(prefix="/api/admin/platform", tags=["platform"], dependencies=[Depends(admin_gate)])

PLATFORM_EMAIL = "platform@kiur.internal"
PLATFORM_NAME = "منصة Kiur"


def platform_user(db: Session) -> models.User:
    u = db.query(models.User).filter(models.User.email == PLATFORM_EMAIL).first()
    if not u:
        u = models.User(email=PLATFORM_EMAIL, full_name=PLATFORM_NAME, role=models.Role.professor, password_hash=None)
        db.add(u)
        db.commit()
        db.refresh(u)
    return u


def platform_profile(db: Session, subject_id: str) -> models.ProfessorProfile:
    """The platform's teaching profile for a subject, created on first use."""
    if not db.get(models.Subject, subject_id):
        raise HTTPException(404, "المادة غير موجودة")
    u = platform_user(db)
    p = db.query(models.ProfessorProfile).filter(models.ProfessorProfile.user_id == u.id, models.ProfessorProfile.subject_id == subject_id).first()
    if not p:
        p = models.ProfessorProfile(user_id=u.id, subject_id=subject_id, title="المنصة", bio="محتوى تنشره منصة Kiur")
        db.add(p)
        db.commit()
        db.refresh(p)
    return p


class SubjectIn(BaseModel):
    subject_id: str


@router.get("")
def platform_info(db: Session = Depends(get_db)):
    """The platform account, the subjects it already publishes in, and every
    subject of the catalog (with its path) to pick from."""
    u = platform_user(db)
    mine = {p.subject_id for p in db.query(models.ProfessorProfile).filter(models.ProfessorProfile.user_id == u.id).all()}
    subjects = []
    for s in db.query(models.Subject).all():
        st = s.stage
        uni = st.university if st else None
        dept = st.department if st else None
        sec = uni.section if uni and getattr(uni, "section", None) else None
        path = " ← ".join(x for x in [sec.name if sec else "", uni.name if uni else "", dept.name if dept else "", st.name if st else "", s.name] if x)
        subjects.append({
            "id": s.id, "name": s.name, "path": path, "active": s.id in mine,
            "section": {"id": sec.id, "name": sec.name} if sec else None,
            "university": {"id": uni.id, "name": uni.name} if uni else None,
            "department": {"id": dept.id, "name": dept.name} if dept else {"id": "none", "name": "بدون قسم"},
            "stage": {"id": st.id, "name": st.name} if st else None,
        })
    subjects.sort(key=lambda x: (x["path"], x["name"]))
    return {"user_id": u.id, "name": PLATFORM_NAME, "subjects": subjects}


@router.post("/subject")
def platform_subject(body: SubjectIn, db: Session = Depends(get_db)):
    """Opens the platform's teaching profile for a subject (once)."""
    p = platform_profile(db, body.subject_id)
    return {"user_id": p.user_id, "subject_id": body.subject_id}
