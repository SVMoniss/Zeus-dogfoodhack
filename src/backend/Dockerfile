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

# Railway/Render set $PORT; migrate + reseed fixtures on boot (demo playground:
# redeploy resets) then serve. No --reload in production images.
CMD ["sh", "-c", "uv run alembic upgrade head && uv run python seed.py && uv run uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]