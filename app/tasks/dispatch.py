"""Single entry point for scheduling background work.

Call sites import these ``queue_*`` helpers instead of touching Celery tasks
or background-task implementations directly. The helper picks the right path
based on ``settings.USE_CELERY``:

  * USE_CELERY=True  → ``.delay()`` onto the Redis broker (dev / VPS prod).
  * USE_CELERY=False → FastAPI BackgroundTasks if a ``background_tasks``
                        argument is supplied (request-scoped), otherwise a
                        loop-bound fire-and-forget (e.g. when called from
                        APScheduler's periodic jobs).

Keeping this in one module means we can re-route every queued job through a
real task system later without touching the routes/services that call them.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Awaitable, Callable

from fastapi import BackgroundTasks

from config import settings

logger = logging.getLogger(__name__)


async def _log_failures(coro: Awaitable[Any]) -> None:
    """Wrap a coroutine so background failures land in logs, not the void."""
    try:
        await coro
    except Exception:
        logger.exception("Background task failed")


def _fire_and_forget_async(coro_factory: Callable[[], Awaitable[Any]]) -> None:
    """Schedule an async impl on the currently running loop with no awaiter.

    Used when there's no per-request BackgroundTasks bag — e.g. inside a job
    invoked by APScheduler. Caller MUST be on an asyncio loop.
    """
    loop = asyncio.get_running_loop()
    loop.create_task(_log_failures(coro_factory()))


def _fire_and_forget_sync(fn: Callable[..., Any], *args: Any) -> None:
    """Schedule a sync impl in the default threadpool with no awaiter."""
    loop = asyncio.get_running_loop()
    loop.run_in_executor(None, fn, *args)


# ---------------------------------------------------------------------------
# Email dispatchers
# ---------------------------------------------------------------------------

def queue_verification_email(
    email: str, token: str, *, background_tasks: BackgroundTasks | None = None,
) -> None:
    if settings.USE_CELERY:
        from app.tasks.email_tasks import send_verification_email_task
        send_verification_email_task.delay(email, token)
        return
    from app.tasks.email_tasks import send_verification_email_impl
    if background_tasks is not None:
        background_tasks.add_task(send_verification_email_impl, email, token)
    else:
        _fire_and_forget_async(lambda: send_verification_email_impl(email, token))


def queue_password_reset_email(
    email: str, token: str, *, background_tasks: BackgroundTasks | None = None,
) -> None:
    if settings.USE_CELERY:
        from app.tasks.email_tasks import send_password_reset_email_task
        send_password_reset_email_task.delay(email, token)
        return
    from app.tasks.email_tasks import send_password_reset_email_impl
    if background_tasks is not None:
        background_tasks.add_task(send_password_reset_email_impl, email, token)
    else:
        _fire_and_forget_async(lambda: send_password_reset_email_impl(email, token))


def queue_booking_confirmation(
    client_email: str,
    staff_email: str,
    client_name: str,
    service_name: str,
    time_str: str,
    salon_name: str,
    *,
    background_tasks: BackgroundTasks | None = None,
) -> None:
    if settings.USE_CELERY:
        from app.tasks.email_tasks import send_booking_confirmation_task
        send_booking_confirmation_task.delay(
            client_email, staff_email, client_name,
            service_name, time_str, salon_name,
        )
        return
    from app.tasks.email_tasks import send_booking_confirmation_impl
    args = (client_email, staff_email, client_name,
            service_name, time_str, salon_name)
    if background_tasks is not None:
        background_tasks.add_task(send_booking_confirmation_impl, *args)
    else:
        _fire_and_forget_async(lambda: send_booking_confirmation_impl(*args))


def queue_booking_reminder(
    email: str, time_str: str, *, background_tasks: BackgroundTasks | None = None,
) -> None:
    if settings.USE_CELERY:
        from app.tasks.email_tasks import send_booking_reminder_task
        send_booking_reminder_task.delay(email, time_str)
        return
    from app.tasks.email_tasks import send_booking_reminder_impl
    if background_tasks is not None:
        background_tasks.add_task(send_booking_reminder_impl, email, time_str)
    else:
        _fire_and_forget_async(lambda: send_booking_reminder_impl(email, time_str))


def queue_booking_cancelled(
    client_email: str,
    service_name: str,
    time_str: str,
    salon_name: str,
    cancelled_by: str = "",
    *,
    background_tasks: BackgroundTasks | None = None,
) -> None:
    if settings.USE_CELERY:
        from app.tasks.email_tasks import send_booking_cancelled_task
        send_booking_cancelled_task.delay(
            client_email, service_name, time_str, salon_name, cancelled_by,
        )
        return
    from app.tasks.email_tasks import send_booking_cancelled_impl
    args = (client_email, service_name, time_str, salon_name, cancelled_by)
    if background_tasks is not None:
        background_tasks.add_task(send_booking_cancelled_impl, *args)
    else:
        _fire_and_forget_async(lambda: send_booking_cancelled_impl(*args))


# ---------------------------------------------------------------------------
# Image dispatcher
# ---------------------------------------------------------------------------

def queue_image_upload(
    entity_type: str,
    entity_id: str,
    image_bytes: bytes,
    filename: str,
    *,
    background_tasks: BackgroundTasks | None = None,
) -> None:
    if settings.USE_CELERY:
        from app.tasks.image_tasks import process_image_upload_task
        process_image_upload_task.delay(entity_type, entity_id, image_bytes, filename)
        return
    from app.tasks.image_tasks import process_image_upload_impl
    args = (entity_type, entity_id, image_bytes, filename)
    if background_tasks is not None:
        # add_task on a sync callable goes to the threadpool — Pillow decode
        # won't stall the event loop.
        background_tasks.add_task(process_image_upload_impl, *args)
    else:
        _fire_and_forget_sync(process_image_upload_impl, *args)
