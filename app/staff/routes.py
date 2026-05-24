import uuid
from typing import List
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, File, UploadFile
from sqlmodel.ext.asyncio.session import AsyncSession
from database import get_session
from app.staff.schemas import StaffCreate, StaffUpdate, StaffRead
import app.staff.service as svc
from app.dependencies import get_current_user, RoleChecker
from app.users.models import UserRole, User
from app.salons.models import Salon
from app.pagination import pagination_params

router = APIRouter(prefix="/staff", tags=["Staff"])

owner_admin_only = RoleChecker([UserRole.owner, UserRole.admin])


@router.get("/", response_model=List[StaffRead])
async def list_staff(
    session: AsyncSession = Depends(get_session),
    pagination: dict = Depends(pagination_params),
):
    return await svc.get_all_staff(session, **pagination)


@router.get("/salon/{salon_id}", response_model=List[StaffRead])
async def list_staff_by_salon(
    salon_id: uuid.UUID, session: AsyncSession = Depends(get_session)
):
    return await svc.get_staff_by_salon(salon_id, session)


@router.get("/user/{user_id}", response_model=StaffRead)
async def get_staff_by_user(
    user_id: uuid.UUID, session: AsyncSession = Depends(get_session)
):
    staff = await svc.get_staff_by_user_id(user_id, session)
    if not staff:
        raise HTTPException(
            status_code=404, detail="Staff record not found for this user"
        )
    return staff


@router.get("/{staff_id}", response_model=StaffRead)
async def get_staff(staff_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    staff = await svc.get_staff_by_id(staff_id, session)
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")
    return staff


@router.post(
    "/",
    response_model=StaffRead,
    status_code=201,
    dependencies=[Depends(owner_admin_only)],
)
async def create_staff(
    data: StaffCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    return await svc.create_staff(data, session, current_user)


@router.patch(
    "/{staff_id}", response_model=StaffRead, dependencies=[Depends(owner_admin_only)]
)
async def update_staff(
    staff_id: uuid.UUID,
    data: StaffUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    staff = await svc.update_staff(staff_id, data, session, current_user)
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")
    return staff


@router.delete("/{staff_id}", status_code=204, dependencies=[Depends(owner_admin_only)])
async def delete_staff(
    staff_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    deleted = await svc.delete_staff(staff_id, session, current_user)
    if not deleted:
        raise HTTPException(status_code=404, detail="Staff not found")


@router.post("/{staff_id}/image", dependencies=[Depends(owner_admin_only)])
async def upload_staff_avatar(
    staff_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    staff = await svc.get_staff_by_id(staff_id, session)
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")

    salon = await session.get(Salon, staff.salon_id)
    if current_user.role != UserRole.admin and str(salon.owner_id) != str(
        current_user.id
    ):
        raise HTTPException(
            status_code=403, detail="Not authorized to modify this staff member"
        )

    from app.tasks.dispatch import queue_image_upload

    contents = await file.read()
    queue_image_upload(
        entity_type="staff",
        entity_id=str(staff_id),
        image_bytes=contents,
        filename=file.filename,
        background_tasks=background_tasks,
    )

    return {"message": "Avatar upload started in background", "filename": file.filename}
