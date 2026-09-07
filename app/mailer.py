"""Outgoing email.

Plain SMTP from the standard library — no provider SDK, so the same code
works with Gmail, Brevo, Zoho, Mailgun, Resend or anything else that speaks
SMTP. Which one is in use is entirely a matter of the SMTP_* settings.

If those settings are absent the module reports itself as unconfigured and
sends nothing. Callers check `email_configured()` and tell the user plainly
that reset email isn't set up, rather than showing a "check your inbox"
message for a message that was never sent.
"""
from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr

from .config import get_settings

settings = get_settings()
log = logging.getLogger("kiur.mailer")

SMTP_TIMEOUT_SECONDS = 20


def email_configured() -> bool:
    """Whether there's enough configuration to actually deliver anything."""
    return bool(settings.smtp_host and (settings.smtp_from or settings.smtp_user))


def _from_address() -> str:
    return settings.smtp_from or settings.smtp_user


def send_email(to: str, subject: str, text_body: str, html_body: str | None = None) -> bool:
    """Sends one message. Returns whether it went out.

    Never raises: a failed send must not turn into a 500 on a request the
    user is waiting on, and must not reveal — through an error — whether
    the address exists. Failures are logged for the operator instead.
    """
    if not email_configured():
        log.warning("email not configured (SMTP_HOST unset) — nothing sent to %s", to)
        return False

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = formataddr((settings.smtp_from_name, _from_address()))
    message["To"] = to
    message.set_content(text_body)
    if html_body:
        message.add_alternative(html_body, subtype="html")

    local_hosts = {"localhost", "127.0.0.1", "::1"}
    if not settings.smtp_use_tls and settings.smtp_password and settings.smtp_host not in local_hosts:
        # Plain SMTP to a remote host would put this password on the wire in
        # the clear. Refuse rather than "work" insecurely.
        log.error(
            "refusing to send: SMTP_USE_TLS is off with a password set for remote host %s",
            settings.smtp_host,
        )
        return False

    try:
        if not settings.smtp_use_tls:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=SMTP_TIMEOUT_SECONDS) as server:
                if settings.smtp_user:
                    server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(message)
        elif settings.smtp_port == 465:
            # Implicit TLS: the connection is encrypted from the first byte.
            with smtplib.SMTP_SSL(
                settings.smtp_host, settings.smtp_port,
                timeout=SMTP_TIMEOUT_SECONDS, context=ssl.create_default_context(),
            ) as server:
                if settings.smtp_user:
                    server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(message)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=SMTP_TIMEOUT_SECONDS) as server:
                server.starttls(context=ssl.create_default_context())
                if settings.smtp_user:
                    server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(message)
        return True
    except Exception as exc:  # noqa: BLE001 — deliberately broad, see docstring
        log.error("could not send email to %s: %s: %s", to, type(exc).__name__, exc)
        return False


def send_password_reset(to: str, full_name: str, reset_url: str, ttl_minutes: int) -> bool:
    """The one message this app sends today."""
    greeting = f"مرحباً {full_name}،" if full_name else "مرحباً،"
    text_body = (
        f"{greeting}\n\n"
        "وصلنا طلب لإعادة تعيين كلمة مرور حسابك في Kiur.\n"
        f"افتح هذا الرابط لاختيار كلمة مرور جديدة (صالح لمدة {ttl_minutes} دقيقة):\n\n"
        f"{reset_url}\n\n"
        "إذا لم تطلب هذا، تجاهل الرسالة — كلمة مرورك الحالية تبقى كما هي، "
        "ولن يتغيّر شيء في حسابك.\n\n"
        "— Kiur"
    )
    html_body = f"""\
<!doctype html>
<html lang="ar" dir="rtl">
  <body style="margin:0;padding:24px;background:#EAF0FF;font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#16213A;">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:18px;padding:32px 28px;">
      <div style="font-size:1.2rem;font-weight:700;margin-bottom:18px;">Kiur</div>
      <p style="margin:0 0 14px;line-height:1.9;">{greeting}</p>
      <p style="margin:0 0 22px;line-height:1.9;">
        وصلنا طلب لإعادة تعيين كلمة مرور حسابك. اضغط الزر لاختيار كلمة مرور جديدة —
        الرابط صالح لمدة {ttl_minutes} دقيقة.
      </p>
      <p style="margin:0 0 24px;">
        <a href="{reset_url}"
           style="display:inline-block;background:#4C5FE0;color:#fff;text-decoration:none;
                  padding:13px 26px;border-radius:999px;font-weight:700;">
          تعيين كلمة مرور جديدة
        </a>
      </p>
      <p style="margin:0 0 8px;font-size:.85rem;color:#4A5578;line-height:1.9;">
        إذا لم تطلب هذا، تجاهل الرسالة — كلمة مرورك الحالية تبقى كما هي.
      </p>
      <p style="margin:0;font-size:.75rem;color:#7E88AC;word-break:break-all;">
        أو انسخ هذا الرابط: {reset_url}
      </p>
    </div>
  </body>
</html>"""
    return send_email(to, "إعادة تعيين كلمة المرور — Kiur", text_body, html_body)
