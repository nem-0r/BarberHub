import uuid
from datetime import date
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlmodel.ext.asyncio.session import AsyncSession
from database import get_session
from app.schedules.schemas import ScheduleCreate, ScheduleUpdate, ScheduleRead
import app.schedules.service as svc
from app.dependencies import get_current_user, RoleChecker
from app.users.models import UserRole, User
from app.limiter import limiter

router = APIRouter(prefix="/schedules", tags=["Schedules"])

staff_owner_admin = RoleChecker([UserRole.staff, UserRole.owner, UserRole.admin])
owner_admin_only = RoleChecker([UserRole.owner, UserRole.admin])


@router.get("/staff/{staff_id}/available-slots")
@limiter.limit("120/hour")
async def get_available_slots(
    request: Request,
    staff_id: uuid.UUID,
    date: date = Query(..., description="Date in YYYY-MM-DD format"),
    service_id: uuid.UUID = Query(
        ..., description="Service UUID to determine slot duration"
    ),
    session: AsyncSession = Depends(get_session),
):
    """Return free time slots for a staff member on a given date, minus already-booked slots."""
    return await svc.get_available_slots(staff_id, date, service_id, session)


@router.get("/staff/{staff_id}", response_model=List[ScheduleRead])
async def list_for_staff(
    staff_id: uuid.UUID, session: AsyncSession = Depends(get_session)
):
    return await svc.get_schedules_for_staff(staff_id, session)


@router.get("/{schedule_id}", response_model=ScheduleRead)
async def get_schedule(
    schedule_id: uuid.UUID, session: AsyncSession = Depends(get_session)
):
    schedule = await svc.get_schedule_by_id(schedule_id, session)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return schedule


@router.post(
    "/",
    response_model=ScheduleRead,
    status_code=201,
    dependencies=[Depends(staff_owner_admin)],
)
async def create_schedule(
    data: ScheduleCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    from app.staff.models import Staff
    from app.salons.models import Salon

    staff = await session.get(Staff, data.staff_id)
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")
    if current_user.role == UserRole.staff and str(staff.user_id) != str(
        current_user.id
    ):
        raise HTTPException(
            status_code=403, detail="Staff can only manage their own schedule"
        )
    if current_user.role == UserRole.owner:
        salon = await session.get(Salon, staff.salon_id)
        if str(salon.owner_id) != str(current_user.id):
            raise HTTPException(
                status_code=403,
                detail="Not authorized to manage schedule for this salon's staff",
            )
    return await svc.create_schedule(data, session)


@router.patch(
    "/{schedule_id}",
    response_model=ScheduleRead,
    dependencies=[Depends(staff_owner_admin)],
)
async def update_schedule(
    schedule_id: uuid.UUID,
    data: ScheduleUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    from app.staff.models import Staff
    from app.salons.models import Salon

    schedule = await svc.get_schedule_by_id(schedule_id, session)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    staff = await session.get(Staff, schedule.staff_id)
    if current_user.role == UserRole.staff and str(staff.user_id) != str(
        current_user.id
    ):
        raise HTTPException(
            status_code=403, detail="Staff can only manage their own schedule"
        )
    if current_user.role == UserRole.owner:
        salon = await session.get(Salon, staff.salon_id)
        if str(salon.owner_id) != str(current_user.id):
            raise HTTPException(status_code=403, detail="Not authorized")
    return await svc.update_schedule(schedule_id, data, session)


@router.delete(
    "/{schedule_id}", status_code=204, dependencies=[Depends(owner_admin_only)]
)
async def delete_schedule(
    schedule_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    from app.staff.models import Staff
    from app.salons.models import Salon

    schedule = await svc.get_schedule_by_id(schedule_id, session)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if current_user.role == UserRole.owner:
        staff = await session.get(Staff, schedule.staff_id)
        salon = await session.get(Salon, staff.salon_id)
        if str(salon.owner_id) != str(current_user.id):
            raise HTTPException(status_code=403, detail="Not authorized")
    deleted = await svc.delete_schedule(schedule_id, session)
    if not deleted:
        raise HTTPException(status_code=404, detail="Schedule not found")
