import uuid
from typing import List
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from app.reviews.models import Review
from app.reviews.schemas import ReviewCreate
from app.salons.models import Salon


async def create_review(data: ReviewCreate, author_id: uuid.UUID, session: AsyncSession) -> Review:
    review = Review(**data.model_dump(), author_id=author_id)
    session.add(review)
    
    # Update salon aggregate rating
    statement = select(Salon).where(Salon.id == data.salon_id)
    result = await session.exec(statement)
    salon = result.one()
    
    # Simple incremental update (could be improved with a trigger or periodic task)
    total_rating = (salon.rating or 0) * salon.review_count
    salon.review_count += 1
    salon.rating = (total_rating + data.rating) / salon.review_count
    
    session.add(salon)
    await session.commit()
    await session.refresh(review)
    return review


async def get_reviews_for_salon(salon_id: uuid.UUID, session: AsyncSession) -> List[Review]:
    statement = select(Review).where(Review.salon_id == salon_id).order_by(Review.created_at.desc())
    result = await session.exec(statement)
    return result.all()
