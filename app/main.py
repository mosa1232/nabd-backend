from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, RedirectResponse, Response
from sqlalchemy import inspect, text
from starlette.middleware.sessions import SessionMiddleware

from . import models  # noqa: F401  (registers tables on Base.metadata)
from .config import get_settings
from .database import Base, engine
from .routers import (
    activation, admin, ai as ai_router, auth, representative, verification, bans, catalog, courses, exams, import_export, pearls,
    notifications, professors, public, questions, reseller, store, students, summer,
)
from .storage import name_from_url, storage

settings = get_settings()
FRONTEND_DIR = Path(__file__).resolve().parent.parent

app = FastAPI(title="Nabd API", version="0.1.0")

# Required by Authlib to stash the OAuth `state` between the redirect to
# Google and the callback.
app.add_middleware(SessionMiddleware, secret_key=settings.jwt_secret)

# Compress responses over 1 KB: the two single-file apps are ~400 KB of HTML/JS
# each and shrink to a fraction of that on the wire (Cloudflare adds brotli on top).
app.add_middleware(GZipMiddleware, minimum_size=1024)

app.add_middleware(
    CORSMiddleware,
    # The session cookie needs allow_credentials=True, and the CORS spec
    # forbids pairing that with "*" — browsers reject the combination. In
    # production both SPAs are served by this same app, so same-origin
    # requests never hit CORS at all; in dev the frontend is a separate
    # origin, matched by regex so any localhost port keeps working.
    **(
        {"allow_origin_regex": r"https?://(localhost|127\.0\.0\.1)(:\d+)?"}
        if settings.debug
        else {"allow_origins": settings.cors_origins_list}
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(catalog.router)
app.include_router(questions.router)
app.include_router(professors.router)
app.include_router(courses.router)
app.include_router(store.router)
app.include_router(admin.router)
app.include_router(reseller.router)
app.include_router(activation.router)
app.include_router(bans.router)
app.include_router(import_export.router)
app.include_router(exams.router)
app.include_router(notifications.router)
app.include_router(students.router)
app.include_router(pearls.router)
app.include_router(public.router)
app.include_router(summer.router)
app.include_router(ai_router.router)
app.include_router(representative.router)
app.include_router(verification.router)

@app.get("/media-files/{name}")
def serve_media(name: str):
    """Serves an uploaded file, whichever backend it lives on.

    The database always stores `/media-files/<name>`, so a booklet uploaded
    before the switch to object storage keeps working and a signed URL is
    never persisted where it could go stale. With the local backend this
    streams the file off disk; with S3 it redirects to a short-lived signed
    URL, which is also what lets video range-requests go straight to the
    object store instead of through this process.
    """
    safe = name_from_url(f"/media-files/{name}")
    if not safe:
        raise HTTPException(404, "الملف غير موجود")

    path = storage.local_path(safe)
    if path is not None:
        return FileResponse(path)

    stored = storage.read(safe)
    if stored is not None:   # kept in the database
        data, ctype = stored
        return Response(content=data, media_type=ctype, headers={
            "Cache-Control": "public, max-age=86400",
            "X-Content-Type-Options": "nosniff",
        })

    url = storage.signed_url(safe)
    if url and storage.exists(safe):
        # 307 keeps the method and is not cached, so the next request gets a
        # freshly signed URL rather than a stale one out of the browser cache.
        return RedirectResponse(url, status_code=307)
    raise HTTPException(404, "الملف غير موجود")


def _patch_missing_columns():
    """create_all() only creates tables that don't exist yet — it never adds
    columns to a table that's already there. Since this project has no
    migration tool, new columns on existing models (e.g. User.phone) would
    silently never appear on a database that predates them. This walks each
    model's columns against what's actually in the DB and ALTERs in whatever
    is missing, so an upgrade is just "restart the server"."""
    inspector = inspect(engine)
    dialect = engine.dialect
    quote = dialect.identifier_preparer.quote
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if not inspector.has_table(table.name):
                continue
            existing = {c["name"] for c in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in existing:
                    continue
                # PostgreSQL stores Enum columns as a named type that has to
                # exist before a column can reference it. SQLite renders the
                # same column as VARCHAR and create_type is a no-op there.
                if hasattr(column.type, "create"):
                    column.type.create(conn, checkfirst=True)
                col_type = column.type.compile(dialect)
                # Quote both identifiers: an unquoted column named e.g. "user"
                # or "order" is a syntax error on PostgreSQL.
                conn.execute(text(
                    f'ALTER TABLE {quote(table.name)} ADD COLUMN {quote(column.name)} {col_type}'
                ))
                # A freshly-added column is NULL on every pre-existing row.
                # Backfill it to the model's declared default (when it's a
                # plain literal) so those rows match what a brand-new row
                # would get — e.g. a bool column with default=False must
                # never come back as NULL, which schemas.py's `bool` fields
                # reject outright.
                default = getattr(column, "default", None)
                if default is not None and getattr(default, "is_scalar", False):
                    conn.execute(
                        text(
                            f'UPDATE {quote(table.name)} SET {quote(column.name)} = :val '
                            f'WHERE {quote(column.name)} IS NULL'
                        ),
                        {"val": default.arg},
                    )


def _patch_enum_values():
    """PostgreSQL stores each Enum as a named type, and `create_all` never adds
    labels to a type that already exists — so a database created before the
    supervisor / store_manager / assistant roles existed would reject them
    ("invalid input value for enum"). Add any missing label. SQLite stores
    Enums as plain text, so there's nothing to do there."""
    if engine.dialect.name != "postgresql":
        return
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        seen: set[str] = set()
        for table in Base.metadata.sorted_tables:
            for column in table.columns:
                enum_type = column.type
                name = getattr(enum_type, "name", None)
                labels = getattr(enum_type, "enums", None)
                if not name or not labels or name in seen:
                    continue
                seen.add(name)
                existing = {
                    row[0] for row in conn.execute(
                        text("SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = :n"),
                        {"n": name},
                    )
                }
                if not existing:
                    continue  # type doesn't exist yet — create_all made it complete
                for label in labels:
                    if label not in existing:
                        quoted = label.replace("'", "''")
                        conn.execute(text(f'ALTER TYPE "{name}" ADD VALUE IF NOT EXISTS \'{quoted}\''))


def _backfill_reseller_permissions():
    """Resellers created before per-reseller permissions existed could view and
    generate codes. Give them exactly that (once — only while their grants have
    never been configured), so the upgrade doesn't lock anyone out."""
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE users SET permissions = 'codes.generate,codes.view' "
                 "WHERE role = 'reseller' AND permissions IS NULL")
        )


@app.on_event("startup")
def on_startup():
    # Enum labels must exist before anything tries to use them, and create_all
    # (which may create the types fresh) has to run first so existing types are
    # the only ones patched.
    Base.metadata.create_all(bind=engine)
    _patch_enum_values()
    _patch_missing_columns()
    _backfill_reseller_permissions()
    # No demo data auto-seeded — this instance starts genuinely empty.
    # Whoever signs in with BOOTSTRAP_ADMIN_EMAIL becomes admin (see auth.py) so
    # there's still a way in without fake accounts. Run `python seed.py`
    # yourself if you ever want the demo dataset back for local testing.


@app.get("/health")
def health():
    return {"status": "ok"}


# Serves both frontend files from this same FastAPI app so the whole
# platform is one deployable service — no separate static host needed.
#
# Each app is a single HTML file that carries all of its own CSS and JS, so
# a cached copy is a whole stale release: without this header browsers were
# heuristically caching it and showing yesterday's app after a deploy.
# "no-cache" still lets the ETag do its job — the browser revalidates and
# gets a 304 when nothing changed.
SPA_HEADERS = {"Cache-Control": "no-cache"}


@app.get("/")
def serve_student_app():
    return FileResponse(FRONTEND_DIR / "nabd-home-quiz-prototype.html", headers=SPA_HEADERS)


@app.get("/admin")
def serve_admin_app():
    return FileResponse(FRONTEND_DIR / "nabd-admin-dashboard.html", headers=SPA_HEADERS)
