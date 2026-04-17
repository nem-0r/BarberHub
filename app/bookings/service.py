import uuid
from datetime import timedelta
from typing import List, Optional
from fastapi import HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from app.bookings.models import Booking, BookingStatus
from app.bookings.schemas import BookingCreate, BookingStatusUpdate
from app.services.models import Service
from app.staff_services.models import StaffService
from app.schedules.models import Schedule
from app.staff.models import Staff
from app.salons.models import Salon
from app.users.models import User, UserRole
from app.exceptions import BookingConflictError, AvailabilityError


async def _check_double_booking(
    staff_id: uuid.UUID,
    start_time,
    end_time,
    session: AsyncSession,
    exclude_id: Optional[uuid.UUID] = None,
):
    """Raise BookingConflictError if the barber already has an overlapping confirmed/pending booking."""
    query = select(Booking).where(
        Booking.staff_id == staff_id,
        Booking.status.in_([BookingStatus.pending, BookingStatus.confirmed]),
        Booking.start_time < end_time,
        Booking.end_time > start_time,
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
    session: AsyncSession,
):
    """Raise AvailabilityError if the booking is outside staff working hours or on a day off."""
    day_of_week = start_time.weekday()  # 0=Monday, 6=Sunday
    result = await session.exec(
        select(Schedule).where(
            Schedule.staff_id == staff_id,
            Schedule.day_of_week == day_of_week
        )
    )
    schedule = result.first()

    if not schedule or schedule.is_day_off:
        raise AvailabilityError("Staff is off duty on this day.")

    booking_start = start_time.time()
    booking_end = end_time.time()

    if booking_start < schedule.start_time or booking_end > schedule.end_time:
        raise AvailabilityError(
            f"Booking time {booking_start.strftime('%H:%M')}-{booking_end.strftime('%H:%M')} "
            f"is outside working hours {schedule.start_time.strftime('%H:%M')}-{schedule.end_time.strftime('%H:%M')}."
        )


async def get_all_bookings(session: AsyncSession) -> List[Booking]:
    result = await session.exec(select(Booking))
    return result.all()


async def get_booking_by_id(booking_id: uuid.UUID, session: AsyncSession) -> Optional[Booking]:
    return await session.get(Booking, booking_id)


async def get_bookings_for_client(client_id: uuid.UUID, session: AsyncSession) -> List[Booking]:
    result = await session.exec(select(Booking).where(Booking.client_id == client_id))
    return result.all()


async def get_bookings_for_staff(staff_id: uuid.UUID, session: AsyncSession, current_user: User) -> List[Booking]:
    staff = await session.get(Staff, staff_id)
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")
        
    salon = await session.get(Salon, staff.salon_id)
    
    if current_user.role == UserRole.staff and str(staff.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized to view other staff bookings")
    elif current_user.role == UserRole.owner and str(salon.owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized to view bookings of this salon")
        
    result = await session.exec(select(Booking).where(Booking.staff_id == staff_id))
    return result.all()


async def get_bookings_for_salon(salon_id: uuid.UUID, session: AsyncSession) -> List[Booking]:
    statement = select(Booking).join(Staff).where(Staff.salon_id == salon_id)
    result = await session.exec(statement)
    return result.all()


async def create_booking(data: BookingCreate, session: AsyncSession) -> Booking:
    service = await session.get(Service, data.service_id)
    if not service:
        raise HTTPException(status_code=404, detail="Service not found.")

    end_time = data.start_time + timedelta(minutes=service.duration_minutes)

    await _check_staff_availability(data.staff_id, data.start_time, end_time, session)
    await _check_double_booking(data.staff_id, data.start_time, end_time, session)

    staff_service = await session.get(StaffService, (data.staff_id, data.service_id))
    if staff_service and staff_service.custom_price is not None:
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
        status=BookingStatus.pending,
    )
    session.add(booking)
    await session.commit()
    await session.refresh(booking)
    return booking


async def update_booking_status(
    booking_id: uuid.UUID, data: BookingStatusUpdate, session: AsyncSession, current_user: User
) -> Optional[Booking]:
    booking = await session.get(Booking, booking_id)
    if not booking:
        return None
        
    staff = await session.get(Staff, booking.staff_id)
    salon = await session.get(Salon, staff.salon_id)
    
    if current_user.role == UserRole.staff and str(staff.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized to modify this booking")
    elif current_user.role == UserRole.owner and str(salon.owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized to modify bookings for this salon")
        
    booking.status = data.status
    session.add(booking)
    await session.commit()
    await session.refresh(booking)
    return booking


async def cancel_booking(booking_id: uuid.UUID, session: AsyncSession, current_user: User) -> Optional[Booking]:
    booking = await session.get(Booking, booking_id)
    if not booking:
        return None
        
    # Owner specific check (client isolation is caught in routes initially, but we secure owner isolation here)  
    if current_user.role == UserRole.owner:
        staff = await session.get(Staff, booking.staff_id)
        salon = await session.get(Salon, staff.salon_id)
        if str(salon.owner_id) != str(current_user.id):
            raise HTTPException(status_code=403, detail="Not authorized to cancel bookings for this salon")
            
    booking.status = BookingStatus.cancelled
    session.add(booking)
    await session.commit()
    await session.refresh(booking)
    return booking
