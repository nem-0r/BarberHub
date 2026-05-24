"""add_operating_hours_to_salons

Revision ID: e7403322a13b
Revises: b6c87dbdfc16
Create Date: 2026-04-11 16:05:00.000000

"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "e7403322a13b"
down_revision: Union[str, Sequence[str], None] = "b6c87dbdfc16"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("salons", sa.Column("operating_hours", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("salons", "operating_hours")
