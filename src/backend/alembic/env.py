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

# Set the database URL from environment (use sync driver for alembic).
# sync_database_url() qualifies bare postgresql:// URLs with psycopg2 and
# keeps/adds ?sslmode=require for managed providers (Neon/Supabase).
database_url = os.getenv("DATABASE_URL")
if database_url:
    from app.core.db_url import sync_database_url

    config.set_main_option("sqlalchemy.url", sync_database_url(database_url))

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
    connectable = create_engine(
        config.get_main_option("sqlalchemy.url"),
        poolclass=pool.NullPool,
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