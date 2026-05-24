import uuid
from decimal import Decimal
from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel
from pydantic import field_serializer
from app.bookings.models import BookingStatus


class BookingCreate(SQLModel):
    client_id: uuid.UUID
    staff_id: uuid.UUID
    service_id: uuid.UUID
    start_time: datetime


class BookingStatusUpdate(SQLModel):
    status: BookingStatus


def _serialize_as_utc(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


class BookingRead(SQLModel):
    id: uuid.UUID
    client_id: uuid.UUID
    staff_id: uuid.UUID
    service_id: uuid.UUID
    start_time: datetime
    end_time: datetime
    final_price: Decimal
    status: BookingStatus
    created_at: Optional[datetime] = None

    # Enriched by joined queries in service.py; None on single-row lookups.
    client_full_name: Optional[str] = None
    service_name: Optional[str] = None
    staff_full_name: Optional[str] = None
    salon_timezone: Optional[str] = None

    @field_serializer("start_time", "end_time", "created_at")
    def _ser_dt(self, v: Optional[datetime]):
        return _serialize_as_utc(v)

    class Config:
        from_attributes = True
