import io
from fastapi import Request
from fastapi.responses import HTMLResponse
from starlette.middleware.base import BaseHTTPMiddleware
from pyinstrument import Profiler

class ProfilerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.query_params.get("profile") != "true":
            return await call_next(request)
        
        profiler = Profiler(interval=0.0001)
        profiler.start()
        
        response = await call_next(request)
        
        profiler.stop()
        
        output = profiler.output_html()
        
        return HTMLResponse(content=output)
