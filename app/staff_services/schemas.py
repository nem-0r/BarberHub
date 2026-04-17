import uuid
from decimal import Decimal
from typing import Optional
from sqlmodel import SQLModel


class StaffServiceCreate(SQLModel):
    staff_id: uuid.UUID
    service_id: uuid.UUID
    custom_price: Optional[Decimal] = None


class StaffServiceUpdate(SQLModel):
    custom_price: Optional[Decimal] = None


class StaffServiceRead(SQLModel):
    staff_id: uuid.UUID
    service_id: uuid.UUID
    custom_price: Optional[Decimal] = None

    class Config:
        from_attributes = True
