import uuid
from typing import List, Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File, Request
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from database import get_session
from app.salons.schemas import SalonCreate, SalonUpdate, SalonRead
import app.salons.service as svc
from app.dependencies import get_current_user, RoleChecker
from app.users.models import UserRole, User
from app.limiter import limiter
from app.salons.models import Salon
from app.tasks.dispatch import queue_image_upload
from app.pagination import pagination_params

router = APIRouter(prefix="/salons", tags=["Salons"])

owner_admin_only = RoleChecker([UserRole.owner, UserRole.admin])


@router.get("/", response_model=List[SalonRead])
@limiter.limit("1000/hour")
async def list_salons(
    request: Request,
    search: Optional[str] = None,
    sort_by: Optional[str] = "name",
    order: str = "asc",
    session: AsyncSession = Depends(get_session),
    pagination: dict = Depends(pagination_params),
):
    return await svc.get_all_salons(session, search, sort_by, order, **pagination)


@router.get("/{salon_id}", response_model=SalonRead)
@limiter.limit("1000/hour")
async def get_salon(request: Request, salon_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    salon = await svc.get_salon_by_id(salon_id, session)
    if not salon:
        raise HTTPException(status_code=404, detail="Salon not found")
    return salon


@router.get("/owner/{owner_id}", response_model=SalonRead)
@limiter.limit("100/hour")
async def get_salon_by_owner(request: Request, owner_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    statement = select(Salon).where(Salon.owner_id == owner_id)
    result = await session.exec(statement)
    salon = result.first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon not found for this owner")
    is_open, open_until = svc.calculate_salon_status(salon)
    return SalonRead(**salon.model_dump(), is_open=is_open, open_until=open_until)


@router.get("/{salon_id}/stats", dependencies=[Depends(owner_admin_only)])
@limiter.limit("60/hour")
async def get_salon_stats(
    request: Request,
    salon_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    salon = await svc.get_salon_by_id(salon_id, session)
    if not salon:
        raise HTTPException(status_code=404, detail="Salon not found")
        
    if current_user.role != UserRole.admin and str(salon.owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized to see these stats")
        
    return await svc.get_salon_stats(salon_id, session)


@router.post("/", response_model=SalonRead, status_code=201, dependencies=[Depends(owner_admin_only)])
@limiter.limit("20/minute;100/hour")
async def create_salon(
    request: Request,
    data: SalonCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    # Automatically assign current user as owner if it's a partner registration
    if current_user.role == UserRole.owner:
        data.owner_id = current_user.id
    elif current_user.role != UserRole.admin and str(current_user.id) != str(data.owner_id):
        raise HTTPException(status_code=403, detail="Cannot create salon for another user")
        
    return await svc.create_salon(data, session)


@router.patch("/{salon_id}", response_model=SalonRead, dependencies=[Depends(owner_admin_only)])
@limiter.limit("20/minute;100/hour")
async def update_salon(
    request: Request, 
    salon_id: uuid.UUID, 
    data: SalonUpdate, 
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    salon = await svc.update_salon(salon_id, data, session, current_user)
    if not salon:
        raise HTTPException(status_code=404, detail="Salon not found")
    return salon


@router.delete("/{salon_id}", status_code=204, dependencies=[Depends(owner_admin_only)])
@limiter.limit("20/minute;100/hour")
async def delete_salon(
    request: Request, 
    salon_id: uuid.UUID, 
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    deleted = await svc.delete_salon(salon_id, session, current_user)
    if not deleted:
        raise HTTPException(status_code=404, detail="Salon not found")


@router.post("/{salon_id}/image", dependencies=[Depends(owner_admin_only)])
@limiter.limit("5/minute;20/hour")
async def upload_salon_image(
    request: Request,
    salon_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    salon = await svc.get_salon_by_id(salon_id, session)
    if not salon:
        raise HTTPException(status_code=404, detail="Salon not found")

    if current_user.role != UserRole.admin and str(salon.owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized to modify this salon")

    contents = await file.read()

    queue_image_upload(
        entity_type="salons",
        entity_id=str(salon_id),
        image_bytes=contents,
        filename=file.filename,
        background_tasks=background_tasks,
    )

    return {"message": "Image upload started in background", "filename": file.filename}
