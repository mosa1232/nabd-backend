from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from . import models
from .config import get_settings
from .database import Base, SessionLocal, engine
from .routers import activation, admin, auth, bans, catalog, courses, import_export, professors, questions, reseller, store
from .routers.admin import UPLOAD_DIR

settings = get_settings()
FRONTEND_DIR = Path(__file__).resolve().parent.parent

app = FastAPI(title="Nabd API", version="0.1.0")

# Required by Authlib to stash the OAuth `state` between the redirect to
# Google and the callback.
app.add_middleware(SessionMiddleware, secret_key=settings.jwt_secret)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.debug else settings.cors_origins_list,
    allow_credentials=False,  # we use Bearer tokens, not cookies, so this is safe with "*"
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

app.mount("/media-files", StaticFiles(directory=UPLOAD_DIR), name="media-files")


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    # Self-seeds an empty database — matters on hosts with ephemeral disk,
    # where every redeploy/restart otherwise boots with nothing in it.
    from seed import run_seed
    db = SessionLocal()
    try:
        run_seed(db)
    finally:
        db.close()


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
