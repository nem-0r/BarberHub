import uuid
from datetime import date, datetime, timedelta, time, timezone
from typing import List, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from fastapi import HTTPException
from sqlalchemy import and_
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from app.schedules.models import Schedule
from app.schedules.schemas import ScheduleCreate, ScheduleUpdate


def _resolve_tz(tz_name: Optional[str]) -> ZoneInfo:
    if not tz_name:
        return ZoneInfo("UTC")
    try:
        return ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


async def get_schedules_for_staff(staff_id: uuid.UUID, session: AsyncSession) -> List[Schedule]:
    result = await session.exec(select(Schedule).where(Schedule.staff_id == staff_id))
    return result.all()


async def get_schedule_by_id(schedule_id: uuid.UUID, session: AsyncSession) -> Optional[Schedule]:
    return await session.get(Schedule, schedule_id)


async def create_schedule(data: ScheduleCreate, session: AsyncSession) -> Schedule:
    schedule = Schedule(**data.model_dump())
    session.add(schedule)
    await session.commit()
    await session.refresh(schedule)
    return schedule


async def update_schedule(
    schedule_id: uuid.UUID, data: ScheduleUpdate, session: AsyncSession
) -> Optional[Schedule]:
    schedule = await session.get(Schedule, schedule_id)
    if not schedule:
        return None
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(schedule, key, value)
    session.add(schedule)
    await session.commit()
    await session.refresh(schedule)
    return schedule


async def delete_schedule(schedule_id: uuid.UUID, session: AsyncSession) -> bool:
    schedule = await session.get(Schedule, schedule_id)
    if not schedule:
        return False
    await session.delete(schedule)
    await session.commit()
    return True


async def get_available_slots(
    staff_id: uuid.UUID,
    booking_date: date,
    service_id: uuid.UUID,
    session: AsyncSession,
) -> dict:
    """Return free time slots (HH:MM in salon-local time) for the staff on the
    given date, excluding already-booked windows.

    Booking storage is naive UTC; Schedule.start_time/end_time live in salon-local
    time. We do all schedule math in salon-local space, then convert each
    candidate slot to UTC before comparing against the (UTC) bookings table."""
    from app.bookings.models import Booking, BookingStatus
    from app.staff.models import Staff
    from app.salons.models import Salon
    from app.services.models import Service

    # 1. Load service duration
    service = await session.get(Service, service_id)
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    duration = service.duration_minutes

    # 2. One round-trip for staff + its salon + that day's schedule (was 3
    # sequential gets). 0=Monday … 6=Sunday in salon-local space. LEFT join on
    # Schedule so a missing schedule / day-off still resolves to "no slots".
    day_of_week = booking_date.weekday()
    row = (
        await session.exec(
            select(Staff, Salon, Schedule)
            .join(Salon, Salon.id == Staff.salon_id)
            .outerjoin(
                Schedule,
                and_(
                    Schedule.staff_id == Staff.id,
                    Schedule.day_of_week == day_of_week,
                ),
            )
            .where(Staff.id == staff_id)
        )
    ).first()

    if not row:
        # Unknown staff (or staff without a salon) → no slots, as before
        # (previously: staff None → schedule query empty → same result).
        return {"slots": [], "day_off": True}
    staff, salon, schedule = row
    salon_tz = _resolve_tz(salon.timezone if salon else None)

    if not schedule or schedule.is_day_off or not schedule.start_time or not schedule.end_time:
        return {"slots": [], "day_off": True}

    # 3. Enumerate salon-local slots stepping by service duration. Step = duration
    # (not a fixed 30 min) so successive slots can't overlap each other — two
    # clients picking what look like distinct slots can no longer collide.
    local_day_start = datetime.combine(booking_date, schedule.start_time)
    local_day_end = datetime.combine(booking_date, schedule.end_time)

    # Clamp the barber's window to the salon's business hours for this weekday.
    # A barber can't take bookings while the shop itself is closed, so the
    # offered slots must be the intersection (barber schedule ⊆ salon hours).
    # Skipped when operating_hours is unset (legacy salons → barber drives it).
    if salon and salon.operating_hours is not None:
        salon_hours = salon.operating_hours.get(str(day_of_week))
        if not salon_hours or not isinstance(salon_hours, list) or len(salon_hours) < 2:
            return {"slots": [], "day_off": True}  # salon closed this weekday
        salon_open = datetime.strptime(salon_hours[0], "%H:%M").time()
        salon_close = datetime.strptime(salon_hours[1], "%H:%M").time()
        eff_start = max(schedule.start_time, salon_open)
        eff_end = min(schedule.end_time, salon_close)
        if eff_start >= eff_end:
            return {"slots": [], "day_off": True}  # no overlap with salon hours
        local_day_start = datetime.combine(booking_date, eff_start)
        local_day_end = datetime.combine(booking_date, eff_end)

    all_local_slots: list[datetime] = []
    cursor = local_day_start
    step = timedelta(minutes=duration)
    while cursor + step <= local_day_end:
        all_local_slots.append(cursor)
        cursor += step

    # Drop slots already in the past when booking for *today* (salon-local).
    # Otherwise the UI offers e.g. 11:30 at 12:14, the client picks it, and
    # create_booking rejects it with 400 "Cannot book in the past" — the slot
    # must never be offered in the first place.
    now_local = datetime.now(salon_tz).replace(tzinfo=None)
    if booking_date == now_local.date():
        all_local_slots = [s for s in all_local_slots if s > now_local]

    # 4. Load existing bookings overlapping this salon-local day. Convert salon-
    # local day boundaries to UTC for the WHERE clause (the day in salon TZ may
    # span two UTC dates).
    def to_utc_naive(local_dt: datetime) -> datetime:
        return local_dt.replace(tzinfo=salon_tz).astimezone(timezone.utc).replace(tzinfo=None)

    utc_day_start = to_utc_naive(local_day_start.replace(hour=0, minute=0, second=0, microsecond=0))
    utc_day_end = to_utc_naive(
        local_day_start.replace(hour=23, minute=59, second=59, microsecond=999999)
    )
    booked_result = await session.exec(
        select(Booking).where(
            Booking.staff_id == staff_id,
            Booking.status.in_([BookingStatus.pending, BookingStatus.confirmed]),
            Booking.start_time >= utc_day_start,
            Booking.start_time <= utc_day_end,
        )
    )
    booked = booked_result.all()

    # 5. Remove slots that overlap with any existing booking (UTC comparison)
    free_slots: list[str] = []
    for local_slot in all_local_slots:
        slot_utc_start = to_utc_naive(local_slot)
        slot_utc_end = slot_utc_start + timedelta(minutes=duration)
        overlaps = any(
            b.start_time < slot_utc_end and b.end_time > slot_utc_start
            for b in booked
        )
        if not overlaps:
            free_slots.append(local_slot.strftime("%H:%M"))

    return {"slots": free_slots, "day_off": False, "duration_minutes": duration}
