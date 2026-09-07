from datetime import datetime, timedelta

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from .. import models, ranking, schemas
from ..config import get_settings
from ..database import get_db
from ..deps import get_current_user
from ..security import (
    clear_session_cookie, create_2fa_pending_token, create_access_token,
    decode_2fa_pending_token, decode_access_token, generate_totp_secret,
    hash_password, set_session_cookie, start_new_session, totp_provisioning_uri,
    verify_password, verify_totp,
)
from ..storage import media_url, storage
from .admin import IMAGE_EXTS, MAX_UPLOAD_BYTES, delete_stored_upload, safe_upload_name

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()

oauth = OAuth()
oauth.register(
    name="google",
    client_id=settings.google_client_id,
    client_secret=settings.google_client_secret,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)


def _domain_allowed(email: str) -> bool:
    allowed = settings.allowed_domains_list
    if not allowed:
        return True  # no restriction configured
    return any(email.lower().endswith("@" + d.lower()) for d in allowed)


def _should_bootstrap_admin(db: Session, email: str) -> bool:
    """Whether this sign-in should be promoted to admin.

    This used to be "any account, as long as the platform has no admin yet",
    on every sign-up path including the public POST /auth/register. Because
    the production database is wiped on each redeploy, that left a window
    after every deploy where the very first stranger to hit /auth/register
    silently received a full admin account. Promotion now additionally
    requires the email to match BOOTSTRAP_ADMIN_EMAIL, so an empty database
    is no longer a free admin seat.
    """
    expected = (settings.bootstrap_admin_email or "").strip().lower()
    if not expected or email.strip().lower() != expected:
        return False
    return db.query(models.User).filter(models.User.role == models.Role.admin).first() is None


MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15


def _check_not_locked(user: models.User):
    if user.locked_until and user.locked_until > datetime.utcnow():
        minutes_left = max(1, int((user.locked_until - datetime.utcnow()).total_seconds() // 60) + 1)
        raise HTTPException(429, f"تم قفل الحساب مؤقتاً بسبب محاولات دخول فاشلة متكررة — حاول بعد {minutes_left} دقيقة")


def _register_failed_attempt(db: Session, user: models.User):
    user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
    if user.failed_login_attempts >= MAX_FAILED_ATTEMPTS:
        user.locked_until = datetime.utcnow() + timedelta(minutes=LOCKOUT_MINUTES)
        user.failed_login_attempts = 0
    db.commit()


def _clear_failed_attempts(db: Session, user: models.User):
    if user.failed_login_attempts or user.locked_until:
        user.failed_login_attempts = 0
        user.locked_until = None
        db.commit()


def _find_or_create_user(db: Session, email: str, name: str, sub: str) -> models.User:
    user = db.query(models.User).filter(models.User.email == email).first()
    if user:
        if not user.google_sub:
            user.google_sub = sub
            db.commit()
        # Bootstrap: the one configured BOOTSTRAP_ADMIN_EMAIL becomes admin
        # on sign-in while the platform still has no admin, so there's never
        # a dead end with no way into the admin dashboard — without handing
        # the role to whoever happens to sign in first.
        if user.role != models.Role.admin and _should_bootstrap_admin(db, email):
            user.role = models.Role.admin
            db.commit()
        return user
    role = models.Role.admin if _should_bootstrap_admin(db, email) else models.Role.student
    user = models.User(email=email, full_name=name, google_sub=sub, role=role)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _issue_session_and_redirect(db: Session, user: models.User, device_label: str, redirect_base: str) -> RedirectResponse:
    if user.totp_enabled:
        # Don't start the real session yet — a session here would already
        # count as "logged in" for the single-active-session rule before the
        # second factor is checked. Hand the SPA a pending token instead;
        # it only unlocks POST /auth/2fa/verify.
        pending = create_2fa_pending_token(user.id)
        return RedirectResponse(f"{redirect_base}#requires_2fa=1&pending_token={pending}")
    session = start_new_session(db, user, device_label)
    token = create_access_token(user.id, session.id)
    # Hand the token to the SPA via a URL fragment (never logged by servers/proxies).
    response = RedirectResponse(f"{redirect_base}#access_token={token}")
    set_session_cookie(response, token)
    return response


# Roles allowed to actually use the admin dashboard — kept in sync with the
# `roles` map on the dashboard's own side (nabd-admin-dashboard.html), which
# rejects anything else with the same message this returns via #google_error.
ADMIN_DASHBOARD_ROLES = {models.Role.admin, models.Role.professor, models.Role.reseller}


def _admin_redirect_base(request: Request) -> str:
    """Where the browser lands after an admin/professor/reseller sign-in.

    Derived from the request's own origin by default rather than
    FRONTEND_URL: this app serves the admin dashboard itself at /admin (see
    app/main.py), so "wherever this request came in on" is always a valid
    target — in local dev that's http://127.0.0.1:8000, in production the
    deployed origin, with no extra configuration either way. Only
    ADMIN_FRONTEND_URL overrides it, for the unusual case of hosting the
    dashboard somewhere this app doesn't serve it.
    """
    if settings.admin_frontend_url:
        return settings.admin_frontend_url.rstrip("/")
    return str(request.base_url).rstrip("/") + "/admin"


@router.get("/google/login")
async def google_login(request: Request, next: str = ""):
    if not settings.google_client_id:
        raise HTTPException(500, "GOOGLE_CLIENT_ID غير مهيأ على الخادم — راجع ملف .env")
    # Remembered across the round trip to Google in the same signed session
    # cookie authlib already uses for OAuth state/nonce, so the callback
    # below knows to send an admin/professor/reseller sign-in back to the
    # dashboard instead of the student app — without it being something a
    # caller could just forge by adding ?next=admin to the callback URL.
    if next == "admin":
        request.session["oauth_next"] = "admin"
    else:
        request.session.pop("oauth_next", None)
    redirect_uri = settings.google_redirect_uri
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/google/callback")
async def google_callback(request: Request, db: Session = Depends(get_db)):
    token = await oauth.google.authorize_access_token(request)
    userinfo = token.get("userinfo") or await oauth.google.userinfo(token=token)
    email = userinfo["email"]
    name = userinfo.get("name", email.split("@")[0])
    sub = userinfo["sub"]

    if not _domain_allowed(email):
        raise HTTPException(403, "الرجاء تسجيل الدخول ببريدك الجامعي الرسمي")

    is_admin_flow = request.session.pop("oauth_next", None) == "admin"
    user = _find_or_create_user(db, email, name, sub)

    if is_admin_flow:
        redirect_base = _admin_redirect_base(request)
        if user.role not in ADMIN_DASHBOARD_ROLES:
            # No session issued at all — creating one just to reject it a
            # moment later would also silently sign this account out of any
            # real session it already holds elsewhere (single-active-session
            # invalidates the older one the instant a new one starts).
            return RedirectResponse(f"{redirect_base}#google_error=role")
    else:
        redirect_base = settings.frontend_url

    ua = request.headers.get("user-agent", "")
    device_label = "متصفح" if "Mobile" not in ua else "هاتف"
    return _issue_session_and_redirect(db, user, device_label, redirect_base)


@router.post("/dev-login", include_in_schema=True)
def dev_login(response: Response, email: str, name: str = "طالب تجريبي", db: Session = Depends(get_db)):
    """Local-only stand-in for the Google redirect flow — lets you exercise
    every other endpoint without real Google OAuth credentials. Disabled
    when DEBUG=false."""
    if not settings.debug:
        raise HTTPException(404)
    user = _find_or_create_user(db, email, name, sub=f"dev:{email}")
    session = start_new_session(db, user, "جهاز تطوير")
    token = create_access_token(user.id, session.id)
    set_session_cookie(response, token)
    return schemas.LoginResponse(access_token=token, user=user)


@router.post("/login")
def login(body: schemas.PasswordLoginIn, response: Response, db: Session = Depends(get_db)):
    """Email + password login for the admin/professor/reseller dashboard —
    a real alternative to Google OAuth and the dev-login stand-in."""
    user = db.query(models.User).filter(models.User.email == body.email.strip()).first()
    if user:
        _check_not_locked(user)
    if not user or not verify_password(body.password, user.password_hash):
        if user:
            _register_failed_attempt(db, user)
        raise HTTPException(401, "البريد الإلكتروني أو كلمة المرور غير صحيحة")
    if user.is_banned:
        raise HTTPException(403, "هذا الحساب محظور")

    _clear_failed_attempts(db, user)

    if user.totp_enabled:
        return {"requires_2fa": True, "pending_token": create_2fa_pending_token(user.id)}

    session = start_new_session(db, user, "متصفح")
    token = create_access_token(user.id, session.id)
    set_session_cookie(response, token)
    return schemas.LoginResponse(access_token=token, user=user)


@router.post("/2fa/verify", response_model=schemas.LoginResponse)
def verify_2fa_login(body: schemas.TOTPVerifyIn, response: Response, db: Session = Depends(get_db)):
    """Completes a login that /auth/login or the Google callback paused for
    a second factor — the only thing a pending_token is good for."""
    user_id = decode_2fa_pending_token(body.pending_token)
    if not user_id:
        raise HTTPException(401, "انتهت صلاحية الجلسة المؤقتة — سجّل الدخول من جديد")
    user = db.get(models.User, user_id)
    if not user or not user.totp_enabled:
        raise HTTPException(401, "جلسة غير صالحة")
    if user.is_banned:
        raise HTTPException(403, "هذا الحساب محظور")
    _check_not_locked(user)
    if not verify_totp(user.totp_secret, body.code):
        _register_failed_attempt(db, user)
        raise HTTPException(401, "رمز التحقق غير صحيح")

    _clear_failed_attempts(db, user)
    session = start_new_session(db, user, "متصفح")
    token = create_access_token(user.id, session.id)
    set_session_cookie(response, token)
    return schemas.LoginResponse(access_token=token, user=user)


@router.post("/2fa/setup", response_model=schemas.TOTPSetupOut)
def setup_2fa(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Generates a new TOTP secret for the caller to scan/enter into an
    authenticator app. Not active yet — POST /auth/2fa/enable with a valid
    code from it is what actually turns 2FA on."""
    secret = generate_totp_secret()
    user.totp_secret = secret
    db.commit()
    return schemas.TOTPSetupOut(secret=secret, otpauth_uri=totp_provisioning_uri(secret, user.email))


@router.post("/2fa/enable")
def enable_2fa(body: schemas.TOTPCodeIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    if not user.totp_secret:
        raise HTTPException(400, "لم تبدئي إعداد التحقق بخطوتين بعد")
    if not verify_totp(user.totp_secret, body.code):
        raise HTTPException(401, "رمز التحقق غير صحيح")
    user.totp_enabled = True
    db.commit()
    return {"ok": True}


@router.post("/2fa/disable")
def disable_2fa(body: schemas.TOTPCodeIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    if not user.totp_enabled:
        raise HTTPException(400, "التحقق بخطوتين غير مفعّل أصلاً")
    if not verify_totp(user.totp_secret, body.code):
        raise HTTPException(401, "رمز التحقق غير صحيح")
    user.totp_enabled = False
    user.totp_secret = None
    db.commit()
    return {"ok": True}


@router.post("/register", response_model=schemas.LoginResponse)
def register(body: schemas.RegisterIn, response: Response, db: Session = Depends(get_db)):
    """Real email + password sign-up for students — the "أنشئي حساب" form,
    an alternative to Google for anyone who'd rather not use it."""
    email = body.email.strip()
    full_name = body.full_name.strip()
    if not full_name:
        raise HTTPException(400, "الاسم الكامل مطلوب")
    if len(body.password) < 8:
        raise HTTPException(400, "كلمة المرور يجب أن تكون 8 أحرف على الأقل")
    if not _domain_allowed(email):
        raise HTTPException(403, "الرجاء التسجيل ببريدك الجامعي الرسمي")
    if db.query(models.User).filter(models.User.email == email).first():
        raise HTTPException(400, "البريد الإلكتروني مستخدم مسبقاً")

    # Same bootstrap rule as Google/dev-login: if there's no admin on the
    # platform yet, this new account becomes one, regardless of sign-up path.
    role = models.Role.admin if _should_bootstrap_admin(db, email) else models.Role.student
    user = models.User(email=email, full_name=full_name, role=role, password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    session = start_new_session(db, user, "متصفح")
    token = create_access_token(user.id, session.id)
    set_session_cookie(response, token)
    return schemas.LoginResponse(access_token=token, user=user)


@router.get("/me", response_model=schemas.UserOut)
def me(user: models.User = Depends(get_current_user)):
    return user


@router.put("/me/profile", response_model=schemas.UserOut)
def update_my_profile(
    body: schemas.ProfileUpdateIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Powers the mandatory "أكملي بياناتك" gate shown to any student whose
    account (Google, password, or admin-created) hasn't supplied a phone
    number, college/university, and study status yet — now that sign-up is
    open to any email, this is the platform's only source of that data."""
    if not body.full_name.strip():
        raise HTTPException(400, "الاسم الكامل مطلوب")
    if not body.phone.strip():
        raise HTTPException(400, "رقم الهاتف مطلوب")

    university = db.get(models.University, body.university_id)
    if not university or university.section_id != body.section_id:
        raise HTTPException(400, "الجامعة المختارة لا تتبع القسم المختار")

    stage_id = None
    if not body.is_graduate:
        if not body.stage_id:
            raise HTTPException(400, "المرحلة الدراسية مطلوبة للطلاب غير المتخرجين")
        stage = db.get(models.Stage, body.stage_id)
        if not stage or stage.university_id != body.university_id:
            raise HTTPException(400, "المرحلة المختارة لا تتبع الجامعة المختارة")
        stage_id = body.stage_id

    user.full_name = body.full_name.strip()
    user.phone = body.phone.strip()
    user.section_id = body.section_id
    user.university_id = body.university_id
    user.is_graduate = body.is_graduate
    user.stage_id = stage_id
    db.commit()
    db.refresh(user)
    return user


@router.put("/me/caption", response_model=schemas.UserOut)
def update_my_caption(
    body: schemas.CaptionUpdateIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """A short one-line status any account can set for their own profile —
    same idea as a professor's bio, just for everyone (students included)."""
    user.caption = body.caption.strip()[:200]
    db.commit()
    db.refresh(user)
    return user


@router.put("/me/preferences", response_model=schemas.UserOut)
def update_my_preferences(
    body: schemas.PreferencesUpdateIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """The theme toggle and language switcher used to be pure client-side
    state — reset to light/Arabic on every refresh or new device. This
    makes the choice stick to the account, like everything else here."""
    if body.theme is not None:
        if body.theme not in ("light", "dark"):
            raise HTTPException(400, "قيمة المظهر غير صالحة")
        user.theme = body.theme
    if body.language is not None:
        if body.language not in ("ar", "en", "ku"):
            raise HTTPException(400, "قيمة اللغة غير صالحة")
        user.language = body.language
    db.commit()
    db.refresh(user)
    return user


@router.get("/me/skills")
def list_my_skills(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    skills = db.query(models.UserSkill).filter(models.UserSkill.user_id == user.id).order_by(models.UserSkill.created_at).all()
    return [{"id": s.id, "text": s.text} for s in skills]


@router.post("/me/skills")
def add_my_skill(body: schemas.SkillIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    text = body.text.strip()[:40]
    if not text:
        raise HTTPException(400, "اكتب مهارة قبل الإضافة")
    if db.query(models.UserSkill).filter(models.UserSkill.user_id == user.id).count() >= 12:
        raise HTTPException(400, "الحد الأقصى 12 مهارة")
    skill = models.UserSkill(user_id=user.id, text=text)
    db.add(skill)
    db.commit()
    db.refresh(skill)
    return {"id": skill.id, "text": skill.text}


@router.delete("/me/skills/{skill_id}")
def delete_my_skill(skill_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    skill = db.get(models.UserSkill, skill_id)
    if not skill or skill.user_id != user.id:
        raise HTTPException(404, "المهارة غير موجودة")
    db.delete(skill)
    db.commit()
    return {"ok": True}


@router.post("/me/photo", response_model=schemas.UserOut)
async def upload_my_photo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Every account — student or professor — can set a real profile photo,
    not just the auto-generated initials avatar."""
    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(400, "الملف أكبر من الحد المسموح (20 ميغابايت)")
    stored_name = safe_upload_name(file.filename, IMAGE_EXTS, "photo")
    storage.save(stored_name, contents, file.content_type or "")
    delete_stored_upload(user.photo_url)  # don't strand the photo being replaced
    user.photo_url = media_url(stored_name)
    db.commit()
    db.refresh(user)
    return user


@router.post("/me/recent-view")
def record_recent_view(
    body: schemas.RecentViewIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Called whenever a student actually opens a booklet or a lecture —
    powers a real per-student "continue where I left off" on the home
    screen instead of a platform-wide "newest upload" card."""
    if body.content_type not in ("booklet", "lecture"):
        raise HTTPException(400, "نوع غير صالح")
    existing = (
        db.query(models.RecentView)
        .filter(
            models.RecentView.user_id == user.id,
            models.RecentView.content_type == body.content_type,
            models.RecentView.content_id == body.content_id,
        )
        .first()
    )
    if existing:
        existing.viewed_at = datetime.utcnow()
    else:
        db.add(models.RecentView(user_id=user.id, content_type=body.content_type, content_id=body.content_id))
    db.commit()
    return {"ok": True}


@router.get("/me/continue")
def get_continue_card(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """The home screen's real "pick up where I left off" data — the last
    course this student actually opened (with real progress through its
    lectures) and, separately, the last booklet they opened. Both are shown
    together when available, since a student can genuinely be partway
    through a course AND mid-read on an unrelated booklet at the same time."""
    last_lecture_view = (
        db.query(models.RecentView)
        .filter(models.RecentView.user_id == user.id, models.RecentView.content_type == "lecture")
        .order_by(models.RecentView.viewed_at.desc())
        .first()
    )
    last_booklet_view = (
        db.query(models.RecentView)
        .filter(models.RecentView.user_id == user.id, models.RecentView.content_type == "booklet")
        .order_by(models.RecentView.viewed_at.desc())
        .first()
    )

    course_out = None
    if last_lecture_view:
        lec = db.get(models.Lecture, last_lecture_view.content_id)
        if lec and lec.course:
            course_lectures = db.query(models.Lecture).filter(models.Lecture.course_id == lec.course_id).all()
            done_ids = {
                r[0] for r in db.query(models.LectureProgress.lecture_id)
                .filter(
                    models.LectureProgress.user_id == user.id,
                    models.LectureProgress.lecture_id.in_([l.id for l in course_lectures]),
                ).all()
            }
            total = len(course_lectures)
            done = len(done_ids)
            course_out = {
                "course_id": lec.course_id, "course_title": lec.course.title,
                "lecture_id": lec.id, "lecture_title": lec.title,
                "done_count": done, "total_count": total,
                "pct": round(100 * done / total) if total else 0,
            }

    booklet_out = None
    if last_booklet_view:
        b = db.get(models.Booklet, last_booklet_view.content_id)
        if b:
            professor = db.get(models.ProfessorProfile, b.professor_id)
            booklet_out = {
                "id": b.id, "title": b.title,
                "subject_name": professor.subject.name if professor else "",
                "professor_id": professor.id if professor else None,
                "file_url": b.file_url or None,
            }

    return {"course": course_out, "booklet": booklet_out}


@router.get("/me/stats", response_model=schemas.StudentStatsOut)
def my_stats(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Powers the home screen's streak / answered-today / uni-rank chips —
    all real numbers derived from StudentAnswer rows instead of the frontend's
    old hardcoded placeholders."""
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    answered_today = db.query(models.StudentAnswer).filter(
        models.StudentAnswer.user_id == user.id,
        models.StudentAnswer.answered_at >= today_start,
    ).count()

    ranked = ranking.ranked_pairs(db, ranking.peer_ids(db, user))

    return schemas.StudentStatsOut(
        answered_today=answered_today,
        streak_days=ranking.streak_days(db, user.id),
        rank=ranking.rank_of(ranked, user.id),
        total_ranked=len(ranked),
        accuracy_pct=ranking.accuracy_pct(db, user.id),
    )


@router.get("/me/performance")
def my_performance(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Per-subject accuracy breakdown — the account page's "تقرير أدائي"."""
    answers = db.query(models.StudentAnswer).filter(models.StudentAnswer.user_id == user.id).all()
    by_question = {a.question_id for a in answers}
    if not by_question:
        return []
    questions = db.query(models.Question).filter(models.Question.id.in_(by_question)).all()
    subject_of = {q.id: q.subject_id for q in questions}

    stats: dict[str, dict] = {}
    for a in answers:
        subj_id = subject_of.get(a.question_id)
        if not subj_id:
            continue
        s = stats.setdefault(subj_id, {"answered": 0, "correct": 0})
        s["answered"] += 1
        if a.is_correct:
            s["correct"] += 1

    subjects = db.query(models.Subject).filter(models.Subject.id.in_(stats.keys())).all()
    out = []
    for subj in subjects:
        s = stats[subj.id]
        pct = round(s["correct"] / s["answered"] * 100) if s["answered"] else 0
        out.append({
            "subject_id": subj.id, "subject_name": subj.name,
            "answered": s["answered"], "correct": s["correct"], "accuracy_pct": pct,
        })
    out.sort(key=lambda r: -r["answered"])
    return out


@router.get("/leaderboard")
def leaderboard(limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Top students by correct-answer count, scoped to the caller's own
    university when they have one (same peer group used in /me/stats)."""
    ranked = ranking.ranked_pairs(db, ranking.peer_ids(db, user))[:limit]
    # Only the page being shown is hydrated into User rows, instead of
    # loading every student on the platform to render 20 of them.
    top = {
        u.id: u for u in db.query(models.User)
        .filter(models.User.id.in_([uid for uid, _ in ranked])).all()
    }
    return [
        {
            "rank": i + 1, "user_id": uid,
            "full_name": top[uid].full_name if uid in top else "",
            "photo_url": top[uid].photo_url if uid in top else None,
            "correct_count": score, "is_you": uid == user.id,
        }
        for i, (uid, score) in enumerate(ranked)
    ]


@router.get("/me/history")
def my_history(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Powers the account page's "نشاطي" section — a real chronological
    feed of exam results, store orders, and activation-code redemptions,
    instead of the page having no activity trail at all."""
    events = []

    attempts = (
        db.query(models.ExamAttempt)
        .filter(models.ExamAttempt.user_id == user.id, models.ExamAttempt.finished_at.isnot(None))
        .all()
    )
    for a in attempts:
        exam = db.get(models.Exam, a.exam_id)
        events.append({
            "type": "exam", "at": a.finished_at,
            "title": exam.title if exam else "امتحان",
            "detail": f"{a.score} / {a.total}",
        })

    orders = db.query(models.Order).filter(models.Order.user_id == user.id).all()
    for o in orders:
        status_ar = {"pending": "قيد الانتظار", "paid": "مدفوع", "fulfilled": "مكتمل", "cancelled": "ملغي"}
        events.append({
            "type": "order", "at": o.created_at,
            "title": f"طلب بقيمة {o.total} د.ع",
            "detail": status_ar.get(o.status, o.status),
        })

    codes = (
        db.query(models.ActivationCode)
        .filter(models.ActivationCode.activated_by_user_id == user.id, models.ActivationCode.activated_at.isnot(None))
        .all()
    )
    for c in codes:
        events.append({
            "type": "code", "at": c.activated_at,
            "title": c.subject.name if c.subject_id else "تفعيل VIP — جميع المواد",
            "detail": c.code,
        })

    events.sort(key=lambda e: e["at"], reverse=True)
    return events[:30]


@router.post("/change-password")
def change_password(
    body: schemas.ChangePasswordIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Powers the account page's "تغيير" button on the password row. Accounts
    that never had a password (Google-only signups) can set their first one
    without proving a current password; everyone else must confirm it."""
    if user.password_hash and not verify_password(body.current_password, user.password_hash):
        raise HTTPException(401, "كلمة المرور الحالية غير صحيحة")
    if len(body.new_password) < 8:
        raise HTTPException(400, "كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل")

    user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"ok": True}


@router.get("/me/sessions", response_model=list[schemas.SessionOut])
def my_sessions(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Powers the account page's "الجهاز النشط الحالي" card. Thanks to the
    single-active-session rule (start_new_session deactivates every other
    row on login) this is almost always exactly one device."""
    sessions = (
        db.query(models.UserSession)
        .filter(models.UserSession.user_id == user.id, models.UserSession.is_active == True)  # noqa: E712
        .order_by(models.UserSession.created_at.desc())
        .all()
    )
    return sessions


@router.post("/session/restore", response_model=schemas.LoginResponse)
def restore_session(request: Request, response: Response, db: Session = Depends(get_db)):
    """Signs the visitor back in from the httpOnly session cookie.

    The access token itself is only ever held in memory by the SPA, so a
    refresh used to drop it and dump the student back on the login screen.
    This trades that token for a fresh one using the cookie, which scripts
    can't read. It re-checks everything a normal request checks — the
    server-side session is still active (so a login on another device has
    already invalidated it), the user exists, and isn't banned.
    """
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise HTTPException(401, "لا توجد جلسة محفوظة")

    payload = decode_access_token(token)
    if not payload:
        clear_session_cookie(response)
        raise HTTPException(401, "انتهت صلاحية الجلسة")

    session = db.get(models.UserSession, payload.get("sid"))
    if not session or not session.is_active:
        clear_session_cookie(response)
        raise HTTPException(401, "تم تسجيل الدخول من جهاز آخر")

    user = db.get(models.User, payload.get("sub"))
    if not user:
        clear_session_cookie(response)
        raise HTTPException(401, "المستخدم غير موجود")
    if user.is_banned:
        clear_session_cookie(response)
        raise HTTPException(403, "هذا الحساب محظور")

    # Same session, fresh token — so an active user's cookie keeps sliding
    # forward instead of expiring 14 days after their first ever login.
    fresh = create_access_token(user.id, session.id)
    set_session_cookie(response, fresh)
    return schemas.LoginResponse(access_token=fresh, user=user)


@router.post("/logout")
def logout(response: Response, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(models.UserSession).filter(
        models.UserSession.user_id == user.id,
        models.UserSession.is_active == True,  # noqa: E712
    ).update({"is_active": False})
    db.commit()
    clear_session_cookie(response)
    return {"ok": True}
