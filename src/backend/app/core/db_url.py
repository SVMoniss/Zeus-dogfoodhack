"""Database URL helpers for managed Postgres (Neon/Supabase) + local compose.

Local `docker compose up` uses ``postgresql+asyncpg://dogfood:dogfood@postgres:5432/dogfood``
with no TLS, and must keep working byte-for-byte. Managed providers hand out
plain ``postgresql://...`` URLs with ``?sslmode=require`` and valid certs:

- async (asyncpg): needs the ``postgresql+asyncpg://`` driver prefix and does
  NOT understand ``?sslmode=`` — TLS goes through ``connect_args`` instead.
- sync (psycopg2, used by alembic): needs ``postgresql+psycopg2://`` and
  understands ``?sslmode=require`` natively.

TLS is enabled when ``DB_SSL`` is truthy, when the URL carries
``sslmode=require`` (or verify-ca/verify-full), or when the host is a known
managed provider (``neon.tech``, ``supabase.co``).
"""

import os
import ssl
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

_MANAGED_SUFFIXES = ("neon.tech", "supabase.co")
_TRUE_VALUES = ("1", "true", "yes", "on")


def wants_ssl(raw_url: str) -> bool:
    """Whether this database connection needs TLS."""
    if os.getenv("DB_SSL", "").strip().lower() in _TRUE_VALUES:
        return True
    parts = urlsplit(raw_url or "")
    query = dict(parse_qsl(parts.query))
    if query.get("sslmode", "").lower() in ("require", "verify-ca", "verify-full"):
        return True
    host = (parts.hostname or "").lower()
    return any(host.endswith(suffix) for suffix in _MANAGED_SUFFIXES)


def _with_driver(raw_url: str, driver: str) -> str:
    """Qualify a bare postgres(s):// URL with the given SQLAlchemy driver."""
    if "://" not in raw_url:
        return raw_url
    scheme, rest = raw_url.split("://", 1)
    if scheme.split("+")[0] in ("postgres", "postgresql"):
        return f"{driver}://{rest}"
    return raw_url  # already qualified (or non-postgres); leave alone


def async_database_url(raw_url: str) -> str:
    """Driver-qualified URL for asyncpg (``?sslmode=`` stripped)."""
    parts = urlsplit(_with_driver(raw_url, "postgresql+asyncpg"))
    query = [(k, v) for k, v in parse_qsl(parts.query) if k.lower() != "sslmode"]
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def sync_database_url(raw_url: str) -> str:
    """Driver-qualified URL for psycopg2 (keeps/adds ``?sslmode=require``)."""
    url = _with_driver(raw_url, "postgresql+psycopg2")
    if wants_ssl(raw_url):
        parts = urlsplit(url)
        query = dict(parse_qsl(parts.query))
        query.setdefault("sslmode", "require")
        url = urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))
    return url


def async_connect_args(raw_url: str) -> dict:
    """Extra ``create_async_engine`` kwargs (TLS context when needed)."""
    if not wants_ssl(raw_url):
        return {}
    return {"ssl": ssl.create_default_context()}
