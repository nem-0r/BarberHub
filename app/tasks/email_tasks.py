import asyncio
import builtins
import logging
from pydantic import SecretStr

try:
    builtins.SecretStr = SecretStr
except Exception:
    pass

from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType
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

async def _send_mail_async(email: str, subject: str, body: str):
    """Endpoint or Schema"""
    message = MessageSchema(
        subject=subject,
        recipients=[email],
        body=body,
        subtype=MessageType.html
    )
    fm = FastMail(conf)
    try:
        print(f"[MAIL LOG] Starting to send email to {email}...", flush=True)
        await fm.send_message(message)
        print(f"[MAIL LOG] Email sent successfully to {email}", flush=True)
    except Exception as e:
        print(f"[MAIL ERROR] Failed to send email to {email}: {str(e)}", flush=True)
        raise e

@celery_app.task(name="send_verification_email_task", queue="email_queue")
def send_verification_email_task(email: str, token: str):
    """Endpoint or Schema"""
    verify_url = f"{settings.FRONTEND_URL}/verify?token={token}"
    body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; background:#0f0f0f; color:#f5f5f5; padding:40px;">
      <div style="max-width:540px;margin:0 auto;background:#1a1a1a;border-radius:16px;padding:40px;border:1px solid #2a2a2a;">
        <div style="text-align:center;margin-bottom:32px;">
          <span style="font-size:28px;font-weight:900;letter-spacing:-1px;">
            Barber<span style="color:#e8b84b;">Hub</span>
          </span>
        </div>
        <h2 style="color:#f5f5f5;margin-bottom:12px;">Verify your email ✉️</h2>
        <p style="color:#999;line-height:1.6;">Click the button below to confirm your email address and complete your registration.</p>
        <div style="text-align:center;margin:32px 0;">
          <a href="{verify_url}" style="background:#e8b84b;color:#0f0f0f;padding:14px 32px;border-radius:10px;font-weight:700;font-size:16px;text-decoration:none;display:inline-block;">
            Verify Email Address
          </a>
        </div>
        <p style="color:#666;font-size:13px;">If you didn't create a BarberHub account, you can safely ignore this email.</p>
        <hr style="border:none;border-top:1px solid #2a2a2a;margin:24px 0;" />
        <p style="color:#555;font-size:12px;text-align:center;">© 2026 BarberHub. All rights reserved.</p>
      </div>
    </body>
    </html>
    """
    asyncio.run(_send_mail_async(email, "Verify your BarberHub account", body))

@celery_app.task(name="send_password_reset_email_task", queue="email_queue")
def send_password_reset_email_task(email: str, token: str):
    """Endpoint or Schema"""
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; background:#0f0f0f; color:#f5f5f5; padding:40px;">
      <div style="max-width:540px;margin:0 auto;background:#1a1a1a;border-radius:16px;padding:40px;border:1px solid #2a2a2a;">
        <div style="text-align:center;margin-bottom:32px;">
          <span style="font-size:28px;font-weight:900;letter-spacing:-1px;">
            Barber<span style="color:#e8b84b;">Hub</span>
          </span>
        </div>
        <h2 style="color:#f5f5f5;margin-bottom:12px;">Reset your password 🔐</h2>
        <p style="color:#999;line-height:1.6;">We received a request to reset your password. Click the button below to choose a new one. This link will expire in 1 hour.</p>
        <div style="text-align:center;margin:32px 0;">
          <a href="{reset_url}" style="background:#e8b84b;color:#0f0f0f;padding:14px 32px;border-radius:10px;font-weight:700;font-size:16px;text-decoration:none;display:inline-block;">
            Reset Password
          </a>
        </div>
        <p style="color:#666;font-size:13px;">If you didn't request this, you can safely ignore this email. Your password will remain unchanged.</p>
        <hr style="border:none;border-top:1px solid #2a2a2a;margin:24px 0;" />
        <p style="color:#555;font-size:12px;text-align:center;">© 2026 BarberHub. All rights reserved.</p>
      </div>
    </body>
    </html>
    """
    asyncio.run(_send_mail_async(email, "Reset your BarberHub password", body))

@celery_app.task(name="send_booking_reminder_task", queue="email_queue")
def send_booking_reminder_task(email: str, time_str: str):
    """Endpoint or Schema"""
    body = f"""
    <html>
        <body>
            <h3>Upcoming Appointment Reminder</h3>
            <p>Friendly reminder: You have a booking in 2 hours at <b>{time_str}</b>.</p>
            <p>See you soon!</p>
        </body>
    </html>
    """
    asyncio.run(_send_mail_async(email, "Booking Reminder", body))
