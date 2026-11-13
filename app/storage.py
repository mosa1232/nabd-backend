"""Where uploaded files actually live.

Booklets, lecture videos and profile photos used to be written straight to
a local `uploads/` directory. That works locally, but on a host with an
ephemeral disk (Render's free plan) the directory is wiped on every deploy,
so every booklet and video a professor had uploaded disappeared — the same
problem the database had before it moved to Postgres.

Two backends, chosen by STORAGE_BACKEND:

- "local"  — the original behaviour, still the default for development.
- "s3"     — any S3-compatible object store: Cloudflare R2, AWS S3,
             Backblaze B2, Supabase Storage, MinIO. Only the endpoint and
             credentials differ, so this is not tied to one provider.

Both are addressed the same way. The database always stores the stable
reference `/media-files/<name>`; nothing outside this module knows which
backend is in use. `GET /media-files/<name>` (app/main.py) then either
serves the bytes from disk or redirects to a short-lived signed URL, so a
stored URL never goes stale and the object store needs no public bucket.
"""
from __future__ import annotations

import logging
import mimetypes
import os
import threading
from pathlib import Path

from fastapi import HTTPException

from .config import get_settings

settings = get_settings()
logger = logging.getLogger("uvicorn.error")

MEDIA_PREFIX = "/media-files/"

UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


def media_url(name: str) -> str:
    """The reference stored in the database for an uploaded file."""
    return f"{MEDIA_PREFIX}{name}"


def name_from_url(media_ref: str | None) -> str | None:
    """The stored object name behind a /media-files/... reference.

    Returns None for anything else, and strips any path so a tampered value
    like "/media-files/../../etc/passwd" can never escape the upload dir or
    the bucket prefix.
    """
    if not media_ref or not media_ref.startswith(MEDIA_PREFIX):
        return None
    return Path(media_ref[len(MEDIA_PREFIX):]).name or None


# --------------------------------------------------------------- backends
class LocalStorage:
    """Files on the server's own disk, served back by FastAPI."""

    kind = "local"

    def save(self, name: str, data: bytes, content_type: str = "") -> None:
        (UPLOAD_DIR / name).write_bytes(data)

    def delete(self, name: str) -> None:
        target = UPLOAD_DIR / name
        try:
            if target.resolve().parent == UPLOAD_DIR.resolve() and target.is_file():
                target.unlink()
        except OSError:
            pass  # a missing or locked file must never block the delete itself

    def exists(self, name: str) -> bool:
        return (UPLOAD_DIR / name).is_file()

    def local_path(self, name: str) -> Path | None:
        path = UPLOAD_DIR / name
        return path if path.is_file() else None

    def signed_url(self, name: str) -> str | None:
        return None  # nothing to redirect to; the bytes are served directly

    def read(self, name: str):
        return None  # served through local_path()


class DbStorage:
    """Files inside the database (a `stored_files` table).

    The point is persistence on a host whose disk is wiped on every deploy
    (Render's free plan) without paying for or configuring an object store.
    Uploaded photos are already shrunk to ~100 KB WebP, so thousands fit in a
    free database. Two caps protect it: one per file, one for the total — a
    full database would take the whole platform down, not just uploads.
    """

    kind = "db"

    @staticmethod
    def _session():
        from .database import SessionLocal  # late: database imports config, not us
        return SessionLocal()

    def save(self, name: str, data: bytes, content_type: str = "") -> None:
        from . import models
        from sqlalchemy import func

        max_file = settings.db_storage_max_file_mb * 1024 * 1024
        if len(data) > max_file:
            raise HTTPException(
                413,
                f"الملف أكبر من الحد المسموح للتخزين داخل قاعدة البيانات ({settings.db_storage_max_file_mb} ميغابايت) — "
                "الملفات والفيديوهات الكبيرة تحتاج تخزينًا خارجيًا (S3 / Cloudflare R2)",
            )
        db = self._session()
        try:
            used = db.query(func.coalesce(func.sum(models.StoredFile.size), 0)).scalar() or 0
            if used + len(data) > settings.db_storage_total_mb * 1024 * 1024:
                raise HTTPException(
                    507,
                    "امتلأت مساحة تخزين الملفات داخل قاعدة البيانات — احذف ملفات قديمة أو فعّل تخزينًا خارجيًا (S3 / R2)",
                )
            # The type is derived from the file name (which the upload code has
            # already restricted to images / PDF / video), NEVER from the
            # client-supplied header: a "booklet.pdf" sent as text/html would
            # otherwise be served back as a web page on this origin.
            ctype = mimetypes.guess_type(name)[0] or "application/octet-stream"
            existing = db.get(models.StoredFile, name)
            if existing:
                existing.data, existing.size, existing.content_type = data, len(data), ctype
            else:
                db.add(models.StoredFile(name=name, data=data, size=len(data), content_type=ctype))
            db.commit()
        finally:
            db.close()

    def delete(self, name: str) -> None:
        from . import models
        db = self._session()
        try:
            db.query(models.StoredFile).filter(models.StoredFile.name == name).delete()
            db.commit()
        except Exception:
            db.rollback()  # a failed cleanup must never block the row delete itself
        finally:
            db.close()

    def exists(self, name: str) -> bool:
        from . import models
        db = self._session()
        try:
            return db.query(models.StoredFile.name).filter(models.StoredFile.name == name).first() is not None
        finally:
            db.close()

    def read(self, name: str):
        """(bytes, content_type) or None."""
        from . import models
        db = self._session()
        try:
            row = db.get(models.StoredFile, name)
            return (bytes(row.data), row.content_type) if row else None
        finally:
            db.close()

    def local_path(self, name: str) -> Path | None:
        return None

    def signed_url(self, name: str) -> str | None:
        return None


class S3Storage:
    """Any S3-compatible object store.

    The client is created lazily and guarded by a lock: boto3 clients are
    thread-safe to *use* but not to *create* concurrently, and a threaded
    server can otherwise build several during the first burst of requests.
    """

    kind = "s3"

    def __init__(self) -> None:
        self._client = None
        self._lock = threading.Lock()
        self.bucket = settings.s3_bucket
        self.prefix = settings.s3_prefix.strip("/")

    def _key(self, name: str) -> str:
        return f"{self.prefix}/{name}" if self.prefix else name

    @property
    def client(self):
        if self._client is None:
            with self._lock:
                if self._client is None:
                    import boto3
                    from botocore.config import Config

                    self._client = boto3.client(
                        "s3",
                        endpoint_url=settings.s3_endpoint_url or None,
                        aws_access_key_id=settings.s3_access_key_id,
                        aws_secret_access_key=settings.s3_secret_access_key,
                        region_name=settings.s3_region,
                        # R2 and most non-AWS stores require SigV4 and
                        # path-style addressing.
                        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
                    )
        return self._client

    def save(self, name: str, data: bytes, content_type: str = "") -> None:
        extra = {"ContentType": content_type} if content_type else {}
        self.client.put_object(Bucket=self.bucket, Key=self._key(name), Body=data, **extra)

    def delete(self, name: str) -> None:
        try:
            self.client.delete_object(Bucket=self.bucket, Key=self._key(name))
        except Exception:
            pass  # same rule as local: never block the row delete on this

    def exists(self, name: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=self._key(name))
            return True
        except Exception:
            return False

    def local_path(self, name: str) -> Path | None:
        return None  # not on this machine

    def read(self, name: str):
        return None  # served through a signed redirect

    def signed_url(self, name: str) -> str | None:
        """A short-lived URL the browser can fetch directly.

        Signed rather than public: booklets and lecture videos are paid
        content, so the bucket stays private and each link expires. Video
        still streams fine — the browser follows the redirect once and makes
        its range requests against the signed URL.
        """
        if settings.s3_public_base_url:
            # A public bucket or CDN in front of one: no signing needed.
            return f"{settings.s3_public_base_url.rstrip('/')}/{self._key(name)}"
        return self.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": self._key(name)},
            ExpiresIn=settings.s3_url_expiry_seconds,
        )


def _build_storage():
    backend = settings.storage_backend.strip().lower()
    # Render sets RENDER=true on its services. Its disk is wiped on every
    # deploy, so "local" there silently loses every upload — keep files in the
    # database instead (set STORAGE_BACKEND=s3 for large files).
    if backend == "local" and os.environ.get("RENDER"):
        logger.warning("Running on Render: keeping uploaded files in the database (its disk is wiped on every deploy).")
        return DbStorage()
    if backend == "db":
        return DbStorage()
    if backend == "s3":
        missing = [
            key for key, value in {
                "S3_BUCKET": settings.s3_bucket,
                "S3_ACCESS_KEY_ID": settings.s3_access_key_id,
                "S3_SECRET_ACCESS_KEY": settings.s3_secret_access_key,
            }.items() if not value
        ]
        if missing:
            # Don't take the whole platform down because uploads aren't
            # configured yet: boot with local disk storage and say so loudly.
            # (Local files are lost on every Render deploy, so set the S3_*
            # variables to make uploads permanent.)
            logger.warning(
                "STORAGE_BACKEND=s3 but these are not set: %s — keeping uploaded files in "
                "the database instead (small files only).",
                ", ".join(missing),
            )
            return DbStorage()
        return S3Storage()
    return LocalStorage()


storage = _build_storage()
