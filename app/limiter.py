from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from config import settings


def _client_ip(request: Request) -> str:
    """Pick the real client IP when running behind a reverse proxy.

    Order: X-Forwarded-For (first hop) -> X-Real-IP -> direct peer.
    Falls back to slowapi's get_remote_address so empty/malformed headers
    behave the same as before (e.g. local dev without a proxy).

    Note: trust this only when terminating TLS behind a controlled proxy
    (nginx / Cloudflare). Otherwise a client can spoof the header.
    """
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        # First hop is the original client; subsequent ones are intermediate proxies.
        first = fwd.split(",")[0].strip()
        if first:
            return first

    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()

    return get_remote_address(request)


# Counters live in Redis, not per-worker memory. Without a shared store every
# gunicorn worker keeps its own counters, so a "10/minute" limit effectively
# becomes 10*WEB_CONCURRENCY and resets on every restart — i.e. the limit on
# expensive endpoints (chat, avatar upload) is not actually enforced.
limiter = Limiter(
    key_func=_client_ip,
    storage_uri=settings.effective_redis_url(settings.RATELIMIT_REDIS_DB),
    strategy="fixed-window",
    # If Redis is unreachable, fail OPEN (serve the request) instead of 500 —
    # the limiter is abuse mitigation, not a hard dependency of the API.
    swallow_errors=True,
)
