import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from database import get_session
from app.bookings.schemas import BookingCreate, BookingStatusUpdate, BookingRead
import app.bookings.service as svc
from app.dependencies import get_current_user, RoleChecker
from app.users.models import UserRole, User
from app.salons.models import Salon
from app.pagination import pagination_params
from app.limiter import limiter

router = APIRouter(prefix="/bookings", tags=["Bookings"])

admin_only = RoleChecker([UserRole.admin])
staff_owner_admin = RoleChecker([UserRole.staff, UserRole.owner, UserRole.admin])
owner_admin = RoleChecker([UserRole.owner, UserRole.admin])


@router.get("/", response_model=List[BookingRead], dependencies=[Depends(admin_only)])
async def list_bookings(
    session: AsyncSession = Depends(get_session),
    pagination: dict = Depends(pagination_params),
):
    return await svc.get_all_bookings(session, **pagination)


@router.get("/client/{client_id}", response_model=List[BookingRead])
async def list_for_client(
    client_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if str(current_user.id) != str(client_id) and current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    return await svc.get_bookings_for_client(client_id, session)


@router.get("/staff/{staff_id}", response_model=List[BookingRead], dependencies=[Depends(staff_owner_admin)])
async def list_for_staff(
    staff_id: uuid.UUID, 
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    return await svc.get_bookings_for_staff(staff_id, session, current_user)


@router.get("/salon/{salon_id}", response_model=List[BookingRead], dependencies=[Depends(owner_admin)])
async def list_for_salon(
    salon_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    # Security: verify the requesting owner actually owns this salon
    statement = select(Salon).where(Salon.id == salon_id)
    result = await session.exec(statement)
    salon = result.first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon not found")
    if current_user.role != UserRole.admin and str(salon.owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized to view bookings of this salon")
        
    return await svc.get_bookings_for_salon(salon_id, session)


@router.get("/{booking_id}", response_model=BookingRead)
async def get_booking(
    booking_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    booking = await svc.get_booking_by_id(booking_id, session)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    # Allow: the client who owns it, admin, or staff/owner of the salon
    if str(current_user.id) != str(booking.client_id) and current_user.role != UserRole.admin:
        from app.staff.models import Staff
        staff = await session.get(Staff, booking.staff_id)
        if not staff:
            raise HTTPException(status_code=403, detail="Not authorized")
        salon = await session.get(Salon, staff.salon_id)
        is_staff = current_user.role == UserRole.staff and str(staff.user_id) == str(current_user.id)
        is_owner = current_user.role == UserRole.owner and salon and str(salon.owner_id) == str(current_user.id)
        if not is_staff and not is_owner:
            raise HTTPException(status_code=403, detail="Not authorized to view this booking")
    return booking


@router.post("/", response_model=BookingRead, status_code=201)
@limiter.limit("10/hour;3/minute")
async def create_booking(
    request: Request,
    data: BookingCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    # Ensure client can only book for themselves unless they are admin
    if str(current_user.id) != str(data.client_id) and current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Not authorized to book for another user")
    return await svc.create_booking(data, session)


@router.patch("/{booking_id}/status", response_model=BookingRead, dependencies=[Depends(staff_owner_admin)])
async def update_status(
    booking_id: uuid.UUID,
    data: BookingStatusUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    booking = await svc.update_booking_status(booking_id, data, session, current_user)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    return booking


@router.post("/{booking_id}/cancel", response_model=BookingRead)
async def cancel_booking(
    booking_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    booking = await svc.get_booking_by_id(booking_id, session)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    # Owners and Admins can cancel any booking, Clients only their own
    if (str(current_user.id) != str(booking.client_id) and 
        current_user.role not in [UserRole.owner, UserRole.admin]):
        raise HTTPException(status_code=403, detail="Not authorized to cancel this booking")

    return await svc.cancel_booking(booking_id, session, current_user)
