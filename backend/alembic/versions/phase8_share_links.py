"""add Phase 8 — invoice_share_links table

Revision ID: b7c3e9f4d2a1
Revises: 9c5d8e3f2a71
Create Date: 2026-02-27 20:00:00.000000
"""
from typing import Union

from alembic import op
import sqlalchemy as sa

revision: str = 'b7c3e9f4d2a1'
down_revision: Union[str, None] = '9c5d8e3f2a71'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'invoice_share_links',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            'invoice_id',
            sa.Integer(),
            sa.ForeignKey('invoices.id'),
            nullable=False,
            unique=True,
        ),
        sa.Column('token', sa.String(36), nullable=False, unique=True),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('access_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_by_user_id', sa.Integer(), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index('ix_invoice_share_links_token', 'invoice_share_links', ['token'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_invoice_share_links_token', table_name='invoice_share_links')
    op.drop_table('invoice_share_links')
