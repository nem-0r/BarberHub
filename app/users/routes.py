import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel.ext.asyncio.session import AsyncSession
from database import get_session
from config import settings
from app.dependencies import get_current_user, oauth2_scheme, RoleChecker
from app.users.schemas import UserCreate, UserUpdate, UserRead, UserLogin, ForgotPasswordRequest, ResetPasswordConfirm
import app.users.service as svc
from app.users.auth import create_access_token, verify_password, decode_access_token, hash_password
from app.users.redis import block_token, mark_reset_token_as_used, is_reset_token_used
from app.users.models import User, UserRole
from app.exceptions import AuthenticationError
from app.users.auth_verification import generate_verification_token, verify_token, generate_password_reset_token, verify_password_reset_token
from app.tasks.email_tasks import send_verification_email_task, send_password_reset_email_task
from fastapi import UploadFile, File
from app.tasks.image_tasks import process_image_upload_task

from app.limiter import limiter

router = APIRouter(prefix="/users", tags=["Users"])

# RBAC Instances
admin_only = RoleChecker([UserRole.admin])


@router.get("/", response_model=List[UserRead], dependencies=[Depends(admin_only)])
@limiter.limit("1000/hour")
async def list_users(request: Request, session: AsyncSession = Depends(get_session)):
    return await svc.get_all_users(session)


@router.get("/me", response_model=UserRead)
@limiter.limit("1000/hour")
async def get_me(request: Request, current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/me/stats")
@limiter.limit("100/minute")
async def get_my_stats(
    request: Request,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Role-aware stats for the current user."""
    from sqlmodel import select
    from app.bookings.models import Booking, BookingStatus
    from app.staff.models import Staff

    if current_user.role in (UserRole.client, UserRole.owner):
        result = await session.exec(
            select(Booking).where(Booking.client_id == current_user.id)
        )
        all_bookings = result.all()
        total_spent = sum(
            float(b.final_price)
            for b in all_bookings
            if b.status == BookingStatus.completed
        )
        upcoming = sum(
            1 for b in all_bookings
            if b.status in (BookingStatus.pending, BookingStatus.confirmed)
        )
        return {
            "role": current_user.role.value,
            "total_bookings": len(all_bookings),
            "total_spent": round(total_spent, 2),
            "upcoming_count": upcoming,
        }

    # staff
    staff_res = await session.exec(select(Staff).where(Staff.user_id == current_user.id))
    staff = staff_res.first()
    if not staff:
        return {"role": "staff", "completed_jobs": 0, "upcoming_count": 0, "rating": None}

    bookings_res = await session.exec(select(Booking).where(Booking.staff_id == staff.id))
    all_bookings = bookings_res.all()
    completed_jobs = sum(1 for b in all_bookings if b.status == BookingStatus.completed)
    upcoming_count = sum(
        1 for b in all_bookings
        if b.status in (BookingStatus.pending, BookingStatus.confirmed)
    )
    return {
        "role": "staff",
        "completed_jobs": completed_jobs,
        "upcoming_count": upcoming_count,
        "rating": float(staff.rating) if staff.rating else None,
    }


@router.post("/me/avatar")
@limiter.limit("5/minute")
async def upload_my_avatar(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Endpoint or Schema"""
    image_bytes = await file.read()
    process_image_upload_task.delay(
        entity_type="users",
        entity_id=str(current_user.id),
        image_bytes=image_bytes,
        filename=file.filename
    )
    return {"message": "Avatar upload started"}


@router.patch("/me", response_model=UserRead)
@limiter.limit("20/minute;100/hour")
async def update_me(
    request: Request,
    data: UserUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Update the current user's own profile (full_name, phone, avatar_url)."""
    return await svc.update_user(current_user.id, data, session)


@router.get("/{user_id}", response_model=UserRead)
@limiter.limit("1000/hour")
async def get_user(request: Request, user_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    return await svc.get_user_by_id(user_id, session)


@router.post("/", response_model=UserRead, status_code=201)
@limiter.limit("20/minute;100/hour")
async def create_user(request: Request, data: UserCreate, session: AsyncSession = Depends(get_session)):
    user = await svc.create_user(data, session)

    token = generate_verification_token(user.email)
    send_verification_email_task.delay(user.email, token)

    return user


@router.post("/login")
@limiter.limit("20/minute;100/hour")
async def login(request: Request, data: UserLogin, session: AsyncSession = Depends(get_session)):
    user = await svc.get_user_by_email(data.email, session)
    if not user or not verify_password(data.password, user.password_hash):
        raise AuthenticationError()

    if not user.is_verified:
        raise HTTPException(
            status_code=403,
            detail={"code": "EMAIL_NOT_VERIFIED", "message": "Please verify your email address before signing in. Check your inbox for the confirmation link."},
        )

    access_token = create_access_token(data={"sub": str(user.id), "role": user.role.value})
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/logout")
@limiter.limit("20/minute;100/hour")
async def logout(request: Request, current_user: User = Depends(get_current_user), token: str = Depends(oauth2_scheme)):
    payload = decode_access_token(token)
    if payload and "jti" in payload:
        # Block for 2x the expiry time to be safe
        await block_token(payload["jti"], settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60)
    return {"message": "Successfully logged out"}



@router.patch("/{user_id}", response_model=UserRead)
@limiter.limit("20/minute;100/hour")
async def update_user(
    request: Request,
    user_id: uuid.UUID,
    data: UserUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    # Only allow users to update themselves or admin
    if str(current_user.id) != str(user_id) and current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to update this user")

    return await svc.update_user(user_id, data, session)


@router.delete("/{user_id}", status_code=204, dependencies=[Depends(admin_only)])
@limiter.limit("20/minute;100/hour")
async def delete_user(request: Request, user_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    await svc.delete_user(user_id, session)


@router.get("/verify/{token}")
async def verify_email(token: str, session: AsyncSession = Depends(get_session)):
    email = verify_token(token)
    if not email:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    
    user = await svc.get_user_by_email(email, session)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.is_verified:
        return {"message": "Email already verified"}
    
    user.is_verified = True
    session.add(user)
    await session.commit()
    
    return {"message": "Email successfully verified! You can now log in."}


@router.post("/forgot-password", status_code=200)
@limiter.limit("5/minute;20/hour")
async def forgot_password(
    request: Request,
    data: ForgotPasswordRequest,
    session: AsyncSession = Depends(get_session)
):
    """Endpoint or Schema"""
    user = await svc.get_user_by_email(data.email, session)
    if user:
        token = generate_password_reset_token(user.email)
        send_password_reset_email_task.delay(user.email, token)
    return {"message": "If this email is registered, a password reset link has been sent."}


@router.post("/reset-password/{token}", status_code=200)
@limiter.limit("10/minute")
async def reset_password(
    request: Request,
    token: str,
    data: ResetPasswordConfirm,
    session: AsyncSession = Depends(get_session)
):
    """Resets password using token."""
    email = verify_password_reset_token(token)
    if not email:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    if await is_reset_token_used(token):
        raise HTTPException(status_code=400, detail="This reset link has already been used")

    user = await svc.get_user_by_email(email, session)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.password_hash = hash_password(data.new_password)
    session.add(user)
    await session.commit()

    await mark_reset_token_as_used(token)

    return {"message": "Password successfully reset. You can now log in with your new password."}

