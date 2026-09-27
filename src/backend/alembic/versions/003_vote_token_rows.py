"""Allow ballot-token rows in community_votes (T3 email-gated voting).

Token rows carry voter + event only; project/score are set when cast.

Revision ID: 003_vote_token_rows
Revises: 002_score_submitted_at
Create Date: 2026-09-27
"""
from alembic import op
import sqlalchemy as sa


revision = "003_vote_token_rows"
down_revision = "002_score_submitted_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("community_votes", "project_id", existing_type=sa.dialects.postgresql.UUID(as_uuid=True), nullable=True)
    op.alter_column("community_votes", "score", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    op.alter_column("community_votes", "project_id", existing_type=sa.dialects.postgresql.UUID(as_uuid=True), nullable=False)
    op.alter_column("community_votes", "score", existing_type=sa.Integer(), nullable=False)
