import base64
import hashlib
import hmac
import os
import secrets
import struct
import time
import urllib.parse
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


def create_2fa_pending_token(user_id: str) -> str:
    """A short-lived token issued after a correct password/Google login on a
    2FA-enabled account, before the real session exists. It carries no "sid",
    so get_current_user rejects it outright if anyone tries using it as a
    normal Bearer token — it's only good for POST /auth/2fa/verify."""
    payload = {"pending_2fa_user": user_id, "exp": datetime.utcnow() + timedelta(minutes=5)}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_2fa_pending_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
    return payload.get("pending_2fa_user")


# ------------------------------------------------------------- TOTP (2FA)
# Standard RFC 6238 TOTP — compatible with Google Authenticator, Authy, etc.
# No external dependency: HMAC-SHA1 and base32 are both in the stdlib.
TOTP_PERIOD = 30
TOTP_DIGITS = 6


def generate_totp_secret() -> str:
    return base64.b32encode(os.urandom(20)).decode("utf-8")


def _totp_code_at(secret: str, counter: int) -> str:
    key = base64.b32decode(secret.upper())
    msg = struct.pack(">Q", counter)
    digest = hmac.new(key, msg, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code_int = (struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF) % (10 ** TOTP_DIGITS)
    return str(code_int).zfill(TOTP_DIGITS)


def verify_totp(secret: str, code: str, window: int = 1) -> bool:
    """Accepts the code from the current 30s window and one step on either
    side, to tolerate small clock drift between server and phone."""
    if not secret or not code or not code.isdigit():
        return False
    current = int(time.time() // TOTP_PERIOD)
    return any(
        hmac.compare_digest(_totp_code_at(secret, current + offset), code)
        for offset in range(-window, window + 1)
    )


def totp_provisioning_uri(secret: str, email: str, issuer: str = "Kiur") -> str:
    label = urllib.parse.quote(f"{issuer}:{email}")
    return (
        f"otpauth://totp/{label}?secret={secret}&issuer={urllib.parse.quote(issuer)}"
        f"&algorithm=SHA1&digits={TOTP_DIGITS}&period={TOTP_PERIOD}"
    )


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
