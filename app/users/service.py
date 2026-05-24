import logging
import uuid
from typing import Any, Dict, List, Optional

from fastapi import BackgroundTasks
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select

from app.users.models import User, UserRole
from app.users.schemas import UserCreate, UserUpdate
from app.users.auth import hash_password
from app.users.redis import invalidate_user_cache, redis_client
from app.exceptions import UserNotFoundError, EmailAlreadyExistsError

logger = logging.getLogger(__name__)


async def get_all_users(
    session: AsyncSession, skip: int = 0, limit: int = 50
) -> List[User]:
    result = await session.exec(select(User).offset(skip).limit(limit))
    return result.all()


async def get_user_by_id(user_id: uuid.UUID, session: AsyncSession) -> Optional[User]:
    return await session.get(User, user_id)


async def get_user_by_email(email: str, session: AsyncSession) -> Optional[User]:
    # Normalize to match stored lower-case values.
    normalized = email.strip().lower()
    result = await session.exec(select(User).where(User.email == normalized))
    return result.first()


async def resend_verification_email(
    email: str,
    session: AsyncSession,
    background_tasks: BackgroundTasks,
) -> None:
    """Re-queue a verification email. Silent no-op for non-existent, verified, or OAuth accounts."""
    normalized = email.strip().lower()
    throttle_key = f"resend_throttle:{normalized}"
    try:
        was_set = await redis_client.set(throttle_key, "1", nx=True, ex=60)
        if not was_set:
            logger.info("Resend verification throttled (60s) for %s", normalized)
            return
    except Exception:
        logger.warning(
            "Redis throttle check failed for resend; proceeding without throttle."
        )

    user = await get_user_by_email(email, session)
    if user is None:
        logger.info("Resend requested for non-existent email (silent no-op)")
        return
    if user.is_verified:
        logger.info(
            "Resend requested for already-verified user id=%s (silent no-op)", user.id
        )
        return
    if not user.password_hash:
        # OAuth-only account — skip, Google already verified the email.
        logger.info(
            "Resend requested for OAuth-only user id=%s (silent no-op)", user.id
        )
        return

    from app.users.auth_verification import generate_verification_token
    from app.tasks.dispatch import queue_verification_email

    token = generate_verification_token(user.email)
    queue_verification_email(user.email, token, background_tasks=background_tasks)
    logger.info("Verification email queued for user id=%s", user.id)


async def create_user(data: UserCreate, session: AsyncSession) -> User:
    existing = await get_user_by_email(data.email, session)
    if existing:
        raise EmailAlreadyExistsError()

    user_data = data.model_dump()
    user_data["email"] = user_data["email"].strip().lower()
    user_data["password_hash"] = hash_password(user_data.pop("password"))
    user = User(**user_data)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def get_or_create_oauth_user(
    *,
    email: str,
    google_sub: str,
    full_name: str,
    avatar_url: Optional[str],
    session: AsyncSession,
) -> User:
    """Resolve or create a user from a Google id_token payload.

    Lookup order: google_sub -> email (account linking) -> create new.
    """
    email = (email or "").strip().lower()

    result = await session.exec(select(User).where(User.google_sub == google_sub))
    user = result.first()
    if user:
        return user

    result = await session.exec(select(User).where(User.email == email))
    user = result.first()
    if user:
        if not user.is_verified:
            # Google has proven ownership — clear any unverified password (anti-squatting).
            user.password_hash = None
        user.google_sub = google_sub
        user.is_verified = True
        if not user.avatar_url and avatar_url:
            user.avatar_url = avatar_url
        session.add(user)
        await session.commit()
        await session.refresh(user)
        await invalidate_user_cache(user.id)
        return user

    user = User(
        email=email,
        password_hash=None,
        full_name=full_name or email.split("@")[0],
        phone=None,
        role=UserRole.client,
        is_verified=True,
        avatar_url=avatar_url,
        google_sub=google_sub,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def update_user(
    user_id: uuid.UUID, data: UserUpdate, session: AsyncSession
) -> User:
    user = await session.get(User, user_id)
    if not user:
        raise UserNotFoundError()
    update_data = data.model_dump(exclude_unset=True, exclude_none=True)
    for key, value in update_data.items():
        setattr(user, key, value)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    await invalidate_user_cache(user_id)
    return user


async def delete_user(user_id: uuid.UUID, session: AsyncSession):
    user = await session.get(User, user_id)
    if not user:
        raise UserNotFoundError()
    await session.delete(user)
    await session.commit()
    await invalidate_user_cache(user_id)


async def get_user_stats(user: User, session: AsyncSession) -> Dict[str, Any]:
    """Return role-aware stats for the current user."""
    from app.bookings.models import Booking, BookingStatus
    from app.staff.models import Staff

    if user.role in (UserRole.client, UserRole.owner):
        result = await session.exec(select(Booking).where(Booking.client_id == user.id))
        all_bookings = result.all()
        total_spent = sum(
            float(b.final_price)
            for b in all_bookings
            if b.status == BookingStatus.completed
        )
        upcoming = sum(
            1
            for b in all_bookings
            if b.status in (BookingStatus.pending, BookingStatus.confirmed)
        )
        return {
            "role": user.role.value,
            "total_bookings": len(all_bookings),
            "total_spent": round(total_spent, 2),
            "upcoming_count": upcoming,
        }

    staff_res = await session.exec(select(Staff).where(Staff.user_id == user.id))
    staff = staff_res.first()
    if not staff:
        return {
            "role": "staff",
            "completed_jobs": 0,
            "upcoming_count": 0,
            "rating": None,
        }

    bookings_res = await session.exec(
        select(Booking).where(Booking.staff_id == staff.id)
    )
    all_bookings = bookings_res.all()
    completed_jobs = sum(1 for b in all_bookings if b.status == BookingStatus.completed)
    upcoming_count = sum(
        1
        for b in all_bookings
        if b.status in (BookingStatus.pending, BookingStatus.confirmed)
    )
    return {
        "role": "staff",
        "completed_jobs": completed_jobs,
        "upcoming_count": upcoming_count,
        "rating": float(staff.rating) if staff.rating else None,
    }
