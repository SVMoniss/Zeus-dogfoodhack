"""Rubric freeze flag on events (frozen rubrics cannot be edited).

Revision ID: 007_rubric_frozen
Revises: 006_conflicts
Create Date: 2026-09-27
"""
from alembic import op
import sqlalchemy as sa


revision = "007_rubric_frozen"
down_revision = "006_conflicts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "events",
        sa.Column("rubric_frozen", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("events", "rubric_frozen")
