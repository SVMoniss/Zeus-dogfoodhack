from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings
from app.core.db_url import async_connect_args, async_database_url

engine = create_async_engine(
    async_database_url(settings.DATABASE_URL),
    connect_args=async_connect_args(settings.DATABASE_URL),
    echo=False,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    async with engine.begin() as conn:
        try:
            # Managed Postgres (Neon): extension is not pre-provisioned the
            # way compose's init.sql does it. Idempotent — no-op locally.
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        except Exception:
            pass  # extension unavailable; semantic search stays disabled
        await conn.run_sync(Base.metadata.create_all)