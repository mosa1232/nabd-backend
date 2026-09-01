from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from . import models
from .database import get_db
from .security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user_allow_banned(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    """Same identity check as get_current_user, minus the ban gate — for the
    handful of endpoints a banned account still needs (e.g. filing an appeal)."""
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "غير مسجّل الدخول")

    payload = decode_access_token(creds.credentials)
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "جلسة غير صالحة")

    session = db.get(models.UserSession, payload.get("sid"))
    if not session or not session.is_active:
        # This is the single-active-session rule in action: the token is
        # structurally valid but was logged out by a newer login elsewhere.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "تم تسجيل الدخول من جهاز آخر")

    user = db.get(models.User, payload.get("sub"))
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "المستخدم غير موجود")
    return user


def get_current_user(
    user: models.User = Depends(get_current_user_allow_banned),
) -> models.User:
    if user.is_banned:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "هذا الحساب محظور")
    return user


def require_role(*roles: str):
    def _check(user: models.User = Depends(get_current_user)) -> models.User:
        if user.role.value not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "لا تملك صلاحية الوصول")
        return user
    return _check
