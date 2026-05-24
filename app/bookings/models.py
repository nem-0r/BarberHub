import uuid
import enum
from decimal import Decimal
from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field, Relationship
import sqlalchemy as sa


class BookingStatus(str, enum.Enum):
    pending = "pending"
    confirmed = "confirmed"
    cancelled = "cancelled"
    completed = "completed"
    no_show = "no_show"


class Booking(SQLModel, table=True):
    __tablename__ = "bookings"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    client_id: uuid.UUID = Field(foreign_key="users.id", nullable=False, index=True)
    staff_id: uuid.UUID = Field(foreign_key="staff.id", nullable=False, index=True)
    service_id: uuid.UUID = Field(foreign_key="services.id", nullable=False, index=True)
    start_time: datetime = Field(
        sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False, index=True)
    )
    end_time: datetime = Field(
        sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False)
    )
    final_price: Decimal = Field(sa_column=sa.Column(sa.Numeric(10, 2), nullable=False))
    status: BookingStatus = Field(
        sa_column=sa.Column(
            sa.Enum(BookingStatus),
            nullable=False,
            default=BookingStatus.pending,
            index=True,
        )
    )
    created_at: datetime = Field(
        sa_column=sa.Column(
            sa.DateTime(timezone=True), nullable=False, default=sa.func.now()
        ),
        default_factory=lambda: datetime.now(timezone.utc),
    )

    client: Optional["User"] = Relationship(
        back_populates="bookings",
        sa_relationship_kwargs={"lazy": "noload"},
    )
    staff: Optional["Staff"] = Relationship(
        back_populates="bookings",
        sa_relationship_kwargs={"lazy": "noload"},
    )
    service: Optional["Service"] = Relationship(
        back_populates="bookings",
        sa_relationship_kwargs={"lazy": "noload"},
    )
