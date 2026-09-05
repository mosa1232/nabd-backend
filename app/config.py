from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database — SQLite by default for local dev, point DATABASE_URL at
    # postgresql+psycopg://user:pass@host/db in production (per the SRS).
    database_url: str = "sqlite:///./nabd.db"

    # Auth
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expires_minutes: int = 60 * 24 * 14  # 14 days

    # The single email allowed to claim the admin role while the platform has
    # no admin yet. Empty = nobody is ever auto-promoted (see
    # _should_bootstrap_admin in routers/auth.py).
    bootstrap_admin_email: str = ""

    # Google OAuth (create credentials at console.cloud.google.com)
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/auth/google/callback"

    # Only accounts whose email ends with one of these domains can sign in.
    # Leave empty to allow any Google account (useful for local testing).
    allowed_university_domains: str = ""

    # Where to send the browser after a successful login
    frontend_url: str = "http://localhost:5500"

    # Comma-separated list of origins allowed to call this API
    cors_origins: str = "http://localhost:5500,http://127.0.0.1:5500"

    # Enables /auth/dev-login, which issues a session without real Google
    # credentials — for local development only. Defaults to OFF so that a
    # deployment which forgets to set DEBUG can't accidentally expose a
    # password-free login for any email; local dev sets DEBUG=true in .env.
    debug: bool = False

    session_cookie_name: str = "nabd_session"

    @property
    def allowed_domains_list(self) -> list[str]:
        return [d.strip() for d in self.allowed_university_domains.split(",") if d.strip()]

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


DEFAULT_JWT_SECRET = "dev-secret-change-me"


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    # Refuse to boot a production instance still signing tokens with the
    # public default secret — anyone reading this repo could otherwise forge
    # a token for any account, including an admin.
    if not settings.debug and settings.jwt_secret == DEFAULT_JWT_SECRET:
        raise RuntimeError(
            "JWT_SECRET is still the default value. Set a real secret "
            "(e.g. `python -c \"import secrets; print(secrets.token_urlsafe(48))\"`) "
            "before running with DEBUG=false."
        )
    return settings
