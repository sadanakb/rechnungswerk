"""add Phase 7 — contacts, invoice sequences, payment status, performance indexes

Revision ID: 9c5d8e3f2a71
Revises: 8b4e2f7a1c93
Create Date: 2026-02-27 18:00:00.000000
"""
from typing import Union
from alembic import op
import sqlalchemy as sa

revision: str = '9c5d8e3f2a71'
down_revision: Union[str, None] = '8b4e2f7a1c93'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add payment status columns to invoices table
    with op.batch_alter_table('invoices') as batch_op:
        batch_op.add_column(sa.Column('payment_status', sa.String(20), nullable=False, server_default='unpaid'))
        batch_op.add_column(sa.Column('paid_date', sa.Date(), nullable=True))
        batch_op.add_column(sa.Column('payment_method', sa.String(50), nullable=True))
        batch_op.add_column(sa.Column('payment_reference', sa.String(255), nullable=True))

    # 2. Create contacts table
    op.create_table(
        'contacts',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('org_id', sa.Integer(), nullable=False, index=True),
        sa.Column('type', sa.String(20), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('email', sa.String(255), nullable=True),
        sa.Column('phone', sa.String(50), nullable=True),
        sa.Column('address_line1', sa.String(255), nullable=True),
        sa.Column('address_line2', sa.String(255), nullable=True),
        sa.Column('city', sa.String(100), nullable=True),
        sa.Column('zip', sa.String(20), nullable=True),
        sa.Column('country', sa.String(2), nullable=False, server_default='DE'),
        sa.Column('vat_id', sa.String(50), nullable=True),
        sa.Column('payment_terms', sa.Integer(), nullable=False, server_default='30'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # 3. Create invoice_number_sequences table
    op.create_table(
        'invoice_number_sequences',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('org_id', sa.Integer(), nullable=False),
        sa.Column('prefix', sa.String(20), nullable=False, server_default='RE'),
        sa.Column('separator', sa.String(5), nullable=False, server_default='-'),
        sa.Column('year_format', sa.String(10), nullable=False, server_default='YYYY'),
        sa.Column('padding', sa.Integer(), nullable=False, server_default='4'),
        sa.Column('current_counter', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('reset_yearly', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('last_reset_year', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('org_id', name='uq_invoice_number_sequences_org_id'),
    )

    # 4. Performance indexes
    op.create_index(
        op.f('ix_invoices_org_created'),
        'invoices',
        ['organization_id', 'created_at'],
        unique=False,
    )
    op.create_index(
        op.f('ix_invoices_org_status'),
        'invoices',
        ['organization_id', 'validation_status'],
        unique=False,
    )
    op.create_index(
        op.f('ix_invoices_buyer'),
        'invoices',
        ['buyer_name'],
        unique=False,
    )
    op.create_index(
        op.f('ix_notifications_org_read'),
        'notifications',
        ['org_id', 'is_read'],
        unique=False,
    )


def downgrade() -> None:
    # Remove indexes
    op.drop_index(op.f('ix_notifications_org_read'), table_name='notifications')
    op.drop_index(op.f('ix_invoices_buyer'), table_name='invoices')
    op.drop_index(op.f('ix_invoices_org_status'), table_name='invoices')
    op.drop_index(op.f('ix_invoices_org_created'), table_name='invoices')

    # Drop tables
    op.drop_table('invoice_number_sequences')
    op.drop_table('contacts')

    # Remove payment columns from invoices
    with op.batch_alter_table('invoices') as batch_op:
        batch_op.drop_column('payment_reference')
        batch_op.drop_column('payment_method')
        batch_op.drop_column('paid_date')
        batch_op.drop_column('payment_status')
