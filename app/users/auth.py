import logging
from passlib.context import CryptContext
from datetime import datetime, timedelta, timezone
import uuid
from typing import Optional
from jose import jwt, JWTError
from config import settings

logger = logging.getLogger(__name__)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


# Precomputed hash used for constant-time dummy verification (timing-attack mitigation).
_DUMMY_PASSWORD_HASH = pwd_context.hash("timing-attack-equalizer")


def dummy_verify_password() -> None:
    """Constant-time bcrypt verify to prevent user enumeration via timing."""
    pwd_context.verify("timing-attack-equalizer", _DUMMY_PASSWORD_HASH)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    to_encode.update({"exp": expire, "jti": str(uuid.uuid4()), "type": "access"})
    encoded_jwt = jwt.encode(
        to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM
    )
    return encoded_jwt


def create_refresh_token(data: dict) -> str:
    """Create a long-lived refresh token with a unique jti for revocation."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    to_encode.update({"exp": expire, "jti": str(uuid.uuid4()), "type": "refresh"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str):
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        return payload
    except JWTError as exc:
        logger.debug("JWT decode failed: %s", type(exc).__name__)
        return None
