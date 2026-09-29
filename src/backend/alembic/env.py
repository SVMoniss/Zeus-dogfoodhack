from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy import create_engine
from alembic import context
import os
import sys

# Add app to path
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from app.core.database import Base
from app.models import *  # noqa: F403,F401

# this is the Alembic Config object
config = context.config

# Interpret the config file for Python logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Set the database URL from the app settings (use sync driver for alembic).
# NOTE: do NOT use raw os.getenv("DATABASE_URL") here. Managed providers hand
# out bare `postgres://` URLs, which SQLAlchemy 2.x maps to the psycopg (v3)
# driver that isn't installed (we ship psycopg2). settings.DATABASE_URL is
# already normalized to `postgresql+asyncpg://`, honors DATABASE_PRIVATE_URL,
# and fails fast with a clear error when no database is configured.
from app.core.config import settings

sync_url = settings.DATABASE_URL.replace(
    "postgresql+asyncpg://", "postgresql+psycopg2://"
)
config.set_main_option("sqlalchemy.url", sync_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    # Public managed-Postgres URLs need TLS; private-network/local ones don't.
    ssl_args = {"sslmode": "require"} if settings.db_connect_args.get("ssl") else {}
    connectable = create_engine(
        config.get_main_option("sqlalchemy.url"),
        poolclass=pool.NullPool,
        connect_args=ssl_args,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()