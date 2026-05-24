import asyncio
import logging
from datetime import datetime, timedelta, timezone

from app.celery_app import celery_app
from app.users.models import User
from app.staff.models import Staff
from app.services.models import Service
from app.salons.models import Salon
from app.schedules.models import Schedule
from app.staff_services.models import StaffService
from app.bookings.models import Booking, BookingStatus
from app.reviews.models import Review

from sqlalchemy.orm import selectinload
from sqlmodel import select

logger = logging.getLogger(__name__)


async def _check_and_send_reminders():
    """Check for bookings starting in ~2 hours and send reminders (once per booking)."""
    from app.tasks.dispatch import queue_booking_reminder
    import redis.asyncio as aioredis
    from config import settings

    now = datetime.now(timezone.utc)
    reminder_window_start = now + timedelta(hours=1, minutes=55)
    reminder_window_end = now + timedelta(hours=2, minutes=5)

    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlmodel.ext.asyncio.session import AsyncSession
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import NullPool

    # Disable asyncpg prepared-statement cache when behind pgbouncer.
    _kw = {"statement_cache_size": 0} if settings.DB_PGBOUNCER else {}
    temp_engine = create_async_engine(
        settings.DATABASE_URL, poolclass=NullPool, connect_args=_kw
    )
    async_session = sessionmaker(
        temp_engine, class_=AsyncSession, expire_on_commit=False
    )

    r = aioredis.from_url(settings.effective_redis_url(2), decode_responses=True)

    try:
        async with async_session() as session:
            statement = (
                select(Booking)
                .options(selectinload(Booking.client))
                .where(
                    Booking.start_time >= reminder_window_start,
                    Booking.start_time <= reminder_window_end,
                    Booking.status == BookingStatus.confirmed,
                )
            )
            result = await session.exec(statement)
            bookings = result.all()

            for booking in bookings:
                reminder_key = f"reminder_sent:{booking.id}"
                already_sent = await r.exists(reminder_key)
                if already_sent:
                    continue

                user = booking.client
                if user and user.email:
                    logger.info(
                        f"Sending reminder to {user.email} for booking {booking.id}"
                    )
                    queue_booking_reminder(user.email, str(booking.start_time))
                    await r.setex(reminder_key, 10800, "1")
    finally:
        await r.close()
        await temp_engine.dispose()


@celery_app.task(name="check_upcoming_bookings_task", queue="celery")
def check_upcoming_bookings_task():
    """Endpoint or Schema"""
    asyncio.run(_check_and_send_reminders())


async def _mark_no_shows():
    """Move overdue confirmed bookings to no_show. Lookback capped at 24h."""
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlmodel.ext.asyncio.session import AsyncSession
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import NullPool
    from config import settings

    now = datetime.now(timezone.utc)
    grace = timedelta(minutes=30)
    lookback = timedelta(hours=24)

    # Disable asyncpg prepared-statement cache when behind pgbouncer.
    _kw = {"statement_cache_size": 0} if settings.DB_PGBOUNCER else {}
    temp_engine = create_async_engine(
        settings.DATABASE_URL, poolclass=NullPool, connect_args=_kw
    )
    async_session = sessionmaker(
        temp_engine, class_=AsyncSession, expire_on_commit=False
    )
    try:
        async with async_session() as session:
            stmt = select(Booking).where(
                Booking.status == BookingStatus.confirmed,
                Booking.end_time <= now - grace,
                Booking.end_time >= now - lookback,
            )
            result = await session.exec(stmt)
            stale = result.all()
            if not stale:
                return
            for b in stale:
                b.status = BookingStatus.no_show
                session.add(b)
            await session.commit()
            logger.info("Marked %d bookings as no_show", len(stale))
    finally:
        await temp_engine.dispose()


@celery_app.task(name="mark_no_show_bookings_task", queue="celery")
def mark_no_show_bookings_task():
    """Periodic sweep: confirmed → no_show after end_time + 30 min grace."""
    asyncio.run(_mark_no_shows())


async def _cancel_stale_pending():
    """Cancel pending bookings whose end_time has passed. Processed in batches."""
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlmodel.ext.asyncio.session import AsyncSession
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import NullPool
    from config import settings

    now = datetime.now(timezone.utc)
    grace = timedelta(minutes=30)
    batch = 500

    # Disable asyncpg prepared-statement cache when behind pgbouncer.
    _kw = {"statement_cache_size": 0} if settings.DB_PGBOUNCER else {}
    temp_engine = create_async_engine(
        settings.DATABASE_URL, poolclass=NullPool, connect_args=_kw
    )
    async_session = sessionmaker(
        temp_engine, class_=AsyncSession, expire_on_commit=False
    )
    try:
        async with async_session() as session:
            stmt = (
                select(Booking)
                .where(
                    Booking.status == BookingStatus.pending,
                    Booking.end_time <= now - grace,
                )
                .limit(batch)
            )
            result = await session.exec(stmt)
            stale = result.all()
            if not stale:
                return
            for b in stale:
                b.status = BookingStatus.cancelled
                session.add(b)
            await session.commit()
            logger.info("Cancelled %d stale pending bookings", len(stale))
    finally:
        await temp_engine.dispose()


@celery_app.task(name="cancel_stale_pending_task", queue="celery")
def cancel_stale_pending_task():
    """Periodic sweep: pending → cancelled once end_time + 30 min has passed."""
    asyncio.run(_cancel_stale_pending())
