from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://dogfood:dogfood@localhost:5432/dogfood"
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
        if self.DATABASE_URL.startswith("postgres://"):
            self.DATABASE_URL = "postgresql+asyncpg://" + self.DATABASE_URL[len("postgres://"):]
        elif self.DATABASE_URL.startswith("postgresql://"):
            self.DATABASE_URL = "postgresql+asyncpg://" + self.DATABASE_URL[len("postgresql://"):]

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