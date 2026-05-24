"""add foreign-key / hot-path indexes

Revision ID: d4e3f2a1b0c9
Revises: c3d2e1f0a9b8
Create Date: 2026-05-15 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op


revision: str = "d4e3f2a1b0c9"
down_revision: Union[str, Sequence[str], None] = "c3d2e1f0a9b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_INDEXES = [
    ("ix_bookings_client_id", "bookings", ["client_id"]),
    ("ix_bookings_staff_id", "bookings", ["staff_id"]),
    ("ix_bookings_service_id", "bookings", ["service_id"]),
    ("ix_bookings_start_time", "bookings", ["start_time"]),
    ("ix_bookings_status", "bookings", ["status"]),
    ("ix_reviews_salon_id", "reviews", ["salon_id"]),
    ("ix_reviews_author_id", "reviews", ["author_id"]),
    ("ix_staff_salon_id", "staff", ["salon_id"]),
    ("ix_staff_user_id", "staff", ["user_id"]),
    ("ix_services_salon_id", "services", ["salon_id"]),
    ("ix_salons_owner_id", "salons", ["owner_id"]),
    ("ix_staff_services_service_id", "staff_services", ["service_id"]),
]


def upgrade() -> None:
    for name, table, cols in _INDEXES:
        op.create_index(name, table, cols, unique=False)


def downgrade() -> None:
    for name, table, _cols in reversed(_INDEXES):
        op.drop_index(name, table_name=table)
