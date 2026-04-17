import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel.ext.asyncio.session import AsyncSession
from database import get_session
from app.schedules.schemas import ScheduleCreate, ScheduleUpdate, ScheduleRead
import app.schedules.service as svc
from app.dependencies import get_current_user, RoleChecker
from app.users.models import UserRole

router = APIRouter(prefix="/schedules", tags=["Schedules"])

staff_owner_admin = RoleChecker([UserRole.staff, UserRole.owner, UserRole.admin])
owner_admin_only = RoleChecker([UserRole.owner, UserRole.admin])


@router.get("/staff/{staff_id}", response_model=List[ScheduleRead])
async def list_for_staff(staff_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    return await svc.get_schedules_for_staff(staff_id, session)


@router.get("/{schedule_id}", response_model=ScheduleRead)
async def get_schedule(schedule_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    schedule = await svc.get_schedule_by_id(schedule_id, session)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return schedule


@router.post("/", response_model=ScheduleRead, status_code=201, dependencies=[Depends(staff_owner_admin)])
async def create_schedule(data: ScheduleCreate, session: AsyncSession = Depends(get_session)):
    return await svc.create_schedule(data, session)


@router.patch("/{schedule_id}", response_model=ScheduleRead, dependencies=[Depends(staff_owner_admin)])
async def update_schedule(schedule_id: uuid.UUID, data: ScheduleUpdate, session: AsyncSession = Depends(get_session)):
    schedule = await svc.update_schedule(schedule_id, data, session)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return schedule


@router.delete("/{schedule_id}", status_code=204, dependencies=[Depends(owner_admin_only)])
async def delete_schedule(schedule_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    deleted = await svc.delete_schedule(schedule_id, session)
    if not deleted:
        raise HTTPException(status_code=404, detail="Schedule not found")
