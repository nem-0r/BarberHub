import uuid
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field, Relationship


class Review(SQLModel, table=True):
    __tablename__ = "reviews"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    author_id: uuid.UUID = Field(foreign_key="users.id", nullable=False)
    salon_id: uuid.UUID = Field(foreign_key="salons.id", nullable=False)
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    author: Optional["User"] = Relationship(
        back_populates="reviews",
        sa_relationship_kwargs={"lazy": "noload"},
    )
    salon: Optional["Salon"] = Relationship(
        back_populates="reviews",
        sa_relationship_kwargs={"lazy": "noload"},
    )
