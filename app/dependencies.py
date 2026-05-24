import uuid
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlmodel.ext.asyncio.session import AsyncSession
from database import get_session
from app.users.auth import decode_access_token
from app.users.service import get_user_by_id
from app.users.models import User, UserRole
from app.users.redis import (
    is_token_blocked,
    get_cached_user,
    cache_user,
    build_user_from_cache,
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/users/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme), session: AsyncSession = Depends(get_session)
) -> User:
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )

    # Reject refresh tokens on non-refresh endpoints.
    if payload.get("type") == "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Cannot use a refresh token to access this resource",
        )

    jti = payload.get("jti")
    if jti and await is_token_blocked(jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    user_uuid = uuid.UUID(user_id)

    # Redis cache (TTL 60s) avoids a DB hit on every authorized request.
    cached = await get_cached_user(user_uuid)
    if cached is not None:
        return build_user_from_cache(cached)

    user = await get_user_by_id(user_uuid, session)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token refers to a user that no longer exists",
        )

    await cache_user(user)
    return user


class RoleChecker:
    def __init__(self, allowed_roles: list[UserRole]):
        self.allowed_roles = allowed_roles

    def __call__(self, user: User = Depends(get_current_user)):
        if not user.is_verified:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account is not verified. Please check your email.",
            )
        if user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have enough permissions",
            )
        return user
