import uuid
from datetime import time
from typing import Optional
from sqlmodel import SQLModel, Field, Relationship, UniqueConstraint


class Schedule(SQLModel, table=True):
    __tablename__ = "schedules"
    __table_args__ = (
        UniqueConstraint("staff_id", "day_of_week", name="uq_staff_day"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    staff_id: uuid.UUID = Field(foreign_key="staff.id", nullable=False)
    day_of_week: int = Field(ge=0, le=6, description="0=Monday … 6=Sunday")
    start_time: Optional[time] = Field(default=None)
    end_time: Optional[time] = Field(default=None)
    is_day_off: bool = Field(default=False)

    staff: Optional["Staff"] = Relationship(
        back_populates="schedules",
        sa_relationship_kwargs={"lazy": "selectin"},
    )
