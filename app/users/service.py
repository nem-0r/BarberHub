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


async def get_all_users(session: AsyncSession, skip: int = 0, limit: int = 50) -> List[User]:
    result = await session.exec(select(User).offset(skip).limit(limit))
    return result.all()


async def get_user_by_id(user_id: uuid.UUID, session: AsyncSession) -> Optional[User]:
    return await session.get(User, user_id)


async def get_user_by_email(email: str, session: AsyncSession) -> Optional[User]:
    # Case-insensitive lookup — `Foo@Bar.com` should resolve to the same row
    # as `foo@bar.com`. Pairs with `create_user` / `get_or_create_oauth_user`
    # which both normalize the stored value to lower-case. Historic rows
    # written before this normalization can still be migrated by hand if
    # needed (`UPDATE users SET email = lower(email)`).
    normalized = email.strip().lower()
    result = await session.exec(select(User).where(User.email == normalized))
    return result.first()


async def resend_verification_email(
    email: str,
    session: AsyncSession,
    background_tasks: BackgroundTasks,
) -> None:
    """Re-issue an email-verification link for an unverified password account.

    Silent no-op (does NOT raise) for every reason a real account couldn't or
    shouldn't receive one — non-existent email, already verified, OAuth-only
    account, Redis throttle hit. This prevents user-enumeration: the route
    always returns the same generic 200 response regardless of state.

    Per-email throttle is enforced via Redis ``SET NX EX 60``, so a known
    target email can't be spammed even by an attacker rotating IPs (which
    bypasses slowapi's IP-level limit).
    """
    normalized = email.strip().lower()
    throttle_key = f"resend_throttle:{normalized}"
    try:
        # nx=True → only sets if missing → returns None/False if already there.
        was_set = await redis_client.set(throttle_key, "1", nx=True, ex=60)
        if not was_set:
            logger.info("Resend verification throttled (60s) for %s", normalized)
            return
    except Exception:
        # Redis outage shouldn't block legitimate resends — IP rate limit on
        # the route still applies as defense-in-depth.
        logger.warning("Redis throttle check failed for resend; proceeding without throttle.")

    user = await get_user_by_email(email, session)
    if user is None:
        logger.info("Resend requested for non-existent email (silent no-op)")
        return
    if user.is_verified:
        logger.info("Resend requested for already-verified user id=%s (silent no-op)", user.id)
        return
    if not user.password_hash:
        # OAuth-only account — Google already verified the email, no point
        # sending a password-account verification link they can't use.
        logger.info("Resend requested for OAuth-only user id=%s (silent no-op)", user.id)
        return

    # Lazy imports avoid circulars (dispatch → email_tasks → celery_app …).
    from app.users.auth_verification import generate_verification_token
    from app.tasks.dispatch import queue_verification_email

    token = generate_verification_token(user.email)
    queue_verification_email(user.email, token, background_tasks=background_tasks)
    logger.info("Verification email queued for user id=%s", user.id)


async def create_user(data: UserCreate, session: AsyncSession) -> User:
    # Check BEFORE INSERT — otherwise a duplicate email surfaces as a raw
    # asyncpg IntegrityError which the unhandled-exception path turns into a
    # 500 with no useful message for the frontend. Covers the case where the
    # user already exists from a prior Google OAuth sign-in.
    existing = await get_user_by_email(data.email, session)
    if existing:
        raise EmailAlreadyExistsError()

    user_data = data.model_dump()
    user_data["email"] = user_data["email"].strip().lower()  # normalize for case-insensitive lookups
    user_data["password_hash"] = hash_password(user_data.pop("password"))
    user_data["role"] = UserRole.client  # Always force client role on registration
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
    """Resolve a user from a Google id_token payload.

    Order:
      1. Match by google_sub → existing linked account.
      2. Match by email → link this Google sub to the existing email account and
         mark verified. This is the path that lets a user who originally signed up
         with email + password (and verified by link) sign in via Google with the
         same Gmail and land on the same record.
      3. No match → create a fresh OAuth-only account (no password_hash, no phone;
         phone is collected later on first booking).
    """
    # Normalize Google-provided email — match the same lower-case convention
    # the password-account flow uses, so a Google sign-in for `Foo@Bar.com`
    # still finds the existing password account stored as `foo@bar.com`.
    email = (email or "").strip().lower()

    # 1) by google_sub
    result = await session.exec(select(User).where(User.google_sub == google_sub))
    user = result.first()
    if user:
        return user

    # 2) by email — account linking
    result = await session.exec(select(User).where(User.email == email))
    user = result.first()
    if user:
        if not user.is_verified:
            # The email account exists but ownership was NEVER proven (no email-link
            # verification). This is the account-squatting vector: an attacker
            # registers victim@gmail.com with their own password, never verifies,
            # then waits for the real owner to sign in with Google. Google HAS
            # proven the caller owns this email, so the caller is authoritative —
            # neutralize the squatter-set password so it can't be used to log in.
            user.password_hash = None
        user.google_sub = google_sub
        user.is_verified = True  # Google already verified the email
        if not user.avatar_url and avatar_url:
            user.avatar_url = avatar_url
        session.add(user)
        await session.commit()
        await session.refresh(user)
        await invalidate_user_cache(user.id)
        return user

    # 3) brand new OAuth-only account
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


async def update_user(user_id: uuid.UUID, data: UserUpdate, session: AsyncSession) -> User:
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
    """Role-aware aggregates for the /users/me/stats endpoint.

    For client/owner: counts and spend from bookings the user made.
    For staff: counts and rating from bookings assigned to their staff record.
    """
    # Local imports keep this service free of circular imports between
    # users <-> bookings <-> staff at module load time.
    from app.bookings.models import Booking, BookingStatus
    from app.staff.models import Staff

    if user.role in (UserRole.client, UserRole.owner):
        result = await session.exec(
            select(Booking).where(Booking.client_id == user.id)
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
            "role": user.role.value,
            "total_bookings": len(all_bookings),
            "total_spent": round(total_spent, 2),
            "upcoming_count": upcoming,
        }

    # staff
    staff_res = await session.exec(select(Staff).where(Staff.user_id == user.id))
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
