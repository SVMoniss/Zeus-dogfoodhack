from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://dogfood:dogfood@localhost:5432/dogfood"
    SECRET_KEY: str = "dev-secret-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    FRONTEND_URL: str = "http://localhost:3000"
    # Managed Postgres (Neon/Supabase): set DB_SSL=true to force TLS even
    # when the URL has no ?sslmode= (neon.tech / supabase.co hosts and
    # sslmode=require URLs are detected automatically). See app/core/db_url.py.
    DB_SSL: bool = False
    # Session cookie flags. Local compose uses False/"lax". Cross-site HTTPS
    # deploys (e.g. Static Web Apps frontend + Container Apps API) need
    # COOKIE_SECURE=true + COOKIE_SAMESITE=none.
    COOKIE_SECURE: bool = False
    COOKIE_SAMESITE: str = "lax"

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()