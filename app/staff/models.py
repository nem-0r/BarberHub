import uuid
from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship, Column
import sqlalchemy as sa


class Staff(SQLModel, table=True):
    __tablename__ = "staff"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", nullable=False, index=True)
    salon_id: uuid.UUID = Field(foreign_key="salons.id", nullable=False, index=True)
    position: str = Field(sa_column=sa.Column(sa.String(50), nullable=False))
    image_url: Optional[str] = Field(default=None, sa_column=sa.Column(sa.String(255), nullable=True))
    years_experience: Optional[int] = Field(default=None, sa_column=sa.Column(sa.Integer, nullable=True))
    rating: Optional[float] = Field(default=None, sa_column=sa.Column(sa.Float, nullable=True))
    specialties: Optional[List[str]] = Field(default=None, sa_column=sa.Column(sa.JSON, nullable=True))
    is_active: bool = Field(default=True)

    user: Optional["User"] = Relationship(
        back_populates="staff_profile",
        sa_relationship_kwargs={"lazy": "noload"},
    )
    salon: Optional["Salon"] = Relationship(
        back_populates="staff_members",
        sa_relationship_kwargs={"lazy": "noload"},
    )
    staff_services: List["StaffService"] = Relationship(
        back_populates="staff",
        sa_relationship_kwargs={"lazy": "noload"},
    )
    schedules: List["Schedule"] = Relationship(
        back_populates="staff",
        sa_relationship_kwargs={"lazy": "noload"},
    )
    bookings: List["Booking"] = Relationship(
        back_populates="staff",
        sa_relationship_kwargs={"lazy": "noload"},
    )
