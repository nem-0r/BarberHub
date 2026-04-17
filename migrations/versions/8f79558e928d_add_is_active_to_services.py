"""add_is_active_to_services

Revision ID: 8f79558e928d
Revises: e7403322a13b
Create Date: 2026-04-11 12:50:56.434683

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '8f79558e928d'
down_revision: Union[str, Sequence[str], None] = 'e7403322a13b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add is_active to services (with server_default for existing rows)
    op.add_column('services', sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('services', 'is_active')
