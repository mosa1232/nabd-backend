from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import get_settings

settings = get_settings()


def _normalize_url(url: str) -> str:
    """Managed Postgres providers (Render, Heroku, Railway) hand out URLs
    starting with `postgres://`, a scheme SQLAlchemy 2.x refuses to load a
    dialect for. Rewrite it to the driver this project installs, so the
    connection string can be pasted in exactly as the provider gives it.
    """
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://"):]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


DATABASE_URL = _normalize_url(settings.database_url)
_is_sqlite = DATABASE_URL.startswith("sqlite")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
    # A managed Postgres (and anything behind a proxy) drops connections that
    # have been idle a while. Without pre-ping the pool hands out a dead
    # connection and the request fails with "server closed the connection
    # unexpectedly"; with it, the dead one is discarded and replaced. recycle
    # keeps connections under typical provider idle timeouts in the first place.
    pool_pre_ping=not _is_sqlite,
    pool_recycle=300 if not _is_sqlite else -1,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
