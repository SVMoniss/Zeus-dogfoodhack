"""Judge conflict declarations (pipeline doc: conflict-aware assignment).

Revision ID: 006_conflicts
Revises: 005_audit_events
Create Date: 2026-09-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "006_conflicts"
down_revision = "005_audit_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "conflicts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("event_id", UUID(as_uuid=True), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("judge_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("reason", sa.String(500)),
        sa.Column("declared_by", UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("event_id", "judge_id", "project_id", name="uq_conflict"),
    )


def downgrade() -> None:
    op.drop_table("conflicts")
