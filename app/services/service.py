import uuid
from typing import List, Optional
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from app.services.models import Service
from app.services.schemas import ServiceCreate, ServiceUpdate
from app.salons.models import Salon
from app.users.models import User, UserRole
from fastapi import HTTPException


SERVICE_SORTABLE_FIELDS = {"name", "base_price", "duration_minutes", "category"}


async def get_all_services(
    session: AsyncSession,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    sort_by: str = "name",
    order: str = "asc",
    skip: int = 0,
    limit: int = 50,
) -> List[Service]:
    statement = select(Service)
    if min_price is not None:
        statement = statement.where(Service.base_price >= min_price)
    if max_price is not None:
        statement = statement.where(Service.base_price <= max_price)
    
    if sort_by and sort_by in SERVICE_SORTABLE_FIELDS:
        attr = getattr(Service, sort_by)
        if order == "desc":
            statement = statement.order_by(attr.desc())
        else:
            statement = statement.order_by(attr.asc())
            
    result = await session.exec(statement.offset(skip).limit(limit))
    return result.all()


async def get_service_by_id(service_id: uuid.UUID, session: AsyncSession) -> Optional[Service]:
    return await session.get(Service, service_id)


async def get_services_by_salon(salon_id: uuid.UUID, session: AsyncSession) -> List[Service]:
    result = await session.exec(select(Service).where(Service.salon_id == salon_id))
    return result.all()


async def create_service(data: ServiceCreate, session: AsyncSession, current_user: User) -> Service:
    salon = await session.get(Salon, data.salon_id)
    if not salon:
        raise HTTPException(status_code=404, detail="Salon not found")
    if current_user.role != UserRole.admin and str(salon.owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized to add services to this salon")
        
    service = Service(**data.model_dump())
    session.add(service)
    await session.commit()
    await session.refresh(service)
    return service


async def update_service(service_id: uuid.UUID, data: ServiceUpdate, session: AsyncSession, current_user: User) -> Optional[Service]:
    service = await session.get(Service, service_id)
    if not service:
        return None

    salon = await session.get(Salon, service.salon_id)
    if not salon:
        raise HTTPException(status_code=404, detail="Salon not found")
    if current_user.role != UserRole.admin and str(salon.owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized to modify this service")
        
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(service, key, value)
    session.add(service)
    await session.commit()
    await session.refresh(service)
    return service


async def delete_service(service_id: uuid.UUID, session: AsyncSession, current_user: User) -> bool:
    service = await session.get(Service, service_id)
    if not service:
        return False

    salon = await session.get(Salon, service.salon_id)
    if not salon:
        raise HTTPException(status_code=404, detail="Salon not found")
    if current_user.role != UserRole.admin and str(salon.owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized to delete this service")

    # Clean dependent staff↔service links first. The FK has no ON DELETE CASCADE,
    # so deleting a service that any barber provides would otherwise raise an
    # IntegrityError (500). Same transaction → atomic.
    from app.staff_services.models import StaffService
    links = (
        await session.exec(select(StaffService).where(StaffService.service_id == service_id))
    ).all()
    for link in links:
        await session.delete(link)

    await session.delete(service)
    await session.commit()
    return True
