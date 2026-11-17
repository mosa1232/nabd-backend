"""Request-level protections that apply to the whole app:

* RateLimitMiddleware - a cap per client address on the endpoints attackers hammer
  (password guessing, mass sign-up, reset-email flooding, 2FA code guessing).
  The per-account lockout already stops one account being guessed; this stops
  one address trying thousands of accounts or creating thousands of accounts.
* SecurityHeadersMiddleware - Content-Security-Policy and friends on the pages.

In-memory and per process (the app runs as one process). A restart clears the counters,
which only ever makes the limit more lenient, never stricter."""
import json
import threading
import time
from collections import defaultdict, deque

# (method, path) -> (max requests, window seconds, message)
RULES = {
    ("POST", "/auth/login"): (30, 600, "محاولات دخول كثيرة من هذا الجهاز — انتظر بضع دقائق ثم أعد المحاولة"),
    ("POST", "/auth/register"): (10, 3600, "تم إنشاء حسابات كثيرة من هذا الجهاز — حاول لاحقًا"),
    ("POST", "/auth/forgot-password"): (8, 3600, "طلبات استعادة كثيرة — حاول لاحقًا"),
    ("POST", "/auth/reset-password"): (12, 3600, "محاولات كثيرة — حاول لاحقًا"),
    ("POST", "/auth/2fa/verify"): (20, 600, "محاولات كثيرة لرمز التحقق — انتظر قليلًا"),
}

_hits: dict[tuple, deque] = defaultdict(deque)
_lock = threading.Lock()
_last_sweep = [0.0]


def _client_ip(scope) -> str:
    h = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers", [])}
    return ((h.get("x-forwarded-for", "").split(",")[0].strip() or h.get("x-real-ip", "")
             or (scope.get("client") or ("",))[0]) or "?")[:64]


class RateLimitMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            rule = RULES.get((scope.get("method", ""), scope.get("path", "")))
            if rule:
                limit, window, message = rule
                key = (scope["path"], _client_ip(scope))
                now = time.time()
                with _lock:
                    q = _hits[key]
                    while q and now - q[0] > window:
                        q.popleft()
                    blocked = len(q) >= limit
                    if not blocked:
                        q.append(now)
                    retry = int(window - (now - q[0])) + 1 if q else window
                    if now - _last_sweep[0] > 600:      # forget addresses that went quiet
                        _last_sweep[0] = now
                        for k in [k for k, v in _hits.items() if not v or now - v[-1] > 3600]:
                            _hits.pop(k, None)
                if blocked:
                    body = json.dumps({"detail": message}, ensure_ascii=False).encode()
                    await send({"type": "http.response.start", "status": 429, "headers": [
                        (b"content-type", b"application/json; charset=utf-8"), (b"retry-after", str(retry).encode()),
                        (b"content-length", str(len(body)).encode())]})
                    await send({"type": "http.response.body", "body": body})
                    return
        await self.app(scope, receive, send)


CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "connect-src 'self' blob: data:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com",
    "frame-ancestors 'self'",
])
EXTRA = [
    (b"content-security-policy", CSP.encode()),
    (b"permissions-policy", b"camera=(), microphone=(), geolocation=(), payment=(), usb=()"),
    (b"cross-origin-opener-policy", b"same-origin-allow-popups"),
]


class SecurityHeadersMiddleware:
    """Adds the policy to HTML pages (the API's JSON needs none)."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def wrapped(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                ctype = next((v for k, v in headers if k.lower() == b"content-type"), b"")
                if ctype.startswith(b"text/html"):
                    have = {k.lower() for k, _ in headers}
                    headers += [(k, v) for k, v in EXTRA if k not in have]
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, wrapped)
