import uuid
from typing import List
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from app.reviews.models import Review
from app.reviews.schemas import ReviewCreate
from app.salons.models import Salon


async def create_review(data: ReviewCreate, author_id: uuid.UUID, session: AsyncSession) -> Review:
    from sqlalchemy import func
    review = Review(**data.model_dump(), author_id=author_id)
    session.add(review)
    await session.flush()  # Ensure the new review is visible in the aggregate query

    # Recalculate salon rating from all reviews
    stmt = select(
        func.avg(Review.rating),
        func.count(Review.id),
    ).where(Review.salon_id == data.salon_id)
    result = await session.exec(stmt)
    row = result.one()
    avg_rating, review_count = row

    statement = select(Salon).where(Salon.id == data.salon_id)
    result = await session.exec(statement)
    salon = result.one()
    salon.rating = round(float(avg_rating), 2) if avg_rating else 0.0
    salon.review_count = review_count or 0

    session.add(salon)
    await session.commit()
    await session.refresh(review)
    return review


async def get_reviews_for_salon(salon_id: uuid.UUID, session: AsyncSession, skip: int = 0, limit: int = 50) -> List[Review]:
    statement = select(Review).where(Review.salon_id == salon_id).order_by(Review.created_at.desc()).offset(skip).limit(limit)
    result = await session.exec(statement)
    return result.all()
