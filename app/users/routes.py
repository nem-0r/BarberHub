import uuid
from typing import List
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from sqlmodel.ext.asyncio.session import AsyncSession
from database import get_session
from config import settings
from app.dependencies import get_current_user, oauth2_scheme, RoleChecker
from app.users.schemas import UserCreate, UserUpdate, UserRead, UserLogin, GoogleOAuthRequest, ForgotPasswordRequest, ResetPasswordConfirm
import app.users.service as svc
from app.users.auth import create_access_token, create_refresh_token, verify_password, decode_access_token, hash_password, dummy_verify_password
from app.users.redis import block_token, is_token_blocked, mark_reset_token_as_used, is_reset_token_used, invalidate_user_cache
from app.users.models import User, UserRole
from app.exceptions import AuthenticationError
from app.users.auth_verification import generate_verification_token, verify_token, generate_password_reset_token, verify_password_reset_token
from app.tasks.dispatch import (
    queue_verification_email,
    queue_password_reset_email,
    queue_image_upload,
)
from fastapi import UploadFile, File

from app.limiter import limiter
from app.pagination import pagination_params

router = APIRouter(prefix="/users", tags=["Users"])

# RBAC Instances
admin_only = RoleChecker([UserRole.admin])


def _set_refresh_cookie(response: Response, token: str) -> None:
    """httpOnly so JS (and thus XSS) can't read it. SameSite=lax + POST-only
    /refresh limits CSRF. Flags are config-driven (dev http vs prod https)."""
    response.set_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        value=token,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        domain=settings.COOKIE_DOMAIN or None,
        path="/",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        domain=settings.COOKIE_DOMAIN or None,
        path="/",
    )


def _issue_tokens(response: Response, user: User) -> dict:
    """Issue a short-lived access token (JSON body) + long-lived refresh token
    (httpOnly cookie). Single source of truth for login / oauth / refresh."""
    claims = {"sub": str(user.id), "role": user.role.value}
    access_token = create_access_token(data=claims)
    _set_refresh_cookie(response, create_refresh_token(data=claims))
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/", response_model=List[UserRead], dependencies=[Depends(admin_only)])
@limiter.limit("1000/hour")
async def list_users(
    request: Request,
    session: AsyncSession = Depends(get_session),
    pagination: dict = Depends(pagination_params),
):
    return await svc.get_all_users(session, **pagination)


@router.get("/me", response_model=UserRead)
@limiter.limit("1000/hour")
async def get_me(request: Request, current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/me/stats")
@limiter.limit("100/minute")
async def get_my_stats(
    request: Request,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Role-aware stats for the current user."""
    return await svc.get_user_stats(current_user, session)


@router.post("/me/avatar")
@limiter.limit("5/minute")
async def upload_my_avatar(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Endpoint or Schema"""
    image_bytes = await file.read()
    queue_image_upload(
        entity_type="users",
        entity_id=str(current_user.id),
        image_bytes=image_bytes,
        filename=file.filename,
        background_tasks=background_tasks,
    )
    return {"message": "Avatar upload started"}


@router.patch("/me", response_model=UserRead)
@limiter.limit("20/minute;100/hour")
async def update_me(
    request: Request,
    data: UserUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Update the current user's own profile (full_name, phone, avatar_url)."""
    return await svc.update_user(current_user.id, data, session)


@router.get("/{user_id}", response_model=UserRead)
@limiter.limit("1000/hour")
async def get_user(
    request: Request,
    user_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if str(current_user.id) != str(user_id) and current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Not authorized to view this user")
    user = await svc.get_user_by_id(user_id, session)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.post("/", response_model=UserRead, status_code=201)
@limiter.limit("20/minute;100/hour")
async def create_user(
    request: Request,
    data: UserCreate,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
):
    user = await svc.create_user(data, session)

    token = generate_verification_token(user.email)
    queue_verification_email(user.email, token, background_tasks=background_tasks)

    return user


@router.post("/login")
@limiter.limit("20/minute;100/hour")
async def login(request: Request, response: Response, data: UserLogin, session: AsyncSession = Depends(get_session)):
    user = await svc.get_user_by_email(data.email, session)
    # password_hash is NULL for OAuth-only accounts → reject password login for them.
    # Always spend one bcrypt verify (real or dummy) so a missing/passwordless
    # account responds in the same time as a wrong password (no user enumeration).
    if not user or not user.password_hash:
        dummy_verify_password()
        raise AuthenticationError()
    if not verify_password(data.password, user.password_hash):
        raise AuthenticationError()

    if not user.is_verified:
        raise HTTPException(
            status_code=403,
            detail={"code": "EMAIL_NOT_VERIFIED", "message": "Please verify your email address before signing in. Check your inbox for the confirmation link."},
        )

    return _issue_tokens(response, user)


@router.post("/oauth/google")
@limiter.limit("20/minute;100/hour")
async def login_with_google(
    request: Request,
    response: Response,
    data: GoogleOAuthRequest,
    session: AsyncSession = Depends(get_session),
):
    """Sign in / sign up via Google Identity Services.

    Frontend obtains an id_token from GIS (popup or one-tap) and POSTs it here.
    We verify the JWT signature/audience against Google's JWKS, then resolve
    (or create) a local user and issue our own JWT — identical contract to /login.
    """
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google OAuth is not configured")

    # Lazy import keeps google-auth out of the import path of unrelated modules.
    from google.oauth2 import id_token as google_id_token
    from google.auth.transport import requests as google_requests

    # verify_oauth2_token is synchronous and hits Google's JWKS endpoint — wrap
    # in to_thread + wait_for so a slow Google response can't pin the worker.
    import asyncio as _asyncio

    def _verify_blocking() -> dict:
        return google_id_token.verify_oauth2_token(
            data.id_token,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID,
        )

    try:
        payload = await _asyncio.wait_for(
            _asyncio.to_thread(_verify_blocking), timeout=5.0,
        )
    except _asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail="Google identity service is slow to respond — please retry.",
        )
    except ValueError:
        # Covers: bad signature, wrong audience, expired token, malformed JWT.
        raise HTTPException(status_code=401, detail="Invalid Google credential")

    if not payload.get("email_verified"):
        raise HTTPException(status_code=401, detail="Google account email is not verified")

    email = payload.get("email")
    google_sub = payload.get("sub")
    if not email or not google_sub:
        raise HTTPException(status_code=401, detail="Google credential missing required claims")

    try:
        user = await svc.get_or_create_oauth_user(
            email=email,
            google_sub=google_sub,
            full_name=payload.get("name") or "",
            avatar_url=payload.get("picture"),
            session=session,
        )
    except Exception as exc:
        # Most common cause: Google OAuth migrations not applied (password_hash
        # / phone still NOT NULL, or google_sub column missing) → IntegrityError
        # on first-time signup. Log the full reason for ops, but DON'T leak
        # exception text (DB constraint names, paths) to the browser in prod —
        # the rest of the API uses the same generic-error policy via main.py.
        await session.rollback()
        import logging as _logging
        _logging.getLogger("custom_logging").exception(
            "[oauth/google] provisioning failed for sub=%s email=%s",
            payload.get("sub"), payload.get("email"),
        )
        if settings.DEBUG:
            raise HTTPException(
                status_code=500,
                detail=(
                    f"Could not provision Google account: {type(exc).__name__}: {exc}. "
                    "If this is a fresh account, ensure DB migrations are applied "
                    "(alembic upgrade head)."
                ),
            )
        raise HTTPException(status_code=500, detail="Could not provision Google account.")

    return _issue_tokens(response, user)


@router.post("/refresh")
@limiter.limit("60/minute")
async def refresh(request: Request, response: Response, session: AsyncSession = Depends(get_session)):
    """Exchange the httpOnly refresh cookie for a new access token.

    Refresh rotation: the presented refresh token is revoked and a new one is
    set, so a stolen-then-used refresh token is detectable (old jti is blocked)
    and single-use.
    """
    raw = request.cookies.get(settings.REFRESH_COOKIE_NAME)
    if not raw:
        raise HTTPException(status_code=401, detail="Missing refresh token")

    payload = decode_access_token(raw)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    jti = payload.get("jti")
    if jti and await is_token_blocked(jti):
        raise HTTPException(status_code=401, detail="Refresh token has been revoked")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user = await svc.get_user_by_id(uuid.UUID(user_id), session)
    if not user:
        raise HTTPException(status_code=401, detail="User no longer exists")

    # Rotate: revoke the just-used refresh token for its full remaining lifetime.
    if jti:
        await block_token(jti, settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400)

    return _issue_tokens(response, user)


@router.post("/logout")
@limiter.limit("20/minute;100/hour")
async def logout(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    token: str = Depends(oauth2_scheme),
):
    payload = decode_access_token(token)
    if payload and "jti" in payload:
        await block_token(payload["jti"], settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60)

    # Revoke the refresh token too, otherwise logout only kills the 30-min access.
    raw = request.cookies.get(settings.REFRESH_COOKIE_NAME)
    if raw:
        rp = decode_access_token(raw)
        if rp and rp.get("jti"):
            await block_token(rp["jti"], settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400)

    _clear_refresh_cookie(response)
    return {"message": "Successfully logged out"}



@router.patch("/{user_id}", response_model=UserRead)
@limiter.limit("20/minute;100/hour")
async def update_user(
    request: Request,
    user_id: uuid.UUID,
    data: UserUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    # Only allow users to update themselves or admin
    if str(current_user.id) != str(user_id) and current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to update this user")

    return await svc.update_user(user_id, data, session)


@router.delete("/{user_id}", status_code=204, dependencies=[Depends(admin_only)])
@limiter.limit("20/minute;100/hour")
async def delete_user(request: Request, user_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    await svc.delete_user(user_id, session)


@router.get("/verify/{token}")
async def verify_email(token: str, session: AsyncSession = Depends(get_session)):
    email = verify_token(token)
    if not email:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    
    user = await svc.get_user_by_email(email, session)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.is_verified:
        return {"message": "Email already verified"}

    user.is_verified = True
    session.add(user)
    await session.commit()
    await invalidate_user_cache(user.id)

    return {"message": "Email successfully verified! You can now log in."}


@router.post("/forgot-password", status_code=200)
@limiter.limit("5/minute;20/hour")
async def forgot_password(
    request: Request,
    data: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
):
    """Endpoint or Schema"""
    user = await svc.get_user_by_email(data.email, session)
    if user:
        token = generate_password_reset_token(user.email)
        queue_password_reset_email(user.email, token, background_tasks=background_tasks)
    return {"message": "If this email is registered, a password reset link has been sent."}


@router.post("/reset-password/{token}", status_code=200)
@limiter.limit("10/minute")
async def reset_password(
    request: Request,
    token: str,
    data: ResetPasswordConfirm,
    session: AsyncSession = Depends(get_session)
):
    """Resets password using token."""
    email = verify_password_reset_token(token)
    if not email:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    if await is_reset_token_used(token):
        raise HTTPException(status_code=400, detail="This reset link has already been used")

    user = await svc.get_user_by_email(email, session)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.password_hash = hash_password(data.new_password)
    session.add(user)
    await session.commit()
    await invalidate_user_cache(user.id)

    await mark_reset_token_as_used(token)

    return {"message": "Password successfully reset. You can now log in with your new password."}

