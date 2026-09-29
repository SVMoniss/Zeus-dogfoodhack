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

    class Config:
        env_file = ".env"
        case_sensitive = True

    def model_post_init(self, _context) -> None:
        if self.DATABASE_URL.startswith("postgres://"):
            self.DATABASE_URL = "postgresql+asyncpg://" + self.DATABASE_URL[len("postgres://"):]
        elif self.DATABASE_URL.startswith("postgresql://"):
            self.DATABASE_URL = "postgresql+asyncpg://" + self.DATABASE_URL[len("postgresql://"):]


settings = Settings()