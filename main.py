import builtins

try:
    from pydantic import SecretStr

    builtins.SecretStr = SecretStr
except ImportError:
    pass

from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from app.exceptions import BarbershopException

from app import register_models

register_models()

import logging as _logging

_bx_logger = _logging.getLogger("custom_logging")

from config import settings
from app.rag.service import rag_service
from app.rag.routes import router as chat_router
from app.users.routes import router as users_router
from app.salons.routes import router as salons_router
from app.staff.routes import router as staff_router
from app.services.routes import router as services_router
from app.staff_services.routes import router as staff_services_router
from app.schedules.routes import router as schedules_router
from app.bookings.routes import router as bookings_router
from app.reviews.routes import router as reviews_router
from app.ml.routes import router as ml_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    for _w in settings.production_warnings():
        _bx_logger.warning("[CONFIG] %s", _w)

    import asyncio

    warmup_task = asyncio.create_task(asyncio.to_thread(rag_service.warmup))

    def _log_warmup_failure(t: asyncio.Task) -> None:
        if t.cancelled():
            return
        exc = t.exception()
        if exc is not None:
            print(f"[RAG] Warmup failed: {type(exc).__name__}: {exc}")

    warmup_task.add_done_callback(_log_warmup_failure)

    if not settings.USE_CELERY:
        from app.tasks.scheduler import start_scheduler

        start_scheduler()

    try:
        yield
    finally:
        if not settings.USE_CELERY:
            from app.tasks.scheduler import stop_scheduler

            stop_scheduler()
        if not warmup_task.done():
            warmup_task.cancel()


from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from app.limiter import limiter
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

app = FastAPI(
    title="Barbershop Booking System",
    description="Modular REST API for barbershop appointments",
    version="1.0.0",
    lifespan=lifespan,
    redirect_slashes=False,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.exception_handler(BarbershopException)
async def barbershop_exception_handler(request: Request, exc: BarbershopException):
    _bx_logger.warning(
        "[%s] %s %s -> %s: %s",
        exc.__class__.__name__,
        request.method,
        request.url.path,
        exc.status_code,
        exc.message,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.__class__.__name__, "message": exc.message},
    )


from app.middleware.logging import LoggingMiddleware
from app.middleware.profiler import ProfilerMiddleware

app.add_middleware(LoggingMiddleware)
app.add_middleware(ProfilerMiddleware)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts_list)

_allowed_origins = [settings.FRONTEND_URL]
if settings.DEBUG:
    _allowed_origins = list(
        {*_allowed_origins, "http://localhost:3000", "http://127.0.0.1:3000"}
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    _bx_logger.exception(
        "[Unhandled] %s %s -> 500: %s",
        request.method,
        request.url.path,
        exc,
    )
    origin = request.headers.get("origin")
    headers = {}
    if origin and origin in _allowed_origins:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
        headers["Vary"] = "Origin"
    if settings.DEBUG:
        body = {"error": type(exc).__name__, "message": str(exc)}
    else:
        body = {"error": "InternalServerError", "message": "Internal server error"}
    return JSONResponse(status_code=500, content=body, headers=headers)


app.include_router(chat_router)
app.include_router(users_router)
app.include_router(salons_router)
app.include_router(staff_router)
app.include_router(services_router)
app.include_router(staff_services_router)
app.include_router(schedules_router)
app.include_router(bookings_router)
app.include_router(reviews_router)
app.include_router(ml_router)


@app.get("/", tags=["Health"])
async def root():
    return {"status": "ok", "message": "Barbershop API is running"}


@app.get("/health", tags=["Health"])
async def health():
    """Readiness probe: returns 503 if Postgres or Redis is unreachable."""
    import asyncio as _asyncio
    from sqlalchemy import text
    from database import engine
    from app.users.redis import redis_client

    checks = {"database": "ok", "redis": "ok", "rag": "ok"}
    healthy = True

    async def _check_db():
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))

    try:
        await _asyncio.wait_for(_check_db(), timeout=3.0)
    except _asyncio.TimeoutError:
        checks["database"] = "error: timeout"
        healthy = False
    except Exception as exc:
        checks["database"] = f"error: {type(exc).__name__}"
        healthy = False

    try:
        await _asyncio.wait_for(redis_client.ping(), timeout=3.0)
    except _asyncio.TimeoutError:
        checks["redis"] = "error: timeout"
        healthy = False
    except Exception as exc:
        checks["redis"] = f"error: {type(exc).__name__}"
        healthy = False

    if not rag_service.ready:
        checks["rag"] = "warming"

    body = {"status": "ok" if healthy else "degraded", "checks": checks}
    if not healthy:
        return JSONResponse(status_code=503, content=body)
    return body
