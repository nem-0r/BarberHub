import logging
import redis.asyncio as redis
from config import settings

logger = logging.getLogger(__name__)

redis_client = redis.Redis(
    host=settings.REDIS_HOST,
    port=settings.REDIS_PORT,
    db=0,
    decode_responses=True
)

async def block_token(jti: str, expire_seconds: int):
    """
    Blocks a token by adding its JTI to Redis.
    Fails gracefully if Redis is not available.
    """
    try:
        await redis_client.setex(f"token:{jti}", expire_seconds, "blocked")
    except Exception as e:
        logger.warning(f"Failed to block token in Redis: {e}. Logout might not be permanent.")

async def is_token_blocked(jti: str) -> bool:
    """
    Checks if a token JTI is in the Redis blocklist.
    Returns False if Redis is not available.
    """
    try:
        return await redis_client.exists(f"token:{jti}") > 0
    except Exception as e:
        logger.warning(f"Redis connection error: {e}. Skipping token blocklist check.")
        return False


import hashlib

def _hash_token(token: str) -> str:
    """Хешируем токен, чтобы не хранить в Redis его "тело" в открытом виде."""
    return hashlib.sha256(token.encode()).hexdigest()

async def mark_reset_token_as_used(token: str, expire_seconds: int = 3600):
    """Endpoint or Schema"""
    try:
        await redis_client.setex(f"reset_token:{_hash_token(token)}", expire_seconds, "used")
    except Exception as e:
        logger.warning(f"Redis error marking reset token: {e}")

async def is_reset_token_used(token: str) -> bool:
    """Endpoint or Schema"""
    try:
        return await redis_client.exists(f"reset_token:{_hash_token(token)}") > 0
    except Exception as e:
        logger.warning(f"Redis error checking reset token: {e}. Allowing request.")
        return False
