import uuid
from decimal import Decimal
from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship, Column
import sqlalchemy as sa


class Service(SQLModel, table=True):
    __tablename__ = "services"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    salon_id: uuid.UUID = Field(foreign_key="salons.id", nullable=False)
    name: str = Field(sa_column=sa.Column(sa.String(100), nullable=False))
    base_price: Decimal = Field(sa_column=sa.Column(sa.Numeric(10, 2), nullable=False))
    duration_minutes: int = Field(nullable=False)
    description: Optional[str] = Field(default=None, sa_column=sa.Column(sa.Text, nullable=True))
    category: Optional[str] = Field(default=None, sa_column=sa.Column(sa.String(50), nullable=True))
    is_active: bool = Field(default=True, nullable=False)

    
    salon: Optional["Salon"] = Relationship(
        back_populates="services",
        sa_relationship_kwargs={"lazy": "noload"},
    )
    staff_services: List["StaffService"] = Relationship(
        back_populates="service",
        sa_relationship_kwargs={"lazy": "noload"},
    )
    bookings: List["Booking"] = Relationship(
        back_populates="service",
        sa_relationship_kwargs={"lazy": "noload"},
    )
