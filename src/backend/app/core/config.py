from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://dogfood:dogfood@localhost:5432/dogfood"
    # Railway exposes both a public URL and a private-network URL. Prefer an
    # explicitly set DATABASE_URL, fall back to the private one (internal
    # traffic needs no TLS). An *empty* DATABASE_URL (e.g. a misspelled
    # `${{Service.DATABASE_URL}}` reference, which Railway resolves to "")
    # counts as unset so boot fails with a clear message instead of a
    # cryptic `Could not parse SQLAlchemy URL` from deep in the stack.
    DATABASE_PRIVATE_URL: Optional[str] = None
    # Managed providers (Render, Railway, …) hand out bare `postgres://` URLs;
    # normalize to the asyncpg driver scheme the engine expects.
    DB_SSL: bool = False
    SECRET_KEY: str = "dev-secret-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    FRONTEND_URL: str = "http://localhost:3000"
    # Cookie flags for split-domain deploys (Railway gives backend and
    # frontend different public hosts). Auto-derived from FRONTEND_URL
    # when unset: https frontend -> Secure + SameSite=None so the
    # httpOnly `session` cookie is sent on cross-site XHR with
    # credentials:include; http frontend/local -> Lax without Secure.
    COOKIE_SECURE: Optional[bool] = None
    COOKIE_SAMESITE: Optional[str] = None

    class Config:
        env_file = ".env"
        case_sensitive = True

    def model_post_init(self, _context) -> None:
        url = (self.DATABASE_URL or "").strip().strip("'\"")
        if not url and self.DATABASE_PRIVATE_URL:
            url = self.DATABASE_PRIVATE_URL.strip().strip("'\"")
        if url.startswith("postgres://"):
            url = "postgresql+asyncpg://" + url[len("postgres://"):]
        elif url.startswith("postgresql://"):
            url = "postgresql+asyncpg://" + url[len("postgresql://"):]
        if not url:
            raise RuntimeError(
                "DATABASE_URL is empty: the backend has no database to connect to. "
                "On Railway, add a Postgres service, then in the backend service "
                "Variables use '+ New Variable > Add Reference > <postgres service> "
                "> DATABASE_URL' (a hand-typed ${{...}} with a wrong service name "
                "resolves to an empty string)."
            )
        self.DATABASE_URL = url

    @property
    def db_connect_args(self) -> dict:
        # Railway private-network hosts (*.railway.internal) speak plain
        # Postgres; the public proxy requires TLS.
        if "railway.internal" in self.DATABASE_URL:
            return {}
        return {"ssl": True} if self.DB_SSL else {}

    @property
    def cookie_secure(self) -> bool:
        if self.COOKIE_SECURE is not None:
            return self.COOKIE_SECURE
        return self.FRONTEND_URL.startswith("https://")

    @property
    def cookie_samesite(self) -> str:
        if self.COOKIE_SAMESITE:
            return self.COOKIE_SAMESITE.lower()
        return "none" if self.cookie_secure else "lax"


settings = Settings()