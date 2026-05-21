import uuid
from typing import Any, Dict, List, Optional
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from app.users.models import User, UserRole
from app.users.schemas import UserCreate, UserUpdate
from app.users.auth import hash_password
from app.users.redis import invalidate_user_cache
from app.exceptions import UserNotFoundError, EmailAlreadyExistsError


async def get_all_users(session: AsyncSession, skip: int = 0, limit: int = 50) -> List[User]:
    result = await session.exec(select(User).offset(skip).limit(limit))
    return result.all()


async def get_user_by_id(user_id: uuid.UUID, session: AsyncSession) -> Optional[User]:
    return await session.get(User, user_id)


async def get_user_by_email(email: str, session: AsyncSession) -> Optional[User]:
    result = await session.exec(select(User).where(User.email == email))
    return result.first()


async def create_user(data: UserCreate, session: AsyncSession) -> User:
    # Check BEFORE INSERT — otherwise a duplicate email surfaces as a raw
    # asyncpg IntegrityError which the unhandled-exception path turns into a
    # 500 with no useful message for the frontend. Covers the case where the
    # user already exists from a prior Google OAuth sign-in.
    existing = await get_user_by_email(data.email, session)
    if existing:
        raise EmailAlreadyExistsError()

    user_data = data.model_dump()
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
