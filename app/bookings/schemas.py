import uuid
from decimal import Decimal
from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel
from pydantic import field_validator, field_serializer
from app.bookings.models import BookingStatus


class BookingCreate(SQLModel):
    client_id: uuid.UUID
    staff_id: uuid.UUID
    service_id: uuid.UUID
    start_time: datetime


class BookingStatusUpdate(SQLModel):
    status: BookingStatus


def _serialize_as_utc(dt: Optional[datetime]) -> Optional[str]:
    """Serialize datetime to ISO format with Z suffix."""
    if dt is None:
        return None
    # Ensure it's UTC and format with Z
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
    # Optional so legacy rows without created_at don't break /bookings/salon/{id}
    # serialization with a 500 ValidationError.
    created_at: Optional[datetime] = None

    # Enriched fields populated by joined queries in service.py.
    # Optional: single-row endpoints (get_booking_by_id) skip the join.
    client_full_name: Optional[str] = None
    service_name: Optional[str] = None
    staff_full_name: Optional[str] = None
    # IANA timezone of the salon hosting this booking — clients use it to
    # render start_time/end_time in salon-local time regardless of browser TZ.
    salon_timezone: Optional[str] = None

    @field_serializer("start_time", "end_time", "created_at")
    def _ser_dt(self, v: Optional[datetime]):
        return _serialize_as_utc(v)

    class Config:
        from_attributes = True
