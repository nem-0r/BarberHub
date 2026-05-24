import json
import logging
import uuid
from datetime import datetime
from typing import Optional

import redis.asyncio as redis
from config import settings

logger = logging.getLogger(__name__)

redis_client = redis.from_url(
    settings.effective_redis_url(1),
    decode_responses=True,
)

USER_CACHE_TTL = 60


def _user_cache_key(user_id) -> str:
    return f"user:{user_id}"


async def cache_user(user) -> None:
    """Cache a User ORM object as JSON. password_hash is excluded intentionally."""
    try:
        payload = {
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "phone": user.phone,
            "role": user.role.value if hasattr(user.role, "value") else str(user.role),
            "is_verified": bool(user.is_verified),
            "avatar_url": user.avatar_url,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        }
        await redis_client.setex(
            _user_cache_key(user.id), USER_CACHE_TTL, json.dumps(payload)
        )
    except Exception as e:
        logger.warning(f"Failed to cache user in Redis: {e}")


async def get_cached_user(user_id) -> Optional[dict]:
    """Return cached user dict, or None on miss / Redis error."""
    try:
        raw = await redis_client.get(_user_cache_key(user_id))
        if not raw:
            return None
        return json.loads(raw)
    except Exception as e:
        logger.warning(f"Redis error reading user cache: {e}")
        return None


async def invalidate_user_cache(user_id) -> None:
    try:
        await redis_client.delete(_user_cache_key(user_id))
    except Exception as e:
        logger.warning(f"Redis error invalidating user cache: {e}")


def build_user_from_cache(data: dict):
    """Reconstruct a detached User instance from cached JSON."""
    from app.users.models import User, UserRole

    return User(
        id=uuid.UUID(data["id"]),
        email=data["email"],
        full_name=data["full_name"],
        phone=data["phone"],
        role=UserRole(data["role"]),
        is_verified=data["is_verified"],
        avatar_url=data.get("avatar_url"),
        created_at=datetime.fromisoformat(data["created_at"])
        if data.get("created_at")
        else None,
    )


async def block_token(jti: str, expire_seconds: int):
    """Add token JTI to the Redis blocklist."""
    try:
        await redis_client.setex(f"token:{jti}", expire_seconds, "blocked")
    except Exception as e:
        logger.warning(
            f"Failed to block token in Redis: {e}. Logout might not be permanent."
        )


async def is_token_blocked(jti: str) -> bool:
    """Return True if the JTI is in the blocklist."""
    try:
        return await redis_client.exists(f"token:{jti}") > 0
    except Exception as e:
        logger.warning(f"Redis connection error: {e}. Skipping token blocklist check.")
        return False


import hashlib


def _hash_token(token: str) -> str:
    """SHA-256 hash of token to avoid storing raw value in Redis."""
    return hashlib.sha256(token.encode()).hexdigest()


async def mark_reset_token_as_used(token: str, expire_seconds: int = 3600):
    try:
        await redis_client.setex(
            f"reset_token:{_hash_token(token)}", expire_seconds, "used"
        )
    except Exception as e:
        logger.warning(f"Redis error marking reset token: {e}")


async def is_reset_token_used(token: str) -> bool:
    try:
        return await redis_client.exists(f"reset_token:{_hash_token(token)}") > 0
    except Exception as e:
        logger.warning(f"Redis error checking reset token: {e}. Allowing request.")
        return False
