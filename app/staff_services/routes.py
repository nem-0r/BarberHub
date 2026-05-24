import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel.ext.asyncio.session import AsyncSession
from database import get_session
from app.staff_services.schemas import (
    StaffServiceCreate,
    StaffServiceUpdate,
    StaffServiceRead,
)
import app.staff_services.service as svc
from app.dependencies import get_current_user, RoleChecker
from app.users.models import UserRole, User

router = APIRouter(prefix="/staff-services", tags=["Staff Services"])

owner_admin_only = RoleChecker([UserRole.owner, UserRole.admin])


@router.get("/", response_model=List[StaffServiceRead])
async def list_all(session: AsyncSession = Depends(get_session)):
    return await svc.get_all(session)


@router.get("/staff/{staff_id}", response_model=List[StaffServiceRead])
async def list_by_staff(
    staff_id: uuid.UUID, session: AsyncSession = Depends(get_session)
):
    return await svc.get_by_staff(staff_id, session)


@router.post(
    "/",
    response_model=StaffServiceRead,
    status_code=201,
    dependencies=[Depends(owner_admin_only)],
)
async def assign(
    data: StaffServiceCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    return await svc.create_staff_service(data, session, current_user)


@router.patch(
    "/{staff_id}/{service_id}",
    response_model=StaffServiceRead,
    dependencies=[Depends(owner_admin_only)],
)
async def update_price(
    staff_id: uuid.UUID,
    service_id: uuid.UUID,
    data: StaffServiceUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    link = await svc.update_staff_service(
        staff_id, service_id, data, session, current_user
    )
    if not link:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return link


@router.delete(
    "/{staff_id}/{service_id}",
    status_code=204,
    dependencies=[Depends(owner_admin_only)],
)
async def remove(
    staff_id: uuid.UUID,
    service_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    deleted = await svc.delete_staff_service(
        staff_id, service_id, session, current_user
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Assignment not found")
