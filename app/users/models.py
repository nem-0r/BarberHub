import uuid
import enum
from datetime import datetime
from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship, Column
import sqlalchemy as sa


class UserRole(str, enum.Enum):
    client = "client"
    staff = "staff"
    owner = "owner"
    admin = "admin"


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    email: str = Field(sa_column=sa.Column(sa.String(255), unique=True, nullable=False))
    password_hash: str = Field(sa_column=sa.Column(sa.String(255), nullable=False))
    full_name: str = Field(sa_column=sa.Column(sa.String(100), nullable=False))
    phone: str = Field(sa_column=sa.Column(sa.String(20), unique=True, nullable=False))
    role: UserRole = Field(
        sa_column=sa.Column(sa.Enum(UserRole), nullable=False, default=UserRole.client)
    )
    is_verified: bool = Field(default=False)
    avatar_url: Optional[str] = Field(default=None, sa_column=sa.Column(sa.String(255), nullable=True))
    created_at: datetime = Field(default_factory=datetime.utcnow)

    salons: List["Salon"] = Relationship(
        back_populates="owner",
        sa_relationship_kwargs={"lazy": "noload"},
    )
    staff_profile: Optional["Staff"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"lazy": "noload"},
    )
    bookings: List["Booking"] = Relationship(
        back_populates="client",
        sa_relationship_kwargs={"lazy": "noload"},
    )
    reviews: List["Review"] = Relationship(
        back_populates="author",
        sa_relationship_kwargs={"lazy": "noload"},
    )
