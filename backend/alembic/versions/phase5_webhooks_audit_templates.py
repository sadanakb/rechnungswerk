"""add Phase 5 — webhooks, audit logs, invoice templates, API keys

Revision ID: 7a3f891c2e45
Revises: 2fbbf4591b5d
Create Date: 2026-02-27 15:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision: str = '7a3f891c2e45'
down_revision: Union[str, None] = '2fbbf4591b5d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Create webhook_subscriptions table ---
    op.create_table(
        'webhook_subscriptions',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('org_id', sa.Integer(), nullable=False, index=True),
        sa.Column('url', sa.Text(), nullable=False),
        sa.Column('events', sa.Text(), nullable=False),
        sa.Column('secret', sa.String(length=128), nullable=False),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('created_at', sa.DateTime(), default=sa.func.now()),
    )

    # --- Create webhook_deliveries table ---
    op.create_table(
        'webhook_deliveries',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('subscription_id', sa.Integer(), nullable=False, index=True),
        sa.Column('event_type', sa.String(length=100), nullable=False),
        sa.Column('payload', sa.Text(), nullable=False),
        sa.Column('status', sa.String(length=20), default='pending'),
        sa.Column('attempts', sa.Integer(), default=0),
        sa.Column('last_attempted_at', sa.DateTime(), nullable=True),
        sa.Column('response_code', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), default=sa.func.now()),
    )

    # --- Create audit_logs table ---
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('org_id', sa.Integer(), nullable=False, index=True),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('action', sa.String(length=100), nullable=False),
        sa.Column('resource_type', sa.String(length=100), nullable=True),
        sa.Column('resource_id', sa.String(length=255), nullable=True),
        sa.Column('details', sa.Text(), nullable=True),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('created_at', sa.DateTime(), default=sa.func.now(), index=True),
    )

    # --- Create invoice_templates table ---
    op.create_table(
        'invoice_templates',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('org_id', sa.Integer(), nullable=False, index=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('logo_url', sa.Text(), nullable=True),
        sa.Column('primary_color', sa.String(length=7), default='#14b8a6'),
        sa.Column('footer_text', sa.Text(), nullable=True),
        sa.Column('payment_terms', sa.Integer(), default=30),
        sa.Column('bank_iban', sa.String(length=34), nullable=True),
        sa.Column('bank_bic', sa.String(length=11), nullable=True),
        sa.Column('bank_name', sa.String(length=255), nullable=True),
        sa.Column('default_vat_rate', sa.String(length=10), default='19.0'),
        sa.Column('notes_template', sa.Text(), nullable=True),
        sa.Column('is_default', sa.Boolean(), default=False),
        sa.Column('created_at', sa.DateTime(), default=sa.func.now()),
    )

    # --- Create api_keys table ---
    op.create_table(
        'api_keys',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('org_id', sa.Integer(), nullable=False, index=True),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('key_prefix', sa.String(length=16), nullable=False),
        sa.Column('key_hash', sa.String(length=255), nullable=False),
        sa.Column('scopes', sa.Text(), nullable=True),
        sa.Column('last_used_at', sa.DateTime(), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('created_at', sa.DateTime(), default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('api_keys')
    op.drop_table('invoice_templates')
    op.drop_table('audit_logs')
    op.drop_table('webhook_deliveries')
    op.drop_table('webhook_subscriptions')
