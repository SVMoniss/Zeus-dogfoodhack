"""Add submitted_at to scores (T2: judge scores serialization).

Revision ID: 002_score_submitted_at
Revises: 001_add_event_prizes
Create Date: 2026-09-27
"""
from alembic import op
import sqlalchemy as sa


revision = "002_score_submitted_at"
down_revision = "001_add_event_prizes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "scores",
        sa.Column(
            "submitted_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    # Backfill from row creation time for accuracy on pre-existing rows.
    op.execute("UPDATE scores SET submitted_at = created_at WHERE submitted_at IS NULL")


def downgrade() -> None:
    op.drop_column("scores", "submitted_at")
