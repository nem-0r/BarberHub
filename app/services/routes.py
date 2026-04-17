import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel.ext.asyncio.session import AsyncSession
from database import get_session
from app.services.schemas import ServiceCreate, ServiceUpdate, ServiceRead
import app.services.service as svc
from app.dependencies import get_current_user, RoleChecker
from app.users.models import UserRole, User

router = APIRouter(prefix="/services", tags=["Services"])

owner_admin_only = RoleChecker([UserRole.owner, UserRole.admin])


@router.get("/", response_model=List[ServiceRead])
async def list_services(
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    sort_by: str = "name",
    order: str = "asc",
    session: AsyncSession = Depends(get_session)
):
    return await svc.get_all_services(session, min_price, max_price, sort_by, order)


@router.get("/salon/{salon_id}", response_model=List[ServiceRead])
async def list_services_by_salon(salon_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    return await svc.get_services_by_salon(salon_id, session)


@router.get("/{service_id}", response_model=ServiceRead)
async def get_service(service_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    service = await svc.get_service_by_id(service_id, session)
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    return service


@router.post("/", response_model=ServiceRead, status_code=201, dependencies=[Depends(owner_admin_only)])
async def create_service(
    data: ServiceCreate, 
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    return await svc.create_service(data, session, current_user)


@router.patch("/{service_id}", response_model=ServiceRead, dependencies=[Depends(owner_admin_only)])
async def update_service(
    service_id: uuid.UUID, 
    data: ServiceUpdate, 
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    service = await svc.update_service(service_id, data, session, current_user)
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    return service


@router.delete("/{service_id}", status_code=204, dependencies=[Depends(owner_admin_only)])
async def delete_service(
    service_id: uuid.UUID, 
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    deleted = await svc.delete_service(service_id, session, current_user)
    if not deleted:
        raise HTTPException(status_code=404, detail="Service not found")
