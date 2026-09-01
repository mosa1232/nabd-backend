from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    email: str
    full_name: str
    role: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UserCreateIn(BaseModel):
    email: str
    full_name: str
    role: str
    password: Optional[str] = None


class UserUpdateIn(BaseModel):
    email: str
    full_name: str
    role: str


class PasswordLoginIn(BaseModel):
    email: str
    password: str


class RegisterIn(BaseModel):
    email: str
    password: str
    full_name: str


class SubjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str


class StageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    subjects: list[SubjectOut] = []


class UniversityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    stages: list[StageOut] = []


class SectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    universities: list[UniversityOut] = []


class ChoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    text: str


class ChoiceWithAnswerOut(ChoiceOut):
    is_correct: bool


class QuestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    text: str
    eyebrow: str
    image_url: Optional[str] = None
    choices: list[ChoiceOut]


class AnswerIn(BaseModel):
    choice_id: str


class AnswerResult(BaseModel):
    is_correct: bool
    correct_choice_id: str
    rationale: str


class BookletOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    title: str
    pages: int


class BookletIn(BaseModel):
    title: str
    pages: int = 0


class ExamOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    title: str
    question_count: int
    duration_minutes: int


class ExamIn(BaseModel):
    title: str
    question_count: int = 0
    duration_minutes: int = 30


class ProfessorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    title: str
    name: str
    subject_name: str
    booklets: list[BookletOut] = []
    exams: list[ExamOut] = []


class LectureOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    title: str
    duration_seconds: int


class LectureIn(BaseModel):
    title: str
    duration_seconds: int = 0


class CourseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    title: str
    instructor: str
    lectures: list[LectureOut] = []


class CourseIn(BaseModel):
    title: str


class ChoiceIn(BaseModel):
    text: str
    is_correct: bool = False


class QuestionAdminIn(BaseModel):
    subject_id: str
    text: str
    eyebrow: str = ""
    rationale: str = ""
    image_url: Optional[str] = None
    choices: list[ChoiceIn]


class QuestionAdminOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    subject_id: str
    text: str
    eyebrow: str
    rationale: str
    image_url: Optional[str] = None
    choices: list[ChoiceWithAnswerOut]


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    price: int
    type: str


class OrderItemIn(BaseModel):
    product_id: str
    qty: int = 1


class OrderIn(BaseModel):
    items: list[OrderItemIn]
    payment_method: str  # "zaincash" | "cod"
    delivery_name: Optional[str] = None
    delivery_phone: Optional[str] = None
    delivery_address: Optional[str] = None


class OrderOut(BaseModel):
    id: str
    total: int
    status: str
    payment_method: str
    created_at: datetime
    granted_activation_codes: list[str] = []


class StudentStatsOut(BaseModel):
    answered_today: int
    streak_days: int
    rank: Optional[int] = None
    total_ranked: int


class RedeemCodeIn(BaseModel):
    code: str


class ActivationOut(BaseModel):
    id: str
    code_masked: str
    subject_name: str  # "VIP — جميع المواد" when the code isn't scoped to one subject
    activated_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None


class ChangePasswordIn(BaseModel):
    current_password: str = ""
    new_password: str


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    device_label: str
    created_at: datetime


class AppealIn(BaseModel):
    message: str


class BanStatusOut(BaseModel):
    is_banned: bool
    reason: Optional[str] = None
    status: Optional[str] = None
    appeal_message: Optional[str] = None
    appealed_at: Optional[datetime] = None
