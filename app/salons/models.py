import uuid
from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship, Column
import sqlalchemy as sa


class Salon(SQLModel, table=True):
    __tablename__ = "salons"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    owner_id: uuid.UUID = Field(foreign_key="users.id", nullable=False)
    name: str = Field(sa_column=sa.Column(sa.String(100), nullable=False))
    address: str = Field(sa_column=sa.Column(sa.Text, nullable=False))
    timezone: str = Field(default="UTC", sa_column=sa.Column(sa.String(50), default="UTC"))
    image_url: Optional[str] = Field(default=None, sa_column=sa.Column(sa.String(255), nullable=True))
    city: Optional[str] = Field(default=None, sa_column=sa.Column(sa.String(100), nullable=True))
    description: Optional[str] = Field(default=None, sa_column=sa.Column(sa.Text, nullable=True))
    rating: Optional[float] = Field(default=None, sa_column=sa.Column(sa.Float, nullable=True))
    review_count: int = Field(default=0, sa_column=sa.Column(sa.Integer, default=0))
    price_range: Optional[str] = Field(default=None, sa_column=sa.Column(sa.String(10), nullable=True))
    tags: Optional[List[str]] = Field(default=None, sa_column=sa.Column(sa.JSON, nullable=True))
    operating_hours: Optional[dict] = Field(default=None, sa_column=sa.Column(sa.JSON, nullable=True))
    is_active: bool = Field(default=True)

    owner: Optional["User"] = Relationship(
        back_populates="salons",
        sa_relationship_kwargs={"lazy": "noload"},
    )
    staff_members: List["Staff"] = Relationship(
        back_populates="salon",
        sa_relationship_kwargs={"lazy": "noload"},
    )
    services: List["Service"] = Relationship(
        back_populates="salon",
        sa_relationship_kwargs={"lazy": "noload"},
    )
    reviews: List["Review"] = Relationship(
        back_populates="salon",
        sa_relationship_kwargs={"lazy": "noload"},
    )
