import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, field_validator
from sqlmodel import SQLModel
from app.users.models import UserRole


class UserCreate(SQLModel):
    email: EmailStr
    password: str
    full_name: str
    phone: str
    role: UserRole = UserRole.client


class UserLogin(SQLModel):
    email: EmailStr
    password: str


class UserUpdate(BaseModel):
    """Partial update for user profile. All fields optional."""
    full_name: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None

    @field_validator("full_name")
    @classmethod
    def name_not_empty(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        stripped = v.strip()
        if not stripped:
            raise ValueError("Full name cannot be empty")
        return stripped

    @field_validator("phone")
    @classmethod
    def phone_max_length(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and len(v) > 20:
            raise ValueError("Phone number must be 20 characters or fewer")
        return v


class UserRead(SQLModel):
    id: uuid.UUID
    email: str
    full_name: str
    phone: str
    role: UserRole
    is_verified: bool
    avatar_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ForgotPasswordRequest(SQLModel):
    """Password reset request schema."""
    email: EmailStr


class ResetPasswordConfirm(SQLModel):
    """Password reset confirmation schema."""
    new_password: str
