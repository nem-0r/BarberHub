import uuid
import enum
from datetime import datetime, timezone
from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship
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
    # Nullable for OAuth-only accounts.
    password_hash: Optional[str] = Field(
        default=None, sa_column=sa.Column(sa.String(255), nullable=True)
    )
    full_name: str = Field(sa_column=sa.Column(sa.String(100), nullable=False))
    phone: Optional[str] = Field(
        default=None, sa_column=sa.Column(sa.String(20), unique=True, nullable=True)
    )
    role: UserRole = Field(
        sa_column=sa.Column(sa.Enum(UserRole), nullable=False, default=UserRole.client)
    )
    is_verified: bool = Field(default=False)
    avatar_url: Optional[str] = Field(
        default=None, sa_column=sa.Column(sa.String(255), nullable=True)
    )
    # Stable Google identifier for account linking.
    google_sub: Optional[str] = Field(
        default=None,
        sa_column=sa.Column(sa.String(255), unique=True, nullable=True, index=True),
    )
    created_at: datetime = Field(
        sa_column=sa.Column(
            sa.DateTime(timezone=True), nullable=False, default=sa.func.now()
        ),
        default_factory=lambda: datetime.now(timezone.utc),
    )

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
