import io
import uuid
import asyncio
import logging
from PIL import Image
from supabase import create_client, Client
from app.celery_app import celery_app
from config import settings
from sqlmodel import select
from app.salons.models import Salon
from app.staff.models import Staff

logger = logging.getLogger(__name__)

supabase: Client = None
if settings.SUPABASE_URL and settings.SUPABASE_KEY:
    supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

@celery_app.task(name="process_image_upload_task", queue="image_queue")
def process_image_upload_task(entity_type: str, entity_id: str, image_bytes: bytes, filename: str):
    """Endpoint or Schema"""
    if not supabase:
        logger.error("Supabase client is not initialized. Check URL/KEY.")
        return

    # Helper async function to update DB — creates a fresh engine to avoid
    # asyncpg pool conflicts with the Celery worker's event loop.
    async def _update_db_image_url(e_type: str, e_id: str, url: str):
        from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
        from sqlmodel.ext.asyncio.session import AsyncSession as _AsyncSession
        _engine = create_async_engine(settings.DATABASE_URL, echo=False)
        _Session = async_sessionmaker(bind=_engine, class_=_AsyncSession, expire_on_commit=False)
        try:
            async with _Session() as session:
                try:
                    if e_type == "salons":
                        statement = select(Salon).where(Salon.id == uuid.UUID(e_id))
                        result = await session.exec(statement)
                        entity = result.first()
                        if entity:
                            entity.image_url = url
                            session.add(entity)
                            await session.commit()
                            logger.info(f"Updated salon {e_id} image_url to {url}")
                    elif e_type == "staff":
                        statement = select(Staff).where(Staff.id == uuid.UUID(e_id))
                        result = await session.exec(statement)
                        entity = result.first()
                        if entity:
                            entity.image_url = url
                            session.add(entity)
                            await session.commit()
                            logger.info(f"Updated staff {e_id} image_url to {url}")
                    elif e_type == "users":
                        from app.users.models import User
                        statement = select(User).where(User.id == uuid.UUID(e_id))
                        result = await session.exec(statement)
                        entity = result.first()
                        if entity:
                            entity.avatar_url = url
                            session.add(entity)
                            await session.commit()
                            logger.info(f"Updated user {e_id} avatar_url to {url}")
                except Exception as e:
                    logger.error(f"Failed to update database for {e_type} {e_id}: {e}")
        finally:
            await _engine.dispose()

    original_size = len(image_bytes)
    img = Image.open(io.BytesIO(image_bytes))
    
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
        
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=70, optimize=True)
    compressed_bytes = buffer.getvalue()
    compressed_size = len(compressed_bytes)

    print(f"Image {filename}: Original size: {original_size} bytes -> Compressed size: {compressed_size} bytes")

    # Fixed path per entity so re-uploads overwrite the previous file (no accumulation).
    if entity_type == "users":
        storage_path = f"users/{entity_id}/avatar.jpg"
    elif entity_type == "salons":
        storage_path = f"salons/{entity_id}/cover.jpg"
    elif entity_type == "staff":
        storage_path = f"staff/{entity_id}/avatar.jpg"
    else:
        storage_path = f"{entity_type}/{entity_id}/image.jpg"

    try:
        supabase.storage.from_(settings.SUPABASE_BUCKET).upload(
            path=storage_path,
            file=compressed_bytes,
            file_options={"content-type": "image/jpeg", "upsert": "true"}
        )
        
        image_url = supabase.storage.from_(settings.SUPABASE_BUCKET).get_public_url(storage_path)
        
        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(_update_db_image_url(entity_type, entity_id, image_url))
        finally:
            loop.close()
        print(f"Image uploaded to: {image_url}")
        
    except Exception as e:
        logger.error(f"Failed to upload image to Supabase: {e}")
        return
