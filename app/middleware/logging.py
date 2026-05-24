import asyncio
import time
import logging
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from datetime import datetime

from config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("custom_logging")

# Lazy import: prod drops the elasticsearch package entirely.
es = None
if settings.ELASTIC_ENABLED:
    try:
        from elasticsearch import Elasticsearch  # type: ignore[import-not-found]

        es = Elasticsearch([settings.ELASTIC_URL])
    except Exception as e:
        logger.error(f"Could not connect to Elasticsearch: {e}")
        es = None


def _send_to_es(log_data: dict) -> None:
    try:
        es.index(index="app-logs", document=log_data)
    except Exception as e:
        logger.error(f"Failed to index log in Elasticsearch: {e}")


class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()

        client_ip = request.client.host
        client_port = request.client.port
        method = request.method
        path = request.url.path
        _SENSITIVE_PREFIXES = ("/users/verify/", "/users/reset-password/")
        if any(path.startswith(p) for p in _SENSITIVE_PREFIXES):
            prefix = next(p for p in _SENSITIVE_PREFIXES if path.startswith(p))
            url = (
                str(request.url.scheme)
                + "://"
                + str(request.url.netloc)
                + prefix
                + "<redacted>"
            )
        else:
            url = str(request.url.replace(query=None))

        response = await call_next(request)

        process_time = time.time() - start_time
        status_code = response.status_code

        log_type = "INFO"
        if 400 <= status_code < 500:
            log_type = "DEBUG"
        elif status_code >= 500:
            log_type = "ERROR"

        log_msg = f"{client_ip}:{client_port} - {method} - {url} - {status_code} - {process_time:.4f}s"
        logger.info(f"[{log_type}] {log_msg}")

        if es:
            log_data = {
                "timestamp": datetime.utcnow().isoformat(),
                "log": log_msg,
                "log_type": log_type,
                "service_name": "barbershop-api",
                "endpoint_name": request.url.path,
                "client_ip": client_ip,
                "method": method,
                "status_code": status_code,
                "processing_time": process_time,
            }
            loop = asyncio.get_running_loop()
            loop.run_in_executor(None, _send_to_es, log_data)

        response.headers["X-Process-Time"] = str(process_time)
        return response
