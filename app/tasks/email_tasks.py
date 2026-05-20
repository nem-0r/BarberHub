"""Email-sending tasks.

Each task is exposed in two shapes:

  * a plain async ``_impl`` coroutine (e.g. ``send_verification_email_impl``)
    used by FastAPI BackgroundTasks when settings.USE_CELERY=False;
  * a Celery task that wraps the coroutine via ``asyncio.run`` for the
    docker-compose Celery+Redis worker.

Call sites should NOT hit either directly — go through
``app.tasks.dispatch.queue_*`` which picks the right path based on
settings.USE_CELERY.
"""
import asyncio
import builtins
import logging
from pathlib import Path
from pydantic import SecretStr

try:
    builtins.SecretStr = SecretStr
except Exception:
    pass

from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType
from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.celery_app import celery_app
from config import settings

logger = logging.getLogger(__name__)

conf = ConnectionConfig(
    MAIL_USERNAME=settings.MAIL_USERNAME,
    MAIL_PASSWORD=settings.MAIL_PASSWORD,
    MAIL_FROM=settings.MAIL_FROM,
    MAIL_PORT=settings.MAIL_PORT,
    MAIL_SERVER=settings.MAIL_SERVER,
    MAIL_FROM_NAME=settings.MAIL_FROM_NAME,
    MAIL_STARTTLS=True,
    MAIL_SSL_TLS=False,
    USE_CREDENTIALS=True,
    VALIDATE_CERTS=True,
)

# Module-level Jinja env so templates load+compile once per worker, not per task.
# autoescape protects against accidental injection if a value (e.g. salon_name)
# contains user-controlled HTML.
_TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates" / "email"
_jinja_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATES_DIR)),
    autoescape=select_autoescape(["html", "xml"]),
)


def _render(template_name: str, **context) -> str:
    return _jinja_env.get_template(template_name).render(**context)


async def _send_mail_async(email: str, subject: str, body: str):
    """Send a single HTML email through Brevo SMTP."""
    message = MessageSchema(
        subject=subject,
        recipients=[email],
        body=body,
        subtype=MessageType.html,
    )
    fm = FastMail(conf)
    try:
        logger.info("Sending email to %s (subject=%s)", email, subject)
        await fm.send_message(message)
        logger.info("Email sent successfully to %s", email)
    except Exception:
        logger.exception("Failed to send email to %s", email)
        raise


# ---------------------------------------------------------------------------
# Pure async implementations — safe to call directly from
# FastAPI BackgroundTasks.add_task() on the free-tier deploy.
# ---------------------------------------------------------------------------

async def send_verification_email_impl(email: str, token: str) -> None:
    verify_url = f"{settings.FRONTEND_URL}/verify?token={token}"
    body = _render("verification.html", verify_url=verify_url)
    await _send_mail_async(email, "Verify your BarberHub account", body)


async def send_password_reset_email_impl(email: str, token: str) -> None:
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    body = _render("password_reset.html", reset_url=reset_url)
    await _send_mail_async(email, "Reset your BarberHub password", body)


async def send_booking_confirmation_impl(
    client_email: str,
    staff_email: str,
    client_name: str,
    service_name: str,
    time_str: str,
    salon_name: str,
) -> None:
    client_body = _render(
        "booking_confirmation_client.html",
        salon_name=salon_name,
        service_name=service_name,
        time_str=time_str,
    )
    staff_body = _render(
        "booking_confirmation_staff.html",
        client_name=client_name,
        service_name=service_name,
        time_str=time_str,
    )
    await _send_mail_async(
        client_email, f"Booking confirmed at {salon_name}", client_body
    )
    if staff_email:
        await _send_mail_async(
            staff_email, f"New booking from {client_name}", staff_body
        )


async def send_booking_reminder_impl(email: str, time_str: str) -> None:
    body = _render("booking_reminder.html", time_str=time_str)
    await _send_mail_async(email, "Booking Reminder", body)


async def send_booking_cancelled_impl(
    client_email: str,
    service_name: str,
    time_str: str,
    salon_name: str,
    cancelled_by: str = "",
) -> None:
    body = _render(
        "booking_cancelled.html",
        salon_name=salon_name,
        service_name=service_name,
        time_str=time_str,
        cancelled_by=cancelled_by,
    )
    await _send_mail_async(
        client_email, f"Booking cancelled at {salon_name}", body
    )


# ---------------------------------------------------------------------------
# Celery wrappers — each is a thin sync shim that runs the impl in a fresh
# event loop. The worker container picks these up via celery_app.include.
# ---------------------------------------------------------------------------

@celery_app.task(
    name="send_verification_email_task",
    queue="email_queue",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def send_verification_email_task(self, email: str, token: str):
    try:
        asyncio.run(send_verification_email_impl(email, token))
    except Exception as exc:
        raise self.retry(exc=exc)


@celery_app.task(
    name="send_password_reset_email_task",
    queue="email_queue",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def send_password_reset_email_task(self, email: str, token: str):
    try:
        asyncio.run(send_password_reset_email_impl(email, token))
    except Exception as exc:
        raise self.retry(exc=exc)


@celery_app.task(
    name="send_booking_confirmation_task",
    queue="email_queue",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def send_booking_confirmation_task(
    self,
    client_email: str,
    staff_email: str,
    client_name: str,
    service_name: str,
    time_str: str,
    salon_name: str,
):
    try:
        asyncio.run(
            send_booking_confirmation_impl(
                client_email, staff_email, client_name,
                service_name, time_str, salon_name,
            )
        )
    except Exception as exc:
        raise self.retry(exc=exc)


@celery_app.task(
    name="send_booking_reminder_task",
    queue="email_queue",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def send_booking_reminder_task(self, email: str, time_str: str):
    try:
        asyncio.run(send_booking_reminder_impl(email, time_str))
    except Exception as exc:
        raise self.retry(exc=exc)


@celery_app.task(
    name="send_booking_cancelled_task",
    queue="email_queue",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def send_booking_cancelled_task(
    self,
    client_email: str,
    service_name: str,
    time_str: str,
    salon_name: str,
    cancelled_by: str = "",
):
    try:
        asyncio.run(
            send_booking_cancelled_impl(
                client_email, service_name, time_str, salon_name, cancelled_by,
            )
        )
    except Exception as exc:
        raise self.retry(exc=exc)
