"""migrate_to_timestamptz

Revision ID: 1c9b56f2d2f6
Revises: d4e3f2a1b0c9
Create Date: 2026-05-15 15:19:28.567384

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "1c9b56f2d2f6"
down_revision: Union[str, Sequence[str], None] = "d4e3f2a1b0c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column(
        "bookings",
        "start_time",
        existing_type=postgresql.TIMESTAMP(),
        type_=sa.DateTime(timezone=True),
        existing_nullable=False,
    )
    op.alter_column(
        "bookings",
        "end_time",
        existing_type=postgresql.TIMESTAMP(),
        type_=sa.DateTime(timezone=True),
        existing_nullable=False,
    )
    op.alter_column(
        "bookings",
        "created_at",
        existing_type=postgresql.TIMESTAMP(),
        type_=sa.DateTime(timezone=True),
        existing_nullable=False,
    )
    op.alter_column(
        "reviews",
        "created_at",
        existing_type=postgresql.TIMESTAMP(),
        type_=sa.DateTime(timezone=True),
        existing_nullable=False,
    )
    # op.create_unique_constraint('uq_staff_service', 'staff_services', ['staff_id', 'service_id'])
    op.alter_column(
        "users",
        "created_at",
        existing_type=postgresql.TIMESTAMP(),
        type_=sa.DateTime(timezone=True),
        existing_nullable=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column(
        "users",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        type_=postgresql.TIMESTAMP(),
        existing_nullable=False,
    )
    # op.drop_constraint('uq_staff_service', 'staff_services', type_='unique')
    op.alter_column(
        "reviews",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        type_=postgresql.TIMESTAMP(),
        existing_nullable=False,
    )
    op.alter_column(
        "bookings",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        type_=postgresql.TIMESTAMP(),
        existing_nullable=False,
    )
    op.alter_column(
        "bookings",
        "end_time",
        existing_type=sa.DateTime(timezone=True),
        type_=postgresql.TIMESTAMP(),
        existing_nullable=False,
    )
    op.alter_column(
        "bookings",
        "start_time",
        existing_type=sa.DateTime(timezone=True),
        type_=postgresql.TIMESTAMP(),
        existing_nullable=False,
    )
