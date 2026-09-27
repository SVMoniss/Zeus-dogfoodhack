"""Add prizes to events (T1: configurable prizes).

Revision ID: 001_add_event_prizes
Revises:
Create Date: 2026-09-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "001_add_event_prizes"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "events",
        sa.Column("prizes", JSONB, nullable=False, server_default="[]"),
    )


def downgrade() -> None:
    op.drop_column("events", "prizes")
