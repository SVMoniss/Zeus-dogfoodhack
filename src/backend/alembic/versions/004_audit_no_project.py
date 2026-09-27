"""Allow event-level audit rows in vote_audit_log (T3 anti-abuse).

Revision ID: 004_audit_no_project
Revises: 003_vote_token_rows
Create Date: 2026-09-27
"""
from alembic import op
import sqlalchemy as sa


revision = "004_audit_no_project"
down_revision = "003_vote_token_rows"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("vote_audit_log", "project_id", existing_type=sa.dialects.postgresql.UUID(as_uuid=True), nullable=True)


def downgrade() -> None:
    op.alter_column("vote_audit_log", "project_id", existing_type=sa.dialects.postgresql.UUID(as_uuid=True), nullable=False)
