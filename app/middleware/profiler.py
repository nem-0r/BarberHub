import io
from fastapi import Request
from fastapi.responses import HTMLResponse
from starlette.middleware.base import BaseHTTPMiddleware
from config import settings

class ProfilerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Only enable profiling in development / when explicitly configured
        enable_profiler = getattr(settings, "ENABLE_PROFILER", False)
        if not enable_profiler or request.query_params.get("profile") != "true":
            return await call_next(request)

        from pyinstrument import Profiler
        profiler = Profiler(interval=0.0001)
        profiler.start()
        response = await call_next(request)
        profiler.stop()
        output = profiler.output_html()
        return HTMLResponse(content=output)
