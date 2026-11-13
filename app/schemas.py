from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, computed_field

from .permissions import effective_permissions, parse_permissions


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    email: str
    full_name: str
    role: str
    is_banned: bool = False
    phone: Optional[str] = None
    university_id: Optional[str] = None
    section_id: Optional[str] = None
    stage_id: Optional[str] = None
    is_graduate: Optional[bool] = None
    totp_enabled: bool = False
    photo_url: Optional[str] = None
    caption: Optional[str] = None
    theme: str = "light"
    language: str = "ar"
    password_hash: Optional[str] = Field(default=None, exclude=True)
    # None for an account that has never set one.
    password_changed_at: Optional[datetime] = None
    parent_user_id: Optional[str] = None
    code_quota: Optional[int] = None
    created_at: Optional[datetime] = None
    last_login: Optional[datetime] = None
    scope_university_id: Optional[str] = None
    scope_stage_id: Optional[str] = None
    verified_at: Optional[datetime] = None
    verified_name: Optional[str] = None
    # The raw extra grants; the dashboard reads `effective_permissions`.
    permissions: Optional[str] = Field(default="", exclude=True)

    @computed_field
    @property
    def extra_permissions(self) -> list[str]:
        """Only the grants made on top of the role's defaults (for editors)."""
        return sorted(parse_permissions(self.permissions))

    @computed_field
    @property
    def effective_permissions(self) -> list[str]:
        """Everything this account may do — drives which dashboard pages and
        buttons appear. The server enforces it independently."""
        return sorted(effective_permissions(self.role, self.permissions))

    @computed_field
    @property
    def has_password(self) -> bool:
        """Drives the account page's real password status — was showing a
        fixed, fake "last changed 3 months ago" for every account regardless
        of whether it ever had one (Google-only accounts never do)."""
        return bool(self.password_hash)

    @computed_field
    @property
    def profile_complete(self) -> bool:
        """Drives the student app's "complete your profile" gate. Professors/
        admins/resellers are created directly by an admin and never need it."""
        if self.role != "student":
            return True
        # phone is optional — it is not part of completeness.
        if not self.university_id or not self.section_id:
            return False
        if self.is_graduate is None:
            return False
        if self.is_graduate is False and not self.stage_id:
            return False
        return True


class ProfileUpdateIn(BaseModel):
    full_name: str
    phone: str = ""  # optional
    section_id: str
    university_id: str
    is_graduate: bool
    stage_id: Optional[str] = None


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class ChatIn(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=40)
    context: str = Field(default="", max_length=3000)


class ChatOut(BaseModel):
    reply: str
    mode: str = "ai"            # "ai" = written by the model, "search" = assembled from the question bank
    sources: list[dict] = []    # the bank questions the answer drew on


class PearlProfIn(BaseModel):
    title: str
    tag: str = ""
    body: str = ""


class QuestionBulkIn(BaseModel):
    questions: list["QuestionProfIn"] = Field(min_length=1, max_length=300)


class PearlBulkIn(BaseModel):
    pearls: list[PearlProfIn] = Field(min_length=1, max_length=30)


class CatalogQuickIn(BaseModel):
    section_name: str
    universities: list[str] = []
    stages: list[str] = []


class VerifyRedeemIn(BaseModel):
    code: str = Field(min_length=4, max_length=40)


class StageChangeIn(BaseModel):
    stage_id: str


class CaptionUpdateIn(BaseModel):
    caption: str = ""


class SkillIn(BaseModel):
    text: str


class PreferencesUpdateIn(BaseModel):
    theme: Optional[str] = None
    language: Optional[str] = None


class RecentViewIn(BaseModel):
    content_type: str
    content_id: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UserCreateIn(BaseModel):
    email: str
    full_name: str
    role: str
    password: Optional[str] = None
    # Required when role == "professor": a professor with no teaching profile
    # can sign in but every screen of their dashboard 404s, because the
    # profile is what ties them to a subject.
    subject_id: Optional[str] = None
    title: Optional[str] = None
    # Extra permissions on top of the role's defaults (admin sets these).
    permissions: list[str] = []
    # Assistant only: the professor (user id) they work for.
    parent_user_id: Optional[str] = None
    # Reseller only.
    code_quota: Optional[int] = Field(default=None, ge=0)
    phone: Optional[str] = None
    # Representative only: which college-in-university (and stage) they cover.
    scope_university_id: Optional[str] = None
    scope_stage_id: Optional[str] = None


class PermissionsUpdateIn(BaseModel):
    permissions: list[str] = []
    code_quota: Optional[int] = Field(default=None, ge=0)


class ResellerCreateIn(BaseModel):
    email: str
    full_name: str
    password: str
    permissions: list[str] = ["codes.view", "codes.generate"]
    code_quota: Optional[int] = Field(default=None, ge=0)


class AssistantCreateIn(BaseModel):
    email: str
    full_name: str
    password: str
    permissions: list[str] = []


class StoreCategoryIn(BaseModel):
    name: str
    sort_order: int = 0


class StoreCategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    sort_order: int = 0


class ProfessorAssignIn(BaseModel):
    subject_id: str
    title: str = "أستاذ مساعد"


class UserUpdateIn(BaseModel):
    email: str
    full_name: str
    role: str
    password: Optional[str] = None  # leave empty to keep the current password unchanged
    permissions: Optional[list[str]] = None  # None = leave grants unchanged
    phone: Optional[str] = None
    scope_university_id: Optional[str] = None
    scope_stage_id: Optional[str] = None
    parent_user_id: Optional[str] = None
    code_quota: Optional[int] = Field(default=None, ge=0)


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


QuestionType = Literal["mcq", "true_false", "essay"]


class QuestionProfIn(BaseModel):
    """A professor's question — the subject is fixed to their own."""
    text: str
    eyebrow: str = ""
    rationale: str = ""
    image_url: Optional[str] = None
    qtype: QuestionType = "mcq"
    model_answer: str = ""
    choices: list["ChoiceIn"] = []


class QuestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    text: str
    eyebrow: str
    image_url: Optional[str] = None
    qtype: str = "mcq"
    choices: list[ChoiceOut]


class AnswerIn(BaseModel):
    choice_id: str


class AnswerResult(BaseModel):
    is_correct: bool
    correct_choice_id: str
    rationale: str


class EssayRevealOut(BaseModel):
    model_answer: str
    rationale: str


class BookletOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    title: str
    pages: int
    file_url: Optional[str] = None


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
    university_name: str = ""
    bio: str = ""
    photo_url: Optional[str] = None
    booklets: list[BookletOut] = []
    exams: list[ExamOut] = []


class ProfessorProfileUpdateIn(BaseModel):
    title: str
    bio: str = ""
    photo_url: Optional[str] = None


class LectureOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    title: str
    duration_seconds: int
    video_url: Optional[str] = None
    done: bool = False


class LectureIn(BaseModel):
    title: str
    duration_seconds: int = 0


class CourseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    title: str
    instructor: str
    subject_id: Optional[str] = None
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
    qtype: QuestionType = "mcq"
    model_answer: str = ""
    choices: list[ChoiceIn] = []


class QuestionAdminOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    subject_id: str
    text: str
    eyebrow: str
    rationale: str
    image_url: Optional[str] = None
    qtype: str = "mcq"
    model_answer: str = ""
    choices: list[ChoiceWithAnswerOut]


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    price: int
    type: str
    category_id: Optional[str] = None


class ProductAdminOut(ProductOut):
    is_activation_code: bool = False
    grants_subject_id: Optional[str] = None


class OrderItemIn(BaseModel):
    product_id: str
    # Bounded on purpose: an unbounded int let a negative qty produce a
    # negative order total (which fed straight into the admin revenue KPI),
    # and a huge one would loop that many times issuing activation codes.
    qty: int = Field(1, ge=1, le=50)


class OrderIn(BaseModel):
    items: list[OrderItemIn]
    payment_method: Literal["zaincash", "cod"]
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
    # None until the student has answered anything — the home ring shows a
    # dash in that case rather than a made-up percentage.
    accuracy_pct: Optional[int] = None


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


class TOTPSetupOut(BaseModel):
    secret: str
    otpauth_uri: str


class TOTPCodeIn(BaseModel):
    code: str


class TOTPVerifyIn(BaseModel):
    pending_token: str
    code: str


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


class ProductIn(BaseModel):
    name: str
    price: int
    type: str  # "digital" | "physical" | "course"
    is_activation_code: bool = False
    grants_subject_id: Optional[str] = None
    category_id: Optional[str] = None


class OrderAdminItemOut(BaseModel):
    product_name: str
    qty: int
    price: int


class OrderAdminOut(BaseModel):
    id: str
    buyer_name: str
    buyer_email: str
    total: int
    status: str
    payment_method: str
    created_at: datetime
    delivery_name: Optional[str] = None
    delivery_phone: Optional[str] = None
    delivery_address: Optional[str] = None
    items: list[OrderAdminItemOut] = []


# ------------------------------------------------------------------ exams
class ExamAttemptAnswerIn(BaseModel):
    choice_id: str


class NotificationCreateIn(BaseModel):
    title: str
    body: str = ""
    user_id: Optional[str] = None  # null = broadcast to every student


class ClinicalPearlIn(BaseModel):
    title: str
    tag: str = ""
    body: str = ""
    section_id: Optional[str] = None  # null = every section


class ClinicalPearlOut(BaseModel):
    id: str
    tag: str = ""
    title: str
    body: str
    section_id: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ClinicalPearlPreviewOut(BaseModel):
    """What an unauthenticated visitor gets: enough to see a case exists,
    never its content. No `body` field at all — not an empty one."""
    id: str
    tag: str = ""
    title: str

    model_config = ConfigDict(from_attributes=True)

class SummerTrainingIn(BaseModel):
    title: str
    description: str = ""
    location: str = ""
    starts_on: str = ""
    ends_on: str = ""
    apply_url: str = ""
    section_id: Optional[str] = None
    is_active: bool = True


class SummerTrainingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    title: str
    description: str = ""
    location: str = ""
    starts_on: str = ""
    ends_on: str = ""
    apply_url: str = ""
    section_id: Optional[str] = None
    is_active: bool = True


class ForgotPasswordIn(BaseModel):
    email: str


class ResetPasswordIn(BaseModel):
    token: str
    new_password: str

class CatalogBulkIn(BaseModel):
    # "root" creates sections; the rest create children of parent_id.
    parent_type: str
    parent_id: Optional[str] = None
    names: list[str]


class CatalogDuplicateIn(BaseModel):
    type: str
    id: str
    # Defaults to the source name, which is what you want when copying into
    # a different parent (the same stage name under another university).
    new_name: Optional[str] = None
    # One copy per name, in a single request — how you get twenty
    # universities out of one properly-built one.
    new_names: Optional[list[str]] = None
    target_parent_id: Optional[str] = None

class CatalogImportIn(BaseModel):
    # The whole curriculum as indented text. preview=True parses and counts
    # without writing anything.
    text: str
    preview: bool = False
