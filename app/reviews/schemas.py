import uuid
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel


class ReviewBase(SQLModel):
    salon_id: uuid.UUID
    rating: int
    comment: Optional[str] = None


class ReviewCreate(ReviewBase):
    pass


class ReviewRead(ReviewBase):
    id: uuid.UUID
    author_id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True
