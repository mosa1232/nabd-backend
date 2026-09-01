import hashlib
import hmac
import secrets
from datetime import datetime, timedelta

from jose import JWTError, jwt
from sqlalchemy.orm import Session

from . import models
from .config import get_settings

settings = get_settings()

PBKDF2_ITERATIONS = 200_000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), PBKDF2_ITERATIONS)
    return f"{salt}${digest.hex()}"


def verify_password(password: str, stored_hash: str | None) -> bool:
    if not stored_hash or "$" not in stored_hash:
        return False
    salt, digest_hex = stored_hash.split("$", 1)
    check = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), PBKDF2_ITERATIONS)
    return hmac.compare_digest(check.hex(), digest_hex)


def create_access_token(user_id: str, session_id: str) -> str:
    payload = {
        "sub": user_id,
        "sid": session_id,
        "exp": datetime.utcnow() + timedelta(minutes=settings.jwt_expires_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None


def start_new_session(db: Session, user: models.User, device_label: str) -> models.UserSession:
    """Anti-piracy: only one active session per account. Creating a new one
    deactivates every other session the user currently has open."""
    db.query(models.UserSession).filter(
        models.UserSession.user_id == user.id,
        models.UserSession.is_active == True,  # noqa: E712
    ).update({"is_active": False})

    session = models.UserSession(user_id=user.id, device_label=device_label, is_active=True)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session
