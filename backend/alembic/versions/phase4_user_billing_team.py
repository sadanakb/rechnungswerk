"""add Phase 4 — user auth tokens, billing status, team invitations

Revision ID: 2fbbf4591b5d
Revises: 4dfe32c061a3
Create Date: 2026-02-27 14:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision: str = '2fbbf4591b5d'
down_revision: Union[str, None] = '4dfe32c061a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- User table: add password-reset and email-verification columns ---
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('password_reset_token', sa.String(length=255), nullable=True)
        )
        batch_op.add_column(
            sa.Column('password_reset_expires', sa.DateTime(timezone=True), nullable=True)
        )
        batch_op.add_column(
            sa.Column('email_verification_token', sa.String(length=255), nullable=True)
        )

    # --- Organization table: add plan_status column ---
    with op.batch_alter_table('organizations', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('plan_status', sa.String(length=50), nullable=True, server_default='active')
        )

    # --- Mahnung table: widen status column from String(20) to String(50) ---
    # Note: status and sent_at already exist from Phase 1+2 migration.
    # The model defines status as String(50) but Phase 1+2 created it as String(20).
    # SQLite does not enforce varchar length, so this is a no-op on SQLite.
    # For PostgreSQL/MySQL, the column width should be updated.
    with op.batch_alter_table('mahnungen', schema=None) as batch_op:
        batch_op.alter_column(
            'status',
            existing_type=sa.String(length=20),
            type_=sa.String(length=50),
            existing_nullable=True,
        )

    # --- Create team_invitations table ---
    op.create_table(
        'team_invitations',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('organization_id', sa.Integer(), sa.ForeignKey('organizations.id'), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('token', sa.String(length=255), nullable=False),
        sa.Column('role', sa.String(length=50), server_default='member'),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('accepted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    # --- Drop team_invitations table ---
    op.drop_table('team_invitations')

    # --- Mahnung table: revert status column back to String(20) ---
    with op.batch_alter_table('mahnungen', schema=None) as batch_op:
        batch_op.alter_column(
            'status',
            existing_type=sa.String(length=50),
            type_=sa.String(length=20),
            existing_nullable=True,
        )

    # --- Organization table: remove plan_status column ---
    with op.batch_alter_table('organizations', schema=None) as batch_op:
        batch_op.drop_column('plan_status')

    # --- User table: remove auth token columns ---
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('email_verification_token')
        batch_op.drop_column('password_reset_expires')
        batch_op.drop_column('password_reset_token')
