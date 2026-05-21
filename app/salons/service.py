import uuid
import sqlalchemy as sa
from typing import List, Optional
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from app.salons.models import Salon
from app.salons.schemas import SalonCreate, SalonUpdate, SalonRead
from app.users.models import User, UserRole
from fastapi import HTTPException
from datetime import datetime, timedelta, timezone
from app.bookings.models import Booking, BookingStatus
from app.staff.models import Staff


SALON_SORTABLE_FIELDS = {"name", "city", "rating", "review_count", "created_at"}


def _to_salon_read(salon: Salon) -> SalonRead:
    is_open, open_until = calculate_salon_status(salon)
    return SalonRead(**salon.model_dump(), is_open=is_open, open_until=open_until)


async def get_all_salons(
    session: AsyncSession,
    search: Optional[str] = None,
    sort_by: Optional[str] = "name",
    order: str = "asc",
    skip: int = 0,
    limit: int = 50,
) -> List[SalonRead]:
    statement = select(Salon)
    if search:
        statement = statement.where(Salon.name.ilike(f"%{search}%"))

    # Sorting
    if sort_by and sort_by in SALON_SORTABLE_FIELDS:
        attr = getattr(Salon, sort_by)
        if order == "desc":
            statement = statement.order_by(attr.desc())
        else:
            statement = statement.order_by(attr.asc())

    result = await session.exec(statement.offset(skip).limit(limit))
    salons = result.all()
    return [_to_salon_read(s) for s in salons]


async def get_salon_by_id(salon_id: uuid.UUID, session: AsyncSession) -> Optional[SalonRead]:
    salon = await session.get(Salon, salon_id)
    if not salon:
        return None
    return _to_salon_read(salon)


def calculate_salon_status(salon: Salon):
    """
    Checks if the salon is currently open based on operating_hours and salon timezone.
    operating_hours format: {"0": ["09:00", "21:00"], ...}  (0=Monday … 6=Sunday)
    """
    if not salon.operating_hours:
        return True, "21:00"

    # Use the salon's configured timezone (zoneinfo is stdlib in Python 3.9+).
    try:
        from zoneinfo import ZoneInfo
        tz = ZoneInfo(salon.timezone or "UTC")
        now = datetime.now(tz)
    except Exception:
        now = datetime.now(timezone.utc)

    day_of_week = str(now.weekday())
    hours = salon.operating_hours.get(day_of_week)
    if not hours or not isinstance(hours, list) or len(hours) < 2:
        return False, None

    open_t = datetime.strptime(hours[0], "%H:%M").time()
    close_t = datetime.strptime(hours[1], "%H:%M").time()
    current_t = now.time()

    is_open = open_t <= current_t <= close_t
    return is_open, hours[1]


async def get_salon_stats(salon_id: uuid.UUID, session: AsyncSession):
    # Use naive UTC datetimes — Booking.start_time is TIMESTAMP WITHOUT TIME ZONE.
    # asyncpg rejects tz-aware vs tz-naive comparisons and drops the connection.
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)
    week_start = today_start - timedelta(days=today_start.weekday())

    # Both counters come from the same bookings/staff join — compute them in a single query
    # with conditional aggregates so we only pay for one round-trip.
    booking_stmt = select(
        sa.func.count(
            sa.case(
                (
                    sa.and_(
                        Booking.start_time >= today_start,
                        Booking.start_time < today_end,
                        Booking.status != BookingStatus.cancelled,
                    ),
                    Booking.id,
                )
            )
        ).label("today_bookings"),
        sa.func.coalesce(
            sa.func.sum(
                sa.case(
                    (
                        sa.and_(
                            Booking.start_time >= week_start,
                            Booking.status == BookingStatus.completed,
                        ),
                        Booking.final_price,
                    ),
                    else_=0,
                )
            ),
            0,
        ).label("weekly_revenue"),
    ).join(Staff, Staff.id == Booking.staff_id).where(Staff.salon_id == salon_id)

    booking_row = (await session.exec(booking_stmt)).first()
    today_bookings = int(booking_row[0] or 0) if booking_row else 0
    total_revenue = float(booking_row[1] or 0) if booking_row else 0.0

    # Active staff + salon lookup can stay separate; they hit different tables.
    staff_stmt = select(sa.func.count(Staff.id)).where(
        Staff.salon_id == salon_id,
        Staff.is_active == True,
    )
    active_staff = (await session.exec(staff_stmt)).first() or 0

    salon = await session.get(Salon, salon_id)

    return {
        "today_bookings": today_bookings,
        "weekly_revenue": total_revenue,
        "active_staff": active_staff,
        "avg_rating": (salon.rating if salon else 0.0) or 0.0,
    }


async def create_salon(data: SalonCreate, session: AsyncSession) -> SalonRead:
    # Check if a salon already exists for this owner
    existing = await session.exec(select(Salon).where(Salon.owner_id == data.owner_id))
    if existing.first():
        raise HTTPException(
            status_code=409, 
            detail="A salon already exists for this owner. Please use the dashboard to manage it."
        )
    
    # Default operating hours: 09:00 - 21:00 for all days if not provided
    salon_dict = data.model_dump()
    if not salon_dict.get("operating_hours"):
        salon_dict["operating_hours"] = {str(i): ["09:00", "21:00"] for i in range(7)}
    
    # Use model_validate to create Salon instance safely
    salon = Salon.model_validate(salon_dict)
    
    session.add(salon)
    await session.commit()
    await session.refresh(salon)
    return _to_salon_read(salon)


async def update_salon(salon_id: uuid.UUID, data: SalonUpdate, session: AsyncSession, current_user: User) -> Optional[SalonRead]:
    salon = await session.get(Salon, salon_id)
    if not salon:
        return None

    if current_user.role != UserRole.admin and str(salon.owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized to modify this salon")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(salon, key, value)
    session.add(salon)
    await session.commit()
    await session.refresh(salon)
    return _to_salon_read(salon)


async def delete_salon(salon_id: uuid.UUID, session: AsyncSession, current_user: User) -> bool:
    salon = await session.get(Salon, salon_id)
    if not salon:
        return False
        
    if current_user.role != UserRole.admin and str(salon.owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized to modify this salon")
        
    await session.delete(salon)
    await session.commit()
    return True
