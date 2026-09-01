"""Populates the database with demo data matching the frontend prototype
(same professors, courses, products, and a couple of sample MCQ questions)
so the real backend and the existing UI mockup line up.

Run with:  python seed.py
Also called automatically on app startup (see app/main.py) so a fresh,
empty database — e.g. after a redeploy on a host with ephemeral disk —
seeds itself instead of booting with nothing in it.
"""
import random
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app import models
from app.security import hash_password

DEMO_PASSWORD = "Nabd@2026"  # dashboard login for every seeded admin/professor/reseller account


def run_seed(db: Session) -> bool:
    """Returns True if it seeded, False if the database already had data."""
    if db.query(models.Section).first():
        return False

    _seed(db)
    return True


def _seed(db: Session) -> None:
    section = models.Section(name="طب بشري")
    db.add(section)
    db.flush()

    university = models.University(name="جامعة بغداد", section_id=section.id)
    db.add(university)
    db.flush()

    stage = models.Stage(name="المرحلة الثانية", university_id=university.id)
    db.add(stage)
    db.flush()

    subject_names = ["التشريح", "الفسلجة", "الأنسجة", "الكيمياء الحيوية"]
    subjects = {}
    for name in subject_names:
        s = models.Subject(name=name, stage_id=stage.id)
        db.add(s)
        db.flush()
        subjects[name] = s

    # --- professors ---------------------------------------------------------
    prof_data = [
        ("أحمد الجبوري", "أستاذ مساعد", "التشريح"),
        ("رنا الخفاجي", "أستاذ", "التشريح"),
        ("سامر العبيدي", "مدرّس", "الفسلجة"),
        ("نور الدين حسن", "أستاذ مساعد", "الأنسجة"),
        ("زينب كريم", "أستاذ", "الكيمياء الحيوية"),
    ]
    professors = {}
    for name, title, subj in prof_data:
        u = models.User(
            email=f"{name.replace(' ', '.')}@uob.edu.iq", full_name=f"د. {name}",
            role=models.Role.professor, password_hash=hash_password(DEMO_PASSWORD),
        )
        db.add(u)
        db.flush()
        p = models.ProfessorProfile(user_id=u.id, title=title, subject_id=subjects[subj].id)
        db.add(p)
        db.flush()
        professors[name] = p
        db.add(models.Booklet(professor_id=p.id, title=f"المحاضرة 1: مقدمة في {subj}", pages=22))
        db.add(models.Exam(subject_id=subjects[subj].id, professor_id=p.id, title=f"كويز الفصل الأول — {subj}", question_count=25, duration_minutes=30))

    # --- sample MCQ questions ------------------------------------------------
    q1 = models.Question(
        subject_id=subjects["التشريح"].id,
        text="أي من الخلايا التالية مسؤولة عن تكوين غمد الميالين حول محاور الخلايا العصبية في الجهاز العصبي المركزي؟",
        eyebrow="علم الأنسجة",
        rationale="قليلة التغصن العصبية هي المسؤولة عن تصنيع غمد الميالين داخل الجهاز العصبي المركزي.",
    )
    db.add(q1)
    db.flush()
    for text, correct in [("الخلايا النجمية", False), ("قليلة التغصن", True), ("الخلايا البطانية العصبية", False), ("الخلايا الدبقية الصغيرة", False)]:
        db.add(models.Choice(question_id=q1.id, text=text, is_correct=correct))

    # --- courses --------------------------------------------------------------
    course = models.Course(subject_id=subjects["التشريح"].id, professor_id=professors["أحمد الجبوري"].id, title="كورس التشريح الشامل")
    db.add(course)
    db.flush()
    lectures = [
        ("مقدمة في التشريح العام", 18*60+24),
        ("الجهاز الهيكلي — الجزء الأول", 26*60+10),
        ("الجهاز العضلي", 31*60+2),
    ]
    for i, (title, dur) in enumerate(lectures):
        db.add(models.Lecture(course_id=course.id, title=title, duration_seconds=dur, order_index=i))

    # --- store products --------------------------------------------------------
    # The two "كود تفعيل" products actually issue a real ActivationCode on
    # purchase (see app/routers/store.py) — is_activation_code marks them as
    # such, grants_subject_id scopes one to "التشريح" only, null = VIP/all subjects.
    products = [
        ("كود تفعيل VIP — جميع المواد (سنة كاملة)", 45000, "digital", True, None),
        ("كود تفعيل مادة التشريح فقط", 15000, "digital", True, subjects["التشريح"].id),
        ("كورس التشريح الشامل (فيديو)", 25000, "digital", False, None),
        ("سماعة طبية (ستيثوسكوب)", 35000, "physical", False, None),
        ("ملزمة ورقية مطبوعة — التشريح", 12000, "physical", False, None),
    ]
    for name, price, ptype, is_code, grants_subject_id in products:
        db.add(models.Product(
            name=name, price=price, type=ptype,
            is_activation_code=is_code, grants_subject_id=grants_subject_id,
        ))

    # --- an activation code -----------------------------------------------------
    db.add(models.ActivationCode(code="NBD-VIP-7X29", status="idle"))

    # --- admin, reseller, and a few more students -------------------------------
    admin_user = models.User(
        email="admin@nabd.app", full_name="مدير المنصة",
        role=models.Role.admin, password_hash=hash_password(DEMO_PASSWORD),
    )
    db.add(admin_user)

    reseller_user = models.User(
        email="reseller@nabd.app", full_name="مكتب بغداد للأكواد",
        role=models.Role.reseller, password_hash=hash_password(DEMO_PASSWORD),
    )
    db.add(reseller_user)
    db.flush()

    student_names = ["زهراء علي", "حسين كاظم", "مريم صالح", "علي حيدر", "دعاء ياسين"]
    seeded_students = []
    for name in student_names:
        u = models.User(
            email=f"{name.replace(' ', '.')}@uob.edu.iq", full_name=name,
            role=models.Role.student, university_id=university.id, stage_id=stage.id,
        )
        db.add(u)
        db.flush()
        seeded_students.append(u)

    # a few sample answers so /api/admin/students and heatmap-style stats aren't empty
    for s in seeded_students:
        for _ in range(random.randint(3, 9)):
            choice = random.choice(q1.choices)
            db.add(models.StudentAnswer(user_id=s.id, question_id=q1.id, choice_id=choice.id, is_correct=choice.is_correct))

    # one banned account for the Ban Management screen
    db.add(models.BanRecord(user_id=seeded_students[0].id, reason="مشاركة الحساب مع طالب آخر", status=models.BanStatus.active))
    seeded_students[0].is_banned = True

    # a handful of activity log entries
    actions = ["تسجيل دخول", "الإجابة على سؤال", "رفع ملزمة", "تفعيل كود", "تعديل سؤال"]
    for i in range(10):
        who = random.choice(seeded_students + [admin_user])
        db.add(models.ActivityLog(
            user_id=who.id, action=random.choice(actions), ip_address=f"37.236.{random.randint(1,255)}.{random.randint(1,255)}",
            created_at=datetime.utcnow() - timedelta(hours=i*3),
        ))

    # reseller's code batch — some sold/activated, some still available
    for i in range(12):
        sold = i < 8
        activated = i < 5
        db.add(models.ActivationCode(
            code=f"NBD-{1000+i}-BGD",
            status=models.CodeStatus.active if activated else models.CodeStatus.idle,
            reseller_id=reseller_user.id,
            sold_at=(datetime.utcnow() - timedelta(days=i)) if sold else None,
        ))

    # a couple of media files
    db.add(models.MediaFile(filename="anatomy-slide-01.jpg", url="#", content_type="image/jpeg", size_bytes=482_000, uploaded_by=professors["أحمد الجبوري"].user_id))
    db.add(models.MediaFile(filename="booklet-week1.pdf", url="#", content_type="application/pdf", size_bytes=1_240_000, uploaded_by=professors["أحمد الجبوري"].user_id))

    db.commit()


if __name__ == "__main__":
    from app.database import Base, SessionLocal, engine

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if run_seed(db):
            print("Seeded ✔")
        else:
            print("Already seeded — skipping.")
    finally:
        db.close()
