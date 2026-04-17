import uuid
from typing import Optional
from sqlmodel import SQLModel


class SalonCreate(SQLModel):
    owner_id: uuid.UUID
    name: str
    address: str
    timezone: str = "UTC"
    city: Optional[str] = None
    description: Optional[str] = None
    rating: Optional[float] = None
    review_count: int = 0
    price_range: Optional[str] = None
    tags: Optional[list[str]] = None
    operating_hours: Optional[dict] = None
    image_url: Optional[str] = None
    is_active: bool = True


class SalonUpdate(SQLModel):
    name: Optional[str] = None
    address: Optional[str] = None
    timezone: Optional[str] = None
    city: Optional[str] = None
    description: Optional[str] = None
    rating: Optional[float] = None
    review_count: Optional[int] = None
    price_range: Optional[str] = None
    tags: Optional[list[str]] = None
    operating_hours: Optional[dict] = None
    image_url: Optional[str] = None
    is_active: Optional[bool] = None


class SalonRead(SQLModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    name: str
    address: str
    timezone: str
    city: Optional[str]
    description: Optional[str]
    rating: Optional[float]
    review_count: int
    price_range: Optional[str]
    tags: Optional[list[str]]
    operating_hours: Optional[dict]
    image_url: Optional[str]
    is_active: bool
    
    # Computed fields (populated in service)
    is_open: bool = True
    open_until: Optional[str] = None

    class Config:
        from_attributes = True
