import uuid
from typing import List, Optional
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from app.staff_services.models import StaffService
from app.staff_services.schemas import StaffServiceCreate, StaffServiceUpdate
from app.staff.models import Staff
from app.salons.models import Salon
from app.users.models import User, UserRole
from fastapi import HTTPException


async def get_all(session: AsyncSession) -> List[StaffService]:
    result = await session.exec(select(StaffService))
    return result.all()


async def get_by_staff(staff_id: uuid.UUID, session: AsyncSession) -> List[StaffService]:
    result = await session.exec(
        select(StaffService).where(StaffService.staff_id == staff_id)
    )
    return result.all()


async def create_staff_service(data: StaffServiceCreate, session: AsyncSession, current_user: User) -> StaffService:
    staff = await session.get(Staff, data.staff_id)
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")
        
    salon = await session.get(Salon, staff.salon_id)
    if not salon:
        raise HTTPException(status_code=404, detail="Salon not found")
    if current_user.role != UserRole.admin and str(salon.owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized to modify this staff's services")

    # Validate the service exists AND belongs to the same salon as the staff —
    # otherwise a barber could be linked to another salon's service.
    from app.services.models import Service
    service = await session.get(Service, data.service_id)
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    if str(service.salon_id) != str(staff.salon_id):
        raise HTTPException(status_code=400, detail="Service does not belong to this staff member's salon")

    # Idempotent: re-assigning an existing link updates its price instead of
    # raising a composite-PK conflict (staff_id + service_id).
    existing = await session.get(StaffService, (data.staff_id, data.service_id))
    if existing:
        existing.custom_price = data.custom_price
        session.add(existing)
        await session.commit()
        await session.refresh(existing)
        return existing

    link = StaffService(**data.model_dump())
    session.add(link)
    await session.commit()
    await session.refresh(link)
    return link


async def update_staff_service(
    staff_id: uuid.UUID,
    service_id: uuid.UUID,
    data: StaffServiceUpdate,
    session: AsyncSession,
    current_user: User,
) -> Optional[StaffService]:
    link = await session.get(StaffService, (staff_id, service_id))
    if not link:
        return None
        
    staff = await session.get(Staff, staff_id)
    salon = await session.get(Salon, staff.salon_id)
    if current_user.role != UserRole.admin and str(salon.owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized to modify this staff's services")
        
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(link, key, value)
    session.add(link)
    await session.commit()
    await session.refresh(link)
    return link


async def delete_staff_service(
    staff_id: uuid.UUID, service_id: uuid.UUID, session: AsyncSession, current_user: User
) -> bool:
    link = await session.get(StaffService, (staff_id, service_id))
    if not link:
        return False
        
    staff = await session.get(Staff, staff_id)
    salon = await session.get(Salon, staff.salon_id)
    if current_user.role != UserRole.admin and str(salon.owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized to delete this staff's services")
        
    await session.delete(link)
    await session.commit()
    return True
