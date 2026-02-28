"""add Phase 9 — AI categorization columns to invoices

Revision ID: c8d4f0e5a3b2
Revises: b7c3e9f4d2a1
Create Date: 2026-02-28 10:00:00.000000
"""
from typing import Union
from alembic import op
import sqlalchemy as sa

revision: str = 'c8d4f0e5a3b2'
down_revision: Union[str, None] = 'b7c3e9f4d2a1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('invoices', sa.Column('skr03_account', sa.String(10), nullable=True))
    op.add_column('invoices', sa.Column('ai_category', sa.String(100), nullable=True))
    op.add_column('invoices', sa.Column('ai_categorized_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('invoices', 'ai_categorized_at')
    op.drop_column('invoices', 'ai_category')
    op.drop_column('invoices', 'skr03_account')
