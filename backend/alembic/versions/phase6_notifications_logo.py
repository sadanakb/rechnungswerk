"""add Phase 6 — notifications table

Revision ID: 8b4e2f7a1c93
Revises: 7a3f891c2e45
Create Date: 2026-02-27 16:00:00.000000
"""
from typing import Union
from alembic import op
import sqlalchemy as sa

revision: str = '8b4e2f7a1c93'
down_revision: Union[str, None] = '7a3f891c2e45'
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.create_table(
        'notifications',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('org_id', sa.Integer(), nullable=False, index=True),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('type', sa.String(100), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('message', sa.String(1000), nullable=False),
        sa.Column('is_read', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('link', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )

def downgrade() -> None:
    op.drop_table('notifications')
