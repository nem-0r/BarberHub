import uuid
from decimal import Decimal
from typing import Optional
from sqlmodel import SQLModel


class ServiceCreate(SQLModel):
    salon_id: uuid.UUID
    name: str
    base_price: Decimal
    duration_minutes: int
    description: Optional[str] = None
    category: Optional[str] = None
    is_active: bool = True


class ServiceUpdate(SQLModel):
    name: Optional[str] = None
    base_price: Optional[Decimal] = None
    duration_minutes: Optional[int] = None
    description: Optional[str] = None
    category: Optional[str] = None
    is_active: Optional[bool] = None


class ServiceRead(SQLModel):
    id: uuid.UUID
    salon_id: uuid.UUID
    name: str
    base_price: Decimal
    duration_minutes: int
    description: Optional[str]
    category: Optional[str]
    is_active: bool

    class Config:
        from_attributes = True
