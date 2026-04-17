import uuid
import sqlalchemy as sa
from typing import List, Optional
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from app.salons.models import Salon
from app.salons.schemas import SalonCreate, SalonUpdate, SalonRead
from app.users.models import User, UserRole
from fastapi import HTTPException
from datetime import datetime, timedelta
from app.bookings.models import Booking, BookingStatus
from app.staff.models import Staff


def _to_salon_read(salon: Salon) -> SalonRead:
    is_open, open_until = calculate_salon_status(salon)
    return SalonRead(**salon.model_dump(), is_open=is_open, open_until=open_until)


async def get_all_salons(
    session: AsyncSession,
    search: Optional[str] = None,
    sort_by: Optional[str] = "name",
    order: str = "asc",
) -> List[SalonRead]:
    statement = select(Salon)
    if search:
        statement = statement.where(Salon.name.ilike(f"%{search}%"))

    # Sorting
    if sort_by and hasattr(Salon, sort_by):
        attr = getattr(Salon, sort_by)
        if order == "desc":
            statement = statement.order_by(attr.desc())
        else:
            statement = statement.order_by(attr.asc())

    result = await session.exec(statement)
    salons = result.all()
    return [_to_salon_read(s) for s in salons]


async def get_salon_by_id(salon_id: uuid.UUID, session: AsyncSession) -> Optional[SalonRead]:
    salon = await session.get(Salon, salon_id)
    if not salon:
        return None
    return _to_salon_read(salon)


def calculate_salon_status(salon: Salon):
    """
    Checks if the salon is currently open based on operating_hours and timezone.
    For now, returns default values if operating_hours is missing.
    """
    if not salon.operating_hours:
        return True, "21:00" # Fallback
        
    # TODO: Implement real timezone-aware logic here
    # 0=Monday, 6=Sunday
    now = datetime.utcnow() # In production, use salon's timezone
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
    # Today's bookings
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)
    
    # Query bookings for this salon (via staff)
    booking_stmt = select(Booking).join(Staff).where(
        Staff.salon_id == salon_id,
        Booking.start_time >= today_start,
        Booking.start_time < today_end,
        Booking.status != BookingStatus.cancelled
    )
    result = await session.exec(booking_stmt)
    today_bookings = result.all()
    
    # Weekly revenue
    week_start = today_start - timedelta(days=today_start.weekday())
    revenue_stmt = select(sa.func.sum(Booking.final_price)).join(Staff).where(
        Staff.salon_id == salon_id,
        Booking.start_time >= week_start,
        Booking.status == BookingStatus.completed
    )
    revenue_res = await session.exec(revenue_stmt)
    total_revenue_val = revenue_res.first()
    total_revenue = total_revenue_val if total_revenue_val is not None else 0
    
    # Active staff
    staff_stmt = select(sa.func.count(Staff.id)).where(
        Staff.salon_id == salon_id,
        Staff.is_active == True
    )
    staff_res = await session.exec(staff_stmt)
    active_staff_val = staff_res.first()
    active_staff = active_staff_val if active_staff_val is not None else 0
    
    salon = await session.get(Salon, salon_id)
    
    return {
        "today_bookings": len(today_bookings),
        "weekly_revenue": float(total_revenue),
        "active_staff": active_staff,
        "avg_rating": (salon.rating if salon else 0.0) or 0.0
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
