import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, Column, DateTime, Enum, Float, ForeignKey, Integer, String, Text
)
from sqlalchemy.orm import relationship

from .database import Base


def gen_id() -> str:
    return uuid.uuid4().hex[:12]


class Role(str, enum.Enum):
    student = "student"
    professor = "professor"
    admin = "admin"
    reseller = "reseller"


class ProductType(str, enum.Enum):
    digital = "digital"
    physical = "physical"
    course = "course"


class OrderStatus(str, enum.Enum):
    pending = "pending"
    paid = "paid"
    fulfilled = "fulfilled"
    cancelled = "cancelled"


class BanStatus(str, enum.Enum):
    active = "active"
    appealed = "appealed"
    lifted = "lifted"


class CodeStatus(str, enum.Enum):
    idle = "idle"
    active = "active"
    expired = "expired"


# ---------------------------------------------------------------- identity
class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=gen_id)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=False)
    google_sub = Column(String, unique=True, index=True, nullable=True)
    password_hash = Column(String, nullable=True)  # null for Google-only / dev-login accounts
    role = Column(Enum(Role), default=Role.student, nullable=False)
    university_id = Column(String, ForeignKey("universities.id"), nullable=True)
    stage_id = Column(String, ForeignKey("stages.id"), nullable=True)
    section_id = Column(String, ForeignKey("sections.id"), nullable=True)
    phone = Column(String, nullable=True)
    is_graduate = Column(Boolean, nullable=True)  # null = not asked yet
    is_banned = Column(Boolean, default=False)
    totp_secret = Column(String, nullable=True)
    totp_enabled = Column(Boolean, default=False)
    photo_url = Column(String, nullable=True)
    caption = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    university = relationship("University")
    stage = relationship("Stage")
    section = relationship("Section")
    sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")


class UserSession(Base):
    """One row per login. Enforces the single-active-session anti-piracy rule:
    creating a new session marks all of the user's other sessions inactive."""
    __tablename__ = "user_sessions"
    id = Column(String, primary_key=True, default=gen_id)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    device_label = Column(String, default="جهاز غير معروف")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="sessions")


# ------------------------------------------------------------- catalog tree
class Section(Base):
    __tablename__ = "sections"
    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, nullable=False)  # e.g. طب بشري

    universities = relationship("University", back_populates="section")


class University(Base):
    __tablename__ = "universities"
    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, nullable=False)
    section_id = Column(String, ForeignKey("sections.id"), nullable=False)

    section = relationship("Section", back_populates="universities")
    stages = relationship("Stage", back_populates="university")


class Stage(Base):
    __tablename__ = "stages"
    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, nullable=False)  # e.g. المرحلة الثانية
    university_id = Column(String, ForeignKey("universities.id"), nullable=False)

    university = relationship("University", back_populates="stages")
    subjects = relationship("Subject", back_populates="stage")


class Subject(Base):
    __tablename__ = "subjects"
    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, nullable=False)  # e.g. التشريح
    stage_id = Column(String, ForeignKey("stages.id"), nullable=False)

    stage = relationship("Stage", back_populates="subjects")


# ------------------------------------------------------------------ people
class ProfessorProfile(Base):
    __tablename__ = "professor_profiles"
    id = Column(String, primary_key=True, default=gen_id)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    title = Column(String, default="أستاذ مساعد")
    subject_id = Column(String, ForeignKey("subjects.id"), nullable=False)
    bio = Column(Text, default="")
    photo_url = Column(String, nullable=True)

    user = relationship("User")
    subject = relationship("Subject")


class Booklet(Base):
    __tablename__ = "booklets"
    id = Column(String, primary_key=True, default=gen_id)
    professor_id = Column(String, ForeignKey("professor_profiles.id"), nullable=False)
    title = Column(String, nullable=False)
    file_url = Column(String, default="")
    pages = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


# ------------------------------------------------------------- MCQ engine
class Question(Base):
    __tablename__ = "questions"
    id = Column(String, primary_key=True, default=gen_id)
    subject_id = Column(String, ForeignKey("subjects.id"), nullable=False)
    professor_id = Column(String, ForeignKey("professor_profiles.id"), nullable=True)
    text = Column(Text, nullable=False)
    image_url = Column(String, nullable=True)
    rationale = Column(Text, default="")
    eyebrow = Column(String, default="")

    subject = relationship("Subject")
    choices = relationship("Choice", back_populates="question", cascade="all, delete-orphan")


class Choice(Base):
    __tablename__ = "choices"
    id = Column(String, primary_key=True, default=gen_id)
    question_id = Column(String, ForeignKey("questions.id"), nullable=False)
    text = Column(String, nullable=False)
    is_correct = Column(Boolean, default=False)
    order_index = Column(Integer, default=0)

    question = relationship("Question", back_populates="choices")


class StudentAnswer(Base):
    """One row per answer — powers auto-save, spaced repetition, and the
    admin heatmap/weak-topics analytics."""
    __tablename__ = "student_answers"
    id = Column(String, primary_key=True, default=gen_id)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    question_id = Column(String, ForeignKey("questions.id"), nullable=False)
    choice_id = Column(String, ForeignKey("choices.id"), nullable=False)
    is_correct = Column(Boolean, nullable=False)
    answered_at = Column(DateTime, default=datetime.utcnow)


class Exam(Base):
    __tablename__ = "exams"
    id = Column(String, primary_key=True, default=gen_id)
    subject_id = Column(String, ForeignKey("subjects.id"), nullable=False)
    professor_id = Column(String, ForeignKey("professor_profiles.id"), nullable=True)
    title = Column(String, nullable=False)
    question_count = Column(Integer, default=0)
    duration_minutes = Column(Integer, default=30)

    subject = relationship("Subject")


# ---------------------------------------------------------------- courses
class Course(Base):
    __tablename__ = "courses"
    id = Column(String, primary_key=True, default=gen_id)
    subject_id = Column(String, ForeignKey("subjects.id"), nullable=False)
    professor_id = Column(String, ForeignKey("professor_profiles.id"), nullable=True)
    title = Column(String, nullable=False)

    subject = relationship("Subject")
    professor = relationship("ProfessorProfile")
    lectures = relationship("Lecture", back_populates="course", cascade="all, delete-orphan")


class Lecture(Base):
    __tablename__ = "lectures"
    id = Column(String, primary_key=True, default=gen_id)
    course_id = Column(String, ForeignKey("courses.id"), nullable=False)
    title = Column(String, nullable=False)
    duration_seconds = Column(Integer, default=0)
    order_index = Column(Integer, default=0)

    course = relationship("Course", back_populates="lectures")


# --------------------------------------------------------------- activation
class ActivationCode(Base):
    __tablename__ = "activation_codes"
    id = Column(String, primary_key=True, default=gen_id)
    code = Column(String, unique=True, nullable=False)
    subject_id = Column(String, ForeignKey("subjects.id"), nullable=True)  # null = VIP (all subjects)
    status = Column(Enum(CodeStatus), default=CodeStatus.idle)
    activated_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    activated_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    reseller_id = Column(String, ForeignKey("users.id"), nullable=True)
    sold_at = Column(DateTime, nullable=True)

    subject = relationship("Subject")


# ------------------------------------------------------------------- store
class Product(Base):
    __tablename__ = "products"
    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, nullable=False)
    price = Column(Integer, nullable=False)  # IQD
    type = Column(Enum(ProductType), nullable=False)
    is_activation_code = Column(Boolean, default=False)  # buying this issues a real ActivationCode
    grants_subject_id = Column(String, ForeignKey("subjects.id"), nullable=True)  # null + is_activation_code = VIP

    grants_subject = relationship("Subject")


class Order(Base):
    __tablename__ = "orders"
    id = Column(String, primary_key=True, default=gen_id)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    total = Column(Integer, default=0)
    payment_method = Column(String, default="zaincash")
    status = Column(Enum(OrderStatus), default=OrderStatus.pending)
    created_at = Column(DateTime, default=datetime.utcnow)
    delivery_name = Column(String, nullable=True)
    delivery_phone = Column(String, nullable=True)
    delivery_address = Column(String, nullable=True)

    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"
    id = Column(String, primary_key=True, default=gen_id)
    order_id = Column(String, ForeignKey("orders.id"), nullable=False)
    product_id = Column(String, ForeignKey("products.id"), nullable=False)
    qty = Column(Integer, default=1)
    price = Column(Integer, nullable=False)

    order = relationship("Order", back_populates="items")
    product = relationship("Product")


# --------------------------------------------------------- admin / safety
class BanRecord(Base):
    __tablename__ = "ban_records"
    id = Column(String, primary_key=True, default=gen_id)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    reason = Column(String, nullable=False)
    status = Column(Enum(BanStatus), default=BanStatus.active)
    created_at = Column(DateTime, default=datetime.utcnow)
    appeal_message = Column(Text, nullable=True)
    appealed_at = Column(DateTime, nullable=True)


class ActivityLog(Base):
    __tablename__ = "activity_logs"
    id = Column(String, primary_key=True, default=gen_id)
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    action = Column(String, nullable=False)
    ip_address = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class MediaFile(Base):
    __tablename__ = "media_files"
    id = Column(String, primary_key=True, default=gen_id)
    filename = Column(String, nullable=False)
    url = Column(String, nullable=False)
    content_type = Column(String, default="")
    size_bytes = Column(Integer, default=0)
    uploaded_by = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# --------------------------------------------------------------- exam engine
class ExamAttempt(Base):
    """One row per student who starts an exam. Its ExamAttemptQuestion rows
    are a fixed, shuffled snapshot of that exam's questions at start time —
    so the exam stays consistent for that student even if the subject's
    question bank changes mid-attempt."""
    __tablename__ = "exam_attempts"
    id = Column(String, primary_key=True, default=gen_id)
    exam_id = Column(String, ForeignKey("exams.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    started_at = Column(DateTime, default=datetime.utcnow)
    finished_at = Column(DateTime, nullable=True)
    score = Column(Integer, default=0)
    total = Column(Integer, default=0)

    exam = relationship("Exam")
    items = relationship("ExamAttemptQuestion", back_populates="attempt", cascade="all, delete-orphan")


class ExamAttemptQuestion(Base):
    __tablename__ = "exam_attempt_questions"
    id = Column(String, primary_key=True, default=gen_id)
    attempt_id = Column(String, ForeignKey("exam_attempts.id"), nullable=False)
    question_id = Column(String, ForeignKey("questions.id"), nullable=False)
    order_index = Column(Integer, default=0)
    choice_id = Column(String, ForeignKey("choices.id"), nullable=True)
    is_correct = Column(Boolean, nullable=True)
    answered_at = Column(DateTime, nullable=True)

    attempt = relationship("ExamAttempt", back_populates="items")
    question = relationship("Question")


# -------------------------------------------------------------------- skills
class UserSkill(Base):
    """A free-text tag a student adds to their own profile — shown on their
    public profile card alongside rank and streak."""
    __tablename__ = "user_skills"
    id = Column(String, primary_key=True, default=gen_id)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    text = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


# ------------------------------------------------------------ review/saving
class SavedQuestion(Base):
    """A student's bookmark on a question, for the "المحفوظة" review tab."""
    __tablename__ = "saved_questions"
    id = Column(String, primary_key=True, default=gen_id)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    question_id = Column(String, ForeignKey("questions.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


# --------------------------------------------------------------- notifications
class Notification(Base):
    """user_id null = broadcast to every student. Per-user read state lives
    in NotificationRead rather than a column here, so one broadcast row can
    be read by some recipients and not others."""
    __tablename__ = "notifications"
    id = Column(String, primary_key=True, default=gen_id)
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    title = Column(String, nullable=False)
    body = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(String, ForeignKey("users.id"), nullable=True)


class NotificationRead(Base):
    __tablename__ = "notification_reads"
    id = Column(String, primary_key=True, default=gen_id)
    notification_id = Column(String, ForeignKey("notifications.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    read_at = Column(DateTime, default=datetime.utcnow)
