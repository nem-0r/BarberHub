import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field, Relationship
import sqlalchemy as sa


class Review(SQLModel, table=True):
    __tablename__ = "reviews"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    author_id: uuid.UUID = Field(foreign_key="users.id", nullable=False, index=True)
    salon_id: uuid.UUID = Field(foreign_key="salons.id", nullable=False, index=True)
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = Field(default=None)
    created_at: datetime = Field(
        sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False, default=sa.func.now()),
        default_factory=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    author: Optional["User"] = Relationship(
        back_populates="reviews",
        sa_relationship_kwargs={"lazy": "noload"},
    )
    salon: Optional["Salon"] = Relationship(
        back_populates="reviews",
        sa_relationship_kwargs={"lazy": "noload"},
    )
