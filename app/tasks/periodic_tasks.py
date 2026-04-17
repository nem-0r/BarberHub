import asyncio
from datetime import datetime, timedelta
from celery.utils.log import get_task_logger

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

logger = get_task_logger(__name__)

async def _check_and_send_reminders():
    """Endpoint or Schema"""
    from app.tasks.email_tasks import send_booking_reminder_task
    
    now = datetime.utcnow()
    reminder_window_start = now + timedelta(hours=1, minutes=55)
    reminder_window_end = now + timedelta(hours=2, minutes=5)
    
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlmodel.ext.asyncio.session import AsyncSession
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import NullPool
    from config import settings

    temp_engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    async_session = sessionmaker(temp_engine, class_=AsyncSession, expire_on_commit=False)
    
    try:
        async with async_session() as session:
            statement = select(Booking).options(
                selectinload(Booking.client)
            ).where(
                Booking.start_time >= reminder_window_start,
                Booking.start_time <= reminder_window_end,
                Booking.status == BookingStatus.confirmed
            )
            result = await session.exec(statement)
            bookings = result.all()
            
            for booking in bookings:
                user = booking.client
                if user and user.email:
                    logger.info(f"Sending reminder to {user.email} for booking {booking.id}")
                    send_booking_reminder_task.delay(user.email, str(booking.start_time))
    finally:
        await temp_engine.dispose()

@celery_app.task(name="check_upcoming_bookings_task", queue="celery")
def check_upcoming_bookings_task():
    """Endpoint or Schema"""
    asyncio.run(_check_and_send_reminders())
