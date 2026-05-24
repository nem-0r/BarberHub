from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from config import settings


def _client_ip(request: Request) -> str:
    """Resolve real client IP behind a proxy (X-Forwarded-For > X-Real-IP > peer)."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        first = fwd.split(",")[0].strip()
        if first:
            return first

    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()

    return get_remote_address(request)


limiter = Limiter(
    key_func=_client_ip,
    storage_uri=settings.effective_redis_url(settings.RATELIMIT_REDIS_DB),
    strategy="fixed-window",
    swallow_errors=True,  # fail open on Redis outage
)
