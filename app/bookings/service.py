import logging
import uuid
from datetime import timedelta, datetime, timezone
from typing import List, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import aliased
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from app.bookings.models import Booking, BookingStatus
from app.bookings.schemas import BookingCreate, BookingStatusUpdate, BookingRead
from app.services.models import Service
from app.staff_services.models import StaffService
from app.schedules.models import Schedule
from app.staff.models import Staff
from app.salons.models import Salon
from app.users.models import User, UserRole
from app.exceptions import BookingConflictError, AvailabilityError


def _resolve_salon_tz(tz_name: Optional[str]) -> ZoneInfo:
    """Get an IANA ZoneInfo, falling back to UTC for missing or invalid values."""
    if not tz_name:
        return ZoneInfo("UTC")
    try:
        return ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def _utc_aware_to_salon_local(dt_utc: datetime, salon_tz: ZoneInfo) -> datetime:
    """Convert aware UTC datetime to naive salon-local datetime."""
    return dt_utc.astimezone(salon_tz).replace(tzinfo=None)


logger = logging.getLogger(__name__)

ALLOWED_TRANSITIONS: dict[BookingStatus, list[BookingStatus]] = {
    BookingStatus.pending: [BookingStatus.confirmed, BookingStatus.cancelled],
    BookingStatus.confirmed: [
        BookingStatus.completed,
        BookingStatus.cancelled,
        BookingStatus.no_show,
    ],
    BookingStatus.cancelled: [],
    BookingStatus.completed: [],
    BookingStatus.no_show: [],
}


async def _check_double_booking(
    staff_id: uuid.UUID,
    start_time,
    end_time,
    session: AsyncSession,
    exclude_id: Optional[uuid.UUID] = None,
):
    """Raise BookingConflictError on overlapping confirmed/pending bookings (FOR UPDATE lock)."""
    query = (
        select(Booking)
        .where(
            Booking.staff_id == staff_id,
            Booking.status.in_([BookingStatus.pending, BookingStatus.confirmed]),
            Booking.start_time < end_time,
            Booking.end_time > start_time,
        )
        .with_for_update()
    )

    if exclude_id:
        query = query.where(Booking.id != exclude_id)
    result = await session.exec(query)
    conflict = result.first()
    if conflict:
        raise BookingConflictError(
            f"Barber is already booked from {conflict.start_time.strftime('%H:%M')} to {conflict.end_time.strftime('%H:%M')}."
        )


async def _check_staff_availability(
    staff_id: uuid.UUID,
    start_time,
    end_time,
    salon_tz: ZoneInfo,
    session: AsyncSession,
):
    """Raise AvailabilityError if booking falls outside staff working hours or on a day off."""
    local_start = _utc_aware_to_salon_local(start_time, salon_tz)
    local_end = _utc_aware_to_salon_local(end_time, salon_tz)
    day_of_week = local_start.weekday()
    result = await session.exec(
        select(Schedule).where(
            Schedule.staff_id == staff_id, Schedule.day_of_week == day_of_week
        )
    )
    schedule = result.first()

    if not schedule or schedule.is_day_off:
        raise AvailabilityError("Staff is off duty on this day.")

    booking_start = local_start.time()
    booking_end = local_end.time()

    if booking_start < schedule.start_time or booking_end > schedule.end_time:
        raise AvailabilityError(
            f"Booking time {booking_start.strftime('%H:%M')}-{booking_end.strftime('%H:%M')} "
            f"is outside working hours {schedule.start_time.strftime('%H:%M')}-{schedule.end_time.strftime('%H:%M')}."
        )


def _enriched_select():
    """Single query returning booking with client, service, staff, and salon TZ."""
    StaffUser = aliased(User)
    return (
        select(
            Booking,
            User.full_name.label("client_full_name"),
            Service.name.label("service_name"),
            StaffUser.full_name.label("staff_full_name"),
            Salon.timezone.label("salon_timezone"),
        )
        .outerjoin(User, User.id == Booking.client_id)
        .outerjoin(Service, Service.id == Booking.service_id)
        .outerjoin(Staff, Staff.id == Booking.staff_id)
        .outerjoin(StaffUser, StaffUser.id == Staff.user_id)
        .outerjoin(Salon, Salon.id == Staff.salon_id)
    )


def _rows_to_reads(rows) -> List[BookingRead]:
    return [
        BookingRead(
            **booking.model_dump(),
            client_full_name=client_name,
            service_name=service_name,
            staff_full_name=staff_name,
            salon_timezone=salon_tz,
        )
        for booking, client_name, service_name, staff_name, salon_tz in rows
    ]


async def get_all_bookings(
    session: AsyncSession, skip: int = 0, limit: int = 50
) -> List[BookingRead]:
    result = await session.exec(_enriched_select().offset(skip).limit(limit))
    return _rows_to_reads(result.all())


async def get_booking_by_id(
    booking_id: uuid.UUID, session: AsyncSession
) -> Optional[Booking]:
    return await session.get(Booking, booking_id)


async def get_bookings_for_client(
    client_id: uuid.UUID, session: AsyncSession
) -> List[BookingRead]:
    result = await session.exec(
        _enriched_select().where(Booking.client_id == client_id)
    )
    return _rows_to_reads(result.all())


async def get_bookings_for_staff(
    staff_id: uuid.UUID, session: AsyncSession, current_user: User
) -> List[BookingRead]:
    result = await session.exec(
        select(Staff, Salon.owner_id)
        .join(Salon, Salon.id == Staff.salon_id)
        .where(Staff.id == staff_id)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Staff not found")
    staff, salon_owner_id = row

    if current_user.role == UserRole.staff and str(staff.user_id) != str(
        current_user.id
    ):
        raise HTTPException(
            status_code=403, detail="Not authorized to view other staff bookings"
        )
    elif current_user.role == UserRole.owner and str(salon_owner_id) != str(
        current_user.id
    ):
        raise HTTPException(
            status_code=403, detail="Not authorized to view bookings of this salon"
        )

    bookings_res = await session.exec(
        _enriched_select().where(Booking.staff_id == staff_id)
    )
    return _rows_to_reads(bookings_res.all())


async def get_bookings_for_salon(
    salon_id: uuid.UUID, session: AsyncSession
) -> List[BookingRead]:
    statement = _enriched_select().where(Staff.salon_id == salon_id)
    result = await session.exec(statement)
    return _rows_to_reads(result.all())


async def create_booking(data: BookingCreate, session: AsyncSession) -> Booking:
    service = await session.get(Service, data.service_id)
    if not service:
        logger.warning(
            "[booking-reject] service_not_found client=%s staff=%s service=%s",
            data.client_id,
            data.staff_id,
            data.service_id,
        )
        raise HTTPException(status_code=404, detail="Service not found.")
    if not service.is_active:
        logger.warning(
            "[booking-reject] service_inactive client=%s staff=%s service=%s",
            data.client_id,
            data.staff_id,
            data.service_id,
        )
        raise HTTPException(
            status_code=400, detail="This service is currently unavailable."
        )

    now_utc = datetime.now(timezone.utc)
    start_utc = (
        data.start_time.astimezone(timezone.utc)
        if data.start_time.tzinfo is not None
        else data.start_time.replace(tzinfo=timezone.utc)
    )
    end_time = start_utc + timedelta(minutes=service.duration_minutes)
    if start_utc < now_utc:
        logger.warning(
            "[booking-reject] in_past start=%s now=%s client=%s staff=%s",
            start_utc.isoformat(),
            now_utc.isoformat(),
            data.client_id,
            data.staff_id,
        )
        raise HTTPException(status_code=400, detail="Cannot book in the past.")

    staff = await session.get(Staff, data.staff_id)
    if not staff or not staff.is_active:
        logger.warning(
            "[booking-reject] staff_inactive_or_missing staff=%s service=%s",
            data.staff_id,
            data.service_id,
        )
        raise HTTPException(status_code=400, detail="Staff member is not available.")

    staff_service = await session.get(StaffService, (data.staff_id, data.service_id))
    if not staff_service:
        logger.warning(
            "[booking-reject] staff_service_not_linked staff=%s service=%s "
            "(barber not assigned this service in staff_services)",
            data.staff_id,
            data.service_id,
        )
        raise HTTPException(
            status_code=400,
            detail="This staff member does not provide the selected service.",
        )

    salon = await session.get(Salon, staff.salon_id)
    salon_tz = _resolve_salon_tz(salon.timezone if salon else None)

    # Advisory lock to serialize concurrent bookings for the same barber.
    lock_key = int(data.staff_id.int % (2**31))
    await session.exec(text(f"SELECT pg_advisory_xact_lock({lock_key})"))

    await _check_staff_availability(
        data.staff_id, start_utc, end_time, salon_tz, session
    )
    await _check_double_booking(data.staff_id, start_utc, end_time, session)

    if staff_service.custom_price is not None:
        final_price = staff_service.custom_price
    else:
        final_price = service.base_price

    booking = Booking(
        client_id=data.client_id,
        staff_id=data.staff_id,
        service_id=data.service_id,
        start_time=data.start_time,
        end_time=end_time,
        final_price=final_price,
        status=BookingStatus.confirmed,
    )
    session.add(booking)
    await session.commit()
    await session.refresh(booking)

    # Best-effort confirmation email; failures are logged but never propagate.
    try:
        client = await session.get(User, data.client_id)
        staff_user = await session.get(User, staff.user_id) if staff.user_id else None
        if client and client.email:
            local_dt = _utc_aware_to_salon_local(data.start_time, salon_tz)
            time_str = local_dt.strftime("%d %b %Y %H:%M")
            from app.tasks.dispatch import queue_booking_confirmation

            queue_booking_confirmation(
                client_email=client.email,
                staff_email=staff_user.email if staff_user else "",
                client_name=client.full_name or client.email,
                service_name=service.name,
                time_str=time_str,
                salon_name=salon.name if salon else "the salon",
            )
    except Exception:
        logger.exception(
            "Failed to enqueue booking confirmation email for booking %s", booking.id
        )

    return booking


def _role_label(user: User) -> str:
    """Human-readable cancellation actor for email notifications."""
    if user.role == UserRole.client:
        return "the client"
    if user.role == UserRole.staff:
        return "the barber"
    if user.role == UserRole.owner:
        return "the salon"
    return "an administrator"


async def _enqueue_cancellation_email(
    booking: Booking, session: AsyncSession, cancelled_by: str
) -> None:
    """Send cancellation email to client. Failures are logged, not raised."""
    try:
        client = await session.get(User, booking.client_id)
        if not client or not client.email:
            return
        service = await session.get(Service, booking.service_id)
        staff = await session.get(Staff, booking.staff_id)
        salon = await session.get(Salon, staff.salon_id) if staff else None
        salon_tz = _resolve_salon_tz(salon.timezone if salon else None)
        local_dt = _utc_aware_to_salon_local(booking.start_time, salon_tz)
        from app.tasks.dispatch import queue_booking_cancelled

        queue_booking_cancelled(
            client_email=client.email,
            service_name=service.name if service else "your appointment",
            time_str=local_dt.strftime("%d %b %Y %H:%M"),
            salon_name=salon.name if salon else "the salon",
            cancelled_by=cancelled_by,
        )
    except Exception:
        logger.exception(
            "Failed to enqueue cancellation email for booking %s", booking.id
        )


async def update_booking_status(
    booking_id: uuid.UUID,
    data: BookingStatusUpdate,
    session: AsyncSession,
    current_user: User,
) -> Optional[Booking]:
    joined = await session.exec(
        select(Booking, Staff.user_id, Salon.owner_id)
        .join(Staff, Staff.id == Booking.staff_id)
        .join(Salon, Salon.id == Staff.salon_id)
        .where(Booking.id == booking_id)
    )
    row = joined.first()
    if not row:
        return None
    booking, staff_user_id, salon_owner_id = row

    allowed = ALLOWED_TRANSITIONS.get(booking.status, [])
    if data.status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot transition from '{booking.status.value}' to '{data.status.value}'. "
            f"Allowed: {[s.value for s in allowed]}",
        )

    if current_user.role == UserRole.staff and str(staff_user_id) != str(
        current_user.id
    ):
        raise HTTPException(
            status_code=403, detail="Not authorized to modify this booking"
        )
    elif current_user.role == UserRole.owner and str(salon_owner_id) != str(
        current_user.id
    ):
        raise HTTPException(
            status_code=403, detail="Not authorized to modify bookings for this salon"
        )

    booking.status = data.status
    session.add(booking)
    await session.commit()
    await session.refresh(booking)

    if data.status == BookingStatus.cancelled:
        await _enqueue_cancellation_email(booking, session, _role_label(current_user))
    return booking


async def cancel_booking(
    booking_id: uuid.UUID, session: AsyncSession, current_user: User
) -> Optional[Booking]:
    if current_user.role == UserRole.owner:
        joined = await session.exec(
            select(Booking, Salon.owner_id)
            .join(Staff, Staff.id == Booking.staff_id)
            .join(Salon, Salon.id == Staff.salon_id)
            .where(Booking.id == booking_id)
        )
        row = joined.first()
        if not row:
            return None
        booking, salon_owner_id = row
        if str(salon_owner_id) != str(current_user.id):
            raise HTTPException(
                status_code=403,
                detail="Not authorized to cancel bookings for this salon",
            )
    else:
        booking = await session.get(Booking, booking_id)
        if not booking:
            return None

    # Idempotent for already-cancelled; reject terminal states.
    if booking.status == BookingStatus.cancelled:
        return booking
    if booking.status in (BookingStatus.completed, BookingStatus.no_show):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel a booking that is already '{booking.status.value}'.",
        )

    booking.status = BookingStatus.cancelled
    session.add(booking)
    await session.commit()
    await session.refresh(booking)

    await _enqueue_cancellation_email(booking, session, _role_label(current_user))
    return booking
