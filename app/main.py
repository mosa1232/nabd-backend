from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import inspect, text
from starlette.middleware.sessions import SessionMiddleware

from . import models
from .config import get_settings
from .database import Base, engine
from .routers import (
    activation, admin, auth, bans, catalog, courses, exams, import_export, pearls,
    notifications, professors, questions, reseller, store, students,
)
from .storage import name_from_url, storage

settings = get_settings()
FRONTEND_DIR = Path(__file__).resolve().parent.parent

app = FastAPI(title="Nabd API", version="0.1.0")

# Required by Authlib to stash the OAuth `state` between the redirect to
# Google and the callback.
app.add_middleware(SessionMiddleware, secret_key=settings.jwt_secret)

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


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    _patch_missing_columns()
    # No demo data auto-seeded — this instance starts genuinely empty.
    # Whoever signs in with BOOTSTRAP_ADMIN_EMAIL becomes admin (see auth.py) so
    # there's still a way in without fake accounts. Run `python seed.py`
    # yourself if you ever want the demo dataset back for local testing.


@app.get("/health")
def health():
    return {"status": "ok"}


# Serves both frontend files from this same FastAPI app so the whole
# platform is one deployable service — no separate static host needed.
@app.get("/")
def serve_student_app():
    return FileResponse(FRONTEND_DIR / "nabd-home-quiz-prototype.html")


@app.get("/admin")
def serve_admin_app():
    return FileResponse(FRONTEND_DIR / "nabd-admin-dashboard.html")
