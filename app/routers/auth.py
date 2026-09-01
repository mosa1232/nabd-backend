from datetime import datetime, timedelta

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import get_settings
from ..database import get_db
from ..deps import get_current_user
from ..security import create_access_token, hash_password, start_new_session, verify_password

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


def _find_or_create_user(db: Session, email: str, name: str, sub: str) -> models.User:
    user = db.query(models.User).filter(models.User.email == email).first()
    if user:
        if not user.google_sub:
            user.google_sub = sub
            db.commit()
        return user
    user = models.User(email=email, full_name=name, google_sub=sub, role=models.Role.student)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _issue_session_and_redirect(db: Session, user: models.User, device_label: str) -> RedirectResponse:
    session = start_new_session(db, user, device_label)
    token = create_access_token(user.id, session.id)
    # Hand the token to the SPA via a URL fragment (never logged by servers/proxies).
    return RedirectResponse(f"{settings.frontend_url}#access_token={token}")


@router.get("/google/login")
async def google_login(request: Request):
    if not settings.google_client_id:
        raise HTTPException(500, "GOOGLE_CLIENT_ID غير مهيأ على الخادم — راجع ملف .env")
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

    user = _find_or_create_user(db, email, name, sub)
    ua = request.headers.get("user-agent", "")
    device_label = "متصفح" if "Mobile" not in ua else "هاتف"
    return _issue_session_and_redirect(db, user, device_label)


@router.post("/dev-login", include_in_schema=True)
def dev_login(email: str, name: str = "طالب تجريبي", db: Session = Depends(get_db)):
    """Local-only stand-in for the Google redirect flow — lets you exercise
    every other endpoint without real Google OAuth credentials. Disabled
    when DEBUG=false."""
    if not settings.debug:
        raise HTTPException(404)
    user = _find_or_create_user(db, email, name, sub=f"dev:{email}")
    session = start_new_session(db, user, "جهاز تطوير")
    token = create_access_token(user.id, session.id)
    return schemas.LoginResponse(access_token=token, user=user)


@router.post("/login", response_model=schemas.LoginResponse)
def login(body: schemas.PasswordLoginIn, db: Session = Depends(get_db)):
    """Email + password login for the admin/professor/reseller dashboard —
    a real alternative to Google OAuth and the dev-login stand-in."""
    user = db.query(models.User).filter(models.User.email == body.email.strip()).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "البريد الإلكتروني أو كلمة المرور غير صحيحة")
    if user.is_banned:
        raise HTTPException(403, "هذا الحساب محظور")

    session = start_new_session(db, user, "متصفح")
    token = create_access_token(user.id, session.id)
    return schemas.LoginResponse(access_token=token, user=user)


@router.get("/me", response_model=schemas.UserOut)
def me(user: models.User = Depends(get_current_user)):
    return user


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

    answer_dates = db.query(models.StudentAnswer.answered_at).filter(
        models.StudentAnswer.user_id == user.id
    ).all()
    days_with_answers = {row[0].date() for row in answer_dates}
    cursor = datetime.utcnow().date()
    if cursor not in days_with_answers:
        cursor -= timedelta(days=1)  # streak isn't broken until today ends unanswered
    streak_days = 0
    while cursor in days_with_answers:
        streak_days += 1
        cursor -= timedelta(days=1)

    students_q = db.query(models.User).filter(models.User.role == models.Role.student)
    if user.university_id:
        students_q = students_q.filter(models.User.university_id == user.university_id)
    students = students_q.all()

    correct_by_user: dict[str, int] = {}
    peer_answers = db.query(models.StudentAnswer).filter(
        models.StudentAnswer.user_id.in_([s.id for s in students])
    ).all()
    for a in peer_answers:
        if a.is_correct:
            correct_by_user[a.user_id] = correct_by_user.get(a.user_id, 0) + 1

    ranked = sorted(students, key=lambda s: (-correct_by_user.get(s.id, 0), s.id))
    rank = next((i + 1 for i, s in enumerate(ranked) if s.id == user.id), None)

    return schemas.StudentStatsOut(
        answered_today=answered_today,
        streak_days=streak_days,
        rank=rank,
        total_ranked=len(ranked),
    )


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


@router.post("/logout")
def logout(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(models.UserSession).filter(
        models.UserSession.user_id == user.id,
        models.UserSession.is_active == True,  # noqa: E712
    ).update({"is_active": False})
    db.commit()
    return {"ok": True}
