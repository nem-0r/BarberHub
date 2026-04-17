from itsdangerous import URLSafeTimedSerializer
from typing import Optional
from config import settings

serializer = URLSafeTimedSerializer(settings.SECRET_KEY)

def generate_verification_token(email: str) -> str:
    """Generates verification token (24h)."""
    return serializer.dumps(email, salt="email-verification")

def verify_token(token: str, expiration: int = 86400) -> str:
    """Verifies email token."""
    try:
        email = serializer.loads(
            token,
            salt="email-verification",
            max_age=expiration
        )
        return email
    except Exception:
        return None


def generate_password_reset_token(email: str) -> str:
    """Endpoint or Schema"""
    return serializer.dumps(email, salt="password-reset")

def verify_password_reset_token(token: str, expiration: int = 3600) -> Optional[str]:
    """Endpoint or Schema"""
    try:
        email = serializer.loads(
            token,
            salt="password-reset",
            max_age=expiration
        )
        return email
    except Exception:
        return None
