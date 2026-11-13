from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from . import models, permissions
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


def user_permissions(user: models.User) -> set[str]:
    return permissions.effective_permissions(user.role.value, user.permissions)


def has_permission(user: models.User, perm: str) -> bool:
    return perm in user_permissions(user)


def require_permission(*perms: str):
    """Allows the request if the account holds at least one of `perms`."""
    def _check(user: models.User = Depends(get_current_user)) -> models.User:
        held = user_permissions(user)
        if not any(p in held for p in perms):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "لا تملك صلاحية لهذا الإجراء")
        return user
    return _check


def admin_gate(request: Request, user: models.User = Depends(get_current_user)) -> models.User:
    """Guards every /api/admin/* route: the account must be back-office staff
    *and* hold the permission that route family needs (permissions.py). A
    route no rule covers is admin-only, so a newly added endpoint is closed
    by default instead of open."""
    if user.role.value not in permissions.BACKOFFICE_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "لا تملك صلاحية الوصول")
    needed = permissions.required_admin_permission(request.url.path)
    if needed is None:
        if user.role != models.Role.admin:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "هذا الإجراء للمدير فقط")
    elif needed not in user_permissions(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "لا تملك صلاحية لهذا الإجراء")
    return user
