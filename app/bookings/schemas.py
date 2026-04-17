import uuid
from decimal import Decimal
from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel
from pydantic import field_validator
from app.bookings.models import BookingStatus


class BookingCreate(SQLModel):
    client_id: uuid.UUID
    staff_id: uuid.UUID
    service_id: uuid.UUID
    start_time: datetime

    @field_validator("start_time", mode="before")
    @classmethod
    def strip_timezone(cls, v):
        """DB column is TIMESTAMP WITHOUT TIME ZONE — strip tzinfo if present."""
        if isinstance(v, datetime) and v.tzinfo is not None:
            return v.astimezone(timezone.utc).replace(tzinfo=None)
        return v


class BookingStatusUpdate(SQLModel):
    status: BookingStatus


class BookingRead(SQLModel):
    id: uuid.UUID
    client_id: uuid.UUID
    staff_id: uuid.UUID
    service_id: uuid.UUID
    start_time: datetime
    end_time: datetime
    final_price: Decimal
    status: BookingStatus
    created_at: datetime

    class Config:
        from_attributes = True
