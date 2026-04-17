import uuid
from decimal import Decimal
from typing import Optional
from sqlmodel import SQLModel, Field, Relationship, UniqueConstraint
import sqlalchemy as sa


class StaffService(SQLModel, table=True):
    __tablename__ = "staff_services"
    __table_args__ = (
        UniqueConstraint("staff_id", "service_id", name="uq_staff_service"),
    )

    staff_id: uuid.UUID = Field(foreign_key="staff.id", primary_key=True)
    service_id: uuid.UUID = Field(foreign_key="services.id", primary_key=True)
    custom_price: Optional[Decimal] = Field(
        default=None,
        sa_column=sa.Column(sa.Numeric(10, 2), nullable=True),
    )

    staff: Optional["Staff"] = Relationship(
        back_populates="staff_services",
        sa_relationship_kwargs={"lazy": "selectin"},
    )
    service: Optional["Service"] = Relationship(
        back_populates="staff_services",
        sa_relationship_kwargs={"lazy": "selectin"},
    )
