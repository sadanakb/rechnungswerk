"""Phase 11: push_subscriptions + gdpr_delete_requests tables

Revision ID: e0f6h2i3j4k5
Revises: d9e5g1h2i3j4
Create Date: 2026-02-28
"""
from typing import Union
import sqlalchemy as sa
from alembic import op

revision: str = 'e0f6h2i3j4k5'
down_revision: Union[str, None] = 'd9e5g1h2i3j4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'push_subscriptions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('organization_id', sa.Integer(), sa.ForeignKey('organizations.id'), nullable=False),
        sa.Column('fcm_token', sa.String(500), nullable=False),
        sa.Column('device_label', sa.String(100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_push_subscriptions_id', 'push_subscriptions', ['id'])
    op.create_index('ix_push_subscriptions_user_id', 'push_subscriptions', ['user_id'])
    op.create_index('ix_push_subscriptions_organization_id', 'push_subscriptions', ['organization_id'])

    op.create_table(
        'gdpr_delete_requests',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('token', sa.String(64), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_gdpr_delete_requests_id', 'gdpr_delete_requests', ['id'])
    op.create_index('ix_gdpr_delete_requests_token', 'gdpr_delete_requests', ['token'], unique=True)
    op.create_index('ix_gdpr_delete_requests_user_id', 'gdpr_delete_requests', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_gdpr_delete_requests_user_id', table_name='gdpr_delete_requests')
    op.drop_index('ix_gdpr_delete_requests_token', table_name='gdpr_delete_requests')
    op.drop_index('ix_gdpr_delete_requests_id', table_name='gdpr_delete_requests')
    op.drop_table('gdpr_delete_requests')

    op.drop_index('ix_push_subscriptions_organization_id', table_name='push_subscriptions')
    op.drop_index('ix_push_subscriptions_user_id', table_name='push_subscriptions')
    op.drop_index('ix_push_subscriptions_id', table_name='push_subscriptions')
    op.drop_table('push_subscriptions')
