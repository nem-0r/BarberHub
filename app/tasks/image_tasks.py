"""Image processing and upload tasks. Dispatch via queue_image_upload."""

import io
import uuid
import asyncio
import logging
from PIL import Image, UnidentifiedImageError
from supabase import create_client, Client
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.celery_app import celery_app
from config import settings
from app.salons.models import Salon
from app.staff.models import Staff

logger = logging.getLogger(__name__)

# Decompression-bomb guard: ~50 megapixels.
Image.MAX_IMAGE_PIXELS = 50_000_000

MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # 8 MB hard cap on raw upload
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}

supabase: Client = None
if settings.SUPABASE_URL and settings.SUPABASE_KEY:
    supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)


# NullPool: Celery spawns a new event loop per task; asyncpg pools are loop-bound.
# Disable prepared-statement cache when behind pgbouncer (mirrors database.py).
_engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    poolclass=NullPool,
    connect_args=({"statement_cache_size": 0} if settings.DB_PGBOUNCER else {}),
)
_AsyncSessionFactory = sessionmaker(
    _engine, class_=AsyncSession, expire_on_commit=False
)


async def _update_db_image_url(e_type: str, e_id: str, url: str) -> None:
    async with _AsyncSessionFactory() as session:
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
        except Exception:
            logger.exception(f"Failed to update database for {e_type} {e_id}")


def process_image_upload_impl(
    entity_type: str,
    entity_id: str,
    image_bytes: bytes,
    filename: str,
) -> None:
    """Compress image, upload to Supabase Storage, write URL to DB. Never raises."""
    try:
        if not supabase:
            logger.error("Supabase client is not initialized. Check URL/KEY.")
            return

        original_size = len(image_bytes)

        if original_size > MAX_UPLOAD_BYTES:
            logger.warning(
                "Rejected oversized upload for %s/%s: %d bytes (cap %d)",
                entity_type,
                entity_id,
                original_size,
                MAX_UPLOAD_BYTES,
            )
            return

        try:
            Image.open(io.BytesIO(image_bytes)).verify()
        except (UnidentifiedImageError, Image.DecompressionBombError, Exception) as exc:
            logger.warning(
                "Rejected invalid image for %s/%s: %s", entity_type, entity_id, exc
            )
            return

        # verify() exhausts the object; reopen for actual processing.
        img = Image.open(io.BytesIO(image_bytes))
        if img.format not in ALLOWED_FORMATS:
            logger.warning(
                "Rejected disallowed format %s for %s/%s",
                img.format,
                entity_type,
                entity_id,
            )
            return
        try:
            img.load()  # force decode now, under the MAX_IMAGE_PIXELS guard
        except (OSError, Image.DecompressionBombError) as exc:
            logger.warning(
                "Failed to decode image for %s/%s after verify: %s",
                entity_type,
                entity_id,
                exc,
            )
            return

        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")

        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=70, optimize=True)
        compressed_bytes = buffer.getvalue()
        compressed_size = len(compressed_bytes)

        logger.info(
            "Image %s: original=%d bytes, compressed=%d bytes",
            filename,
            original_size,
            compressed_size,
        )

        # Fixed path so re-uploads overwrite the previous file.
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
                file_options={"content-type": "image/jpeg", "upsert": "true"},
            )

            image_url = supabase.storage.from_(settings.SUPABASE_BUCKET).get_public_url(
                storage_path
            )

            loop = asyncio.new_event_loop()
            try:
                loop.run_until_complete(
                    _update_db_image_url(entity_type, entity_id, image_url)
                )
            finally:
                loop.close()
            logger.info(f"Image uploaded to: {image_url}")

        except Exception:
            logger.exception("Failed to upload image to Supabase")
            return

    except Exception:
        logger.exception(
            "Unexpected error in process_image_upload_impl for %s/%s",
            entity_type,
            entity_id,
        )
        return


@celery_app.task(name="process_image_upload_task", queue="image_queue")
def process_image_upload_task(
    entity_type: str, entity_id: str, image_bytes: bytes, filename: str
):
    process_image_upload_impl(entity_type, entity_id, image_bytes, filename)
