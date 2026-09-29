FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
RUN pip install --no-cache-dir uv && uv sync

COPY . .

EXPOSE 8000

# Railway/Render set $PORT. Boot order is seed-then-migrate: on a fresh DB
# seed.py create_alls the full schema and stamps migration head (the 001..007
# ALTERs assume pre-existing tables and crash on an empty database); on an
# existing DB seed is idempotent and alembic applies pending migrations.
# No --reload in production images.
CMD ["sh", "-c", "uv run python seed.py && uv run alembic upgrade head && uv run uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]