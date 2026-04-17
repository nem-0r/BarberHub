import uuid
from typing import Optional
from sqlmodel import SQLModel


class StaffCreate(SQLModel):
    user_id: Optional[uuid.UUID] = None
    email: Optional[str] = None
    full_name: Optional[str] = None
    salon_id: uuid.UUID
    position: str
    image_url: Optional[str] = None
    years_experience: Optional[int] = None
    rating: Optional[float] = None
    specialties: Optional[list[str]] = None
    is_active: bool = True


class StaffUpdate(SQLModel):
    position: Optional[str] = None
    image_url: Optional[str] = None
    years_experience: Optional[int] = None
    rating: Optional[float] = None
    specialties: Optional[list[str]] = None
    is_active: Optional[bool] = None


class StaffRead(SQLModel):
    id: uuid.UUID
    user_id: uuid.UUID
    salon_id: uuid.UUID
    position: str
    image_url: Optional[str]
    years_experience: Optional[int]
    rating: Optional[float]
    specialties: Optional[list[str]]
    is_active: bool
    # Enriched from User join
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None

    class Config:
        from_attributes = True
