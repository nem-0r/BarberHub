import uuid
from typing import List
from fastapi import APIRouter, Depends, Request
from sqlmodel.ext.asyncio.session import AsyncSession
from database import get_session
from app.reviews.schemas import ReviewCreate, ReviewRead
import app.reviews.service as svc
from app.dependencies import get_current_user
from app.users.models import User
from app.limiter import limiter
from app.pagination import pagination_params

router = APIRouter(prefix="/reviews", tags=["Reviews"])


@router.post("/", response_model=ReviewRead, status_code=201)
@limiter.limit("5/minute;50/day")
async def create_review(
    request: Request,
    data: ReviewCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    return await svc.create_review(data, current_user.id, session)


@router.get("/salon/{salon_id}", response_model=List[ReviewRead])
async def get_salon_reviews(
    salon_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    pagination: dict = Depends(pagination_params),
):
    return await svc.get_reviews_for_salon(salon_id, session, **pagination)
