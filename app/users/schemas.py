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

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if len(v) > 128:
            raise ValueError("Password must be at most 128 characters")
        return v

    @field_validator("role")
    @classmethod
    def public_roles_only(cls, v: UserRole) -> UserRole:
        if v not in (UserRole.client, UserRole.owner):
            raise ValueError("role must be either 'client' or 'owner'")
        return v


class UserLogin(SQLModel):
    email: EmailStr
    password: str


class GoogleOAuthRequest(SQLModel):
    id_token: str


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None

    @field_validator("avatar_url")
    @classmethod
    def avatar_url_scheme(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.startswith(("http://", "https://")):
            raise ValueError("avatar_url must use http or https scheme")
        return v

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
    phone: Optional[str] = None
    role: UserRole
    is_verified: bool
    avatar_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ForgotPasswordRequest(SQLModel):
    email: EmailStr


class ResendVerificationRequest(SQLModel):
    email: EmailStr


class ResetPasswordConfirm(SQLModel):
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if len(v) > 128:
            raise ValueError("Password must be at most 128 characters")
        return v
