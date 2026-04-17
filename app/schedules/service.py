import uuid
from typing import List, Optional
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from app.schedules.models import Schedule
from app.schedules.schemas import ScheduleCreate, ScheduleUpdate


async def get_schedules_for_staff(staff_id: uuid.UUID, session: AsyncSession) -> List[Schedule]:
    result = await session.exec(select(Schedule).where(Schedule.staff_id == staff_id))
    return result.all()


async def get_schedule_by_id(schedule_id: uuid.UUID, session: AsyncSession) -> Optional[Schedule]:
    return await session.get(Schedule, schedule_id)


async def create_schedule(data: ScheduleCreate, session: AsyncSession) -> Schedule:
    schedule = Schedule(**data.model_dump())
    session.add(schedule)
    await session.commit()
    await session.refresh(schedule)
    return schedule


async def update_schedule(
    schedule_id: uuid.UUID, data: ScheduleUpdate, session: AsyncSession
) -> Optional[Schedule]:
    schedule = await session.get(Schedule, schedule_id)
    if not schedule:
        return None
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(schedule, key, value)
    session.add(schedule)
    await session.commit()
    await session.refresh(schedule)
    return schedule


async def delete_schedule(schedule_id: uuid.UUID, session: AsyncSession) -> bool:
    schedule = await session.get(Schedule, schedule_id)
    if not schedule:
        return False
    await session.delete(schedule)
    await session.commit()
    return True
