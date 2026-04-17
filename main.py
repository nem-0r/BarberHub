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

import app.users.models  
import app.salons.models  
import app.staff.models  
import app.services.models  
import app.staff_services.models  
import app.schedules.models  
import app.bookings.models  
import app.reviews.models

from database import init_db
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # RAG service warmup: loads BGE-M3 model and opens ChromaDB connection once
    import asyncio
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, rag_service.warmup)
    yield


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
    # Prevents 307 redirect on trailing-slash mismatch, which strips CORS headers
    redirect_slashes=False,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@app.exception_handler(BarbershopException)
async def barbershop_exception_handler(request: Request, exc: BarbershopException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.__class__.__name__, "message": exc.message},
    )

from app.middleware.logging import LoggingMiddleware
from app.middleware.profiler import ProfilerMiddleware

# Inner middlewares added first (processed last)
app.add_middleware(LoggingMiddleware)
app.add_middleware(ProfilerMiddleware)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["*"])

# CORS must be added LAST — becomes the outermost middleware (processed first)
# allow_origins cannot be ["*"] when allow_credentials=True (CORS spec violation)
_allowed_origins = list({
    settings.FRONTEND_URL,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
})

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(chat_router)
app.include_router(users_router)
app.include_router(salons_router)
app.include_router(staff_router)
app.include_router(services_router)
app.include_router(staff_services_router)
app.include_router(schedules_router)
app.include_router(bookings_router)
app.include_router(reviews_router)


@app.get("/", tags=["Health"])
async def root():
    return {"status": "ok", "message": "Barbershop API is running"}
