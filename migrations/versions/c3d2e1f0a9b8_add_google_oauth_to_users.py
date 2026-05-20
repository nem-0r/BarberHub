"""add google oauth fields to users

Revision ID: c3d2e1f0a9b8
Revises: a1b2c3d4e5f6
Create Date: 2026-05-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3d2e1f0a9b8'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # password_hash → nullable (OAuth-only accounts have no local password)
    op.alter_column('users', 'password_hash', existing_type=sa.String(length=255), nullable=True)

    # phone → nullable (Google id_token has no phone claim; collected later)
    op.alter_column('users', 'phone', existing_type=sa.String(length=20), nullable=True)

    # google_sub: Google `sub` claim, stable per-account identifier
    op.add_column('users', sa.Column('google_sub', sa.String(length=255), nullable=True))
    op.create_index('ix_users_google_sub', 'users', ['google_sub'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_users_google_sub', table_name='users')
    op.drop_column('users', 'google_sub')
    op.alter_column('users', 'phone', existing_type=sa.String(length=20), nullable=False)
    op.alter_column('users', 'password_hash', existing_type=sa.String(length=255), nullable=False)
