# Production image for the Nabd platform. Works on x86-64 and on ARM (Oracle's
# free Ampere A1 machines) — every dependency ships wheels for both.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependencies first so code edits don't re-install them.
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Run as an unprivileged user; uploads live in a mounted volume it can write.
RUN useradd --system --uid 10001 --no-create-home app \
    && mkdir -p /app/uploads \
    && chown -R app:app /app/uploads
USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)" || exit 1

# One worker on purpose: the AI rate limits and the question-bank search index
# are kept in memory per process. --proxy-headers because Caddy (and
# Cloudflare behind it) sit in front; the port is never published to the
# internet, only to the compose network, so trusting the headers is safe.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
