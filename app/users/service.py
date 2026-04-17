import uuid
from typing import List, Optional
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from app.users.models import User
from app.users.schemas import UserCreate, UserUpdate
from app.users.auth import hash_password
from app.exceptions import UserNotFoundError


async def get_all_users(session: AsyncSession) -> List[User]:
    result = await session.exec(select(User))
    return result.all()


async def get_user_by_id(user_id: uuid.UUID, session: AsyncSession) -> Optional[User]:
    return await session.get(User, user_id)


async def get_user_by_email(email: str, session: AsyncSession) -> Optional[User]:
    result = await session.exec(select(User).where(User.email == email))
    return result.first()


async def create_user(data: UserCreate, session: AsyncSession) -> User:
    user_data = data.model_dump()
    user_data["password_hash"] = hash_password(user_data.pop("password"))
    user = User(**user_data)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def update_user(user_id: uuid.UUID, data: UserUpdate, session: AsyncSession) -> User:
    user = await session.get(User, user_id)
    if not user:
        raise UserNotFoundError()
    update_data = data.model_dump(exclude_unset=True, exclude_none=True)
    for key, value in update_data.items():
        setattr(user, key, value)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def delete_user(user_id: uuid.UUID, session: AsyncSession):
    user = await session.get(User, user_id)
    if not user:
        raise UserNotFoundError()
    await session.delete(user)
    await session.commit()
