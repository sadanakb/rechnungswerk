"""Phase 12: Stripe Connect fields on organizations + portal_payment_intents table

Revision ID: f1g2h3i4j5k6
Revises: e0f6h2i3j4k5
Create Date: 2026-02-28
"""
from typing import Union
import sqlalchemy as sa
from alembic import op

revision: str = 'f1g2h3i4j5k6'
down_revision: Union[str, None] = 'e0f6h2i3j4k5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add Stripe Connect fields to organizations
    op.add_column('organizations', sa.Column('stripe_connect_account_id', sa.String(255), nullable=True))
    op.add_column('organizations', sa.Column('stripe_connect_onboarded', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('organizations', sa.Column('paypal_link', sa.String(255), nullable=True))

    # Create portal_payment_intents table
    op.create_table(
        'portal_payment_intents',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('invoice_id', sa.Integer(), sa.ForeignKey('invoices.id'), nullable=False),
        sa.Column('share_link_id', sa.Integer(), sa.ForeignKey('invoice_share_links.id'), nullable=False),
        sa.Column('stripe_intent_id', sa.String(255), nullable=False),
        sa.Column('amount_cents', sa.Integer(), nullable=False),
        sa.Column('fee_cents', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('status', sa.String(50), nullable=False, server_default='created'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('stripe_intent_id', name='uq_portal_payment_intents_stripe_intent_id'),
    )
    op.create_index('ix_portal_payment_intents_invoice_id', 'portal_payment_intents', ['invoice_id'])
    op.create_index('ix_portal_payment_intents_share_link_id', 'portal_payment_intents', ['share_link_id'])
    op.create_index('ix_portal_payment_intents_stripe_intent_id', 'portal_payment_intents', ['stripe_intent_id'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_portal_payment_intents_stripe_intent_id', table_name='portal_payment_intents')
    op.drop_index('ix_portal_payment_intents_share_link_id', table_name='portal_payment_intents')
    op.drop_index('ix_portal_payment_intents_invoice_id', table_name='portal_payment_intents')
    op.drop_table('portal_payment_intents')
    op.drop_column('organizations', 'paypal_link')
    op.drop_column('organizations', 'stripe_connect_onboarded')
    op.drop_column('organizations', 'stripe_connect_account_id')
