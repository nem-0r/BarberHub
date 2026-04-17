import uuid
from datetime import time
from typing import Optional
from sqlmodel import SQLModel


class ScheduleCreate(SQLModel):
    staff_id: uuid.UUID
    day_of_week: int
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    is_day_off: bool = False


class ScheduleUpdate(SQLModel):
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    is_day_off: Optional[bool] = None


class ScheduleRead(SQLModel):
    id: uuid.UUID
    staff_id: uuid.UUID
    day_of_week: int
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    is_day_off: bool

    class Config:
        from_attributes = True
