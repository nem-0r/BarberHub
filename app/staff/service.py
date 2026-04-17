import uuid
from typing import List, Optional
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from app.staff.models import Staff
from app.staff.schemas import StaffCreate, StaffUpdate, StaffRead
from app.salons.models import Salon
from app.users.models import User, UserRole
from fastapi import HTTPException


def _enrich(staff: Staff, user: Optional[User]) -> StaffRead:
    """Merge Staff ORM object with its User row into a StaffRead schema."""
    data = StaffRead.model_validate(staff)
    if user:
        data.full_name = user.full_name
        data.avatar_url = user.avatar_url
        data.email = user.email
        data.phone = user.phone
    return data


async def get_all_staff(session: AsyncSession) -> List[StaffRead]:
    result = await session.exec(select(Staff))
    staff_list = result.all()
    # Bulk-fetch all related users in one query
    user_ids = [s.user_id for s in staff_list if s.user_id]
    users_map: dict[uuid.UUID, User] = {}
    if user_ids:
        users_result = await session.exec(select(User).where(User.id.in_(user_ids)))
        for u in users_result.all():
            users_map[u.id] = u
    return [_enrich(s, users_map.get(s.user_id)) for s in staff_list]


async def get_staff_by_id(staff_id: uuid.UUID, session: AsyncSession) -> Optional[StaffRead]:
    staff = await session.get(Staff, staff_id)
    if not staff:
        return None
    user = await session.get(User, staff.user_id) if staff.user_id else None
    return _enrich(staff, user)


async def get_staff_by_salon(salon_id: uuid.UUID, session: AsyncSession) -> List[StaffRead]:
    result = await session.exec(select(Staff).where(Staff.salon_id == salon_id))
    staff_list = result.all()
    user_ids = [s.user_id for s in staff_list if s.user_id]
    users_map: dict[uuid.UUID, User] = {}
    if user_ids:
        users_result = await session.exec(select(User).where(User.id.in_(user_ids)))
        for u in users_result.all():
            users_map[u.id] = u
    return [_enrich(s, users_map.get(s.user_id)) for s in staff_list]


async def get_staff_by_user_id(user_id: uuid.UUID, session: AsyncSession) -> Optional[StaffRead]:
    result = await session.exec(select(Staff).where(Staff.user_id == user_id))
    staff = result.first()
    if not staff:
        return None
    user = await session.get(User, staff.user_id)
    return _enrich(staff, user)


async def create_staff(data: StaffCreate, session: AsyncSession, current_user: User) -> Staff:
    salon = await session.get(Salon, data.salon_id)
    if not salon:
        raise HTTPException(status_code=404, detail="Salon not found")
        
    if current_user.role != UserRole.admin and str(salon.owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized to add staff to this salon")
        
    user_id = data.user_id
    
    # Auto-create user if email provided and user_id missing
    if not user_id and data.email:
        # Check if user already exists
        existing_user_res = await session.exec(select(User).where(User.email == data.email))
        existing_user = existing_user_res.first()
        
        if existing_user:
            user_id = existing_user.id
        else:
            # Create a new user with staff role
            from app.users.auth import hash_password
            import secrets
            
            temp_password = secrets.token_urlsafe(12)
            # phone must be unique NOT NULL; use a placeholder derived from email
            placeholder_phone = f"+0{abs(hash(data.email)) % 10_000_000_000_000:013d}"
            new_user = User(
                email=data.email,
                full_name=data.full_name or data.email.split('@')[0],
                phone=placeholder_phone,
                password_hash=hash_password(temp_password),
                role=UserRole.staff,
            )
            session.add(new_user)
            await session.flush() # Get the new user ID
            user_id = new_user.id

    if not user_id:
        raise HTTPException(status_code=400, detail="Missing user_id or email for staff creation")

    # Upgrade user role if they were a client
    user = await session.get(User, user_id)
    if user and user.role == UserRole.client:
        user.role = UserRole.staff
        session.add(user)

    staff_data = data.model_dump(exclude={"email", "full_name", "user_id"})
    staff = Staff(user_id=user_id, **staff_data)
    session.add(staff)
    await session.commit()
    await session.refresh(staff)
    user = await session.get(User, staff.user_id) if staff.user_id else None
    return _enrich(staff, user)


async def update_staff(staff_id: uuid.UUID, data: StaffUpdate, session: AsyncSession, current_user: User) -> Optional[StaffRead]:
    staff = await session.get(Staff, staff_id)
    if not staff:
        return None

    salon = await session.get(Salon, staff.salon_id)
    if current_user.role != UserRole.admin and str(salon.owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized to modify this staff member")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(staff, key, value)
    session.add(staff)
    await session.commit()
    await session.refresh(staff)
    user = await session.get(User, staff.user_id) if staff.user_id else None
    return _enrich(staff, user)


async def delete_staff(staff_id: uuid.UUID, session: AsyncSession, current_user: User) -> bool:
    staff = await session.get(Staff, staff_id)
    if not staff:
        return False

    salon = await session.get(Salon, staff.salon_id)
    if current_user.role != UserRole.admin and str(salon.owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized to delete this staff member")
        
    await session.delete(staff)
    await session.commit()
    return True
