"""Test bootstrap: stub DB driver so importing app.api works without a live DB.

System python has sqlalchemy but not asyncpg. SQLAlchemy only needs the
driver module to be importable at engine-creation time (no connection is
made), so a lightweight stub is sufficient for hermetic unit tests.
"""
import sys
import types

try:
    import asyncpg  # noqa: F401
except ImportError:
    stub = types.ModuleType("asyncpg")
    sys.modules["asyncpg"] = stub
