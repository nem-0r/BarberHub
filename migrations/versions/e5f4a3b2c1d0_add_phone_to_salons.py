"""add phone to salons

Salon contact number, distinct from the owner's personal User.phone.
Previously the "Business Phone" collected at partner registration was dropped.

Revision ID: e5f4a3b2c1d0
Revises: 1c9b56f2d2f6
Create Date: 2026-05-16 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e5f4a3b2c1d0'
down_revision: Union[str, Sequence[str], None] = '1c9b56f2d2f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('salons', sa.Column('phone', sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column('salons', 'phone')
