"""RAG chatbot endpoints."""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, status, Request
from fastapi.responses import StreamingResponse
from typing import Literal
from pydantic import BaseModel, Field

from app.rag.service import rag_service
from app.limiter import limiter

router = APIRouter(prefix="/api", tags=["Chat"])


class HistoryMessage(BaseModel):
    role: Literal["user", "bot"]
    text: str = Field(..., max_length=2000)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000)
    history: list[HistoryMessage] = Field(default_factory=list, max_length=50)


class ChatResponse(BaseModel):
    reply: str
    sources: list[str]


@router.post(
    "/chat",
    response_model=ChatResponse,
    summary="BarberHub RAG Chatbot",
    description="Ask questions about BarberHub platform rules, haircuts, and barbershops in Almaty.",
)
@limiter.limit("10/minute;200/hour")
async def chat(request: Request, body: ChatRequest) -> ChatResponse:
    if not rag_service.ready:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="RAG service is not ready yet. Try again in a moment.",
        )

    try:
        history = [{"role": m.role, "text": m.text} for m in body.history]
        result = await rag_service.chat(body.message, history=history)
        return ChatResponse(reply=result["reply"], sources=result["sources"])
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        )


@router.post(
    "/chat/stream",
    summary="BarberHub RAG Chatbot (Streaming)",
    description=(
        "Streams answer tokens over Server-Sent Events. "
        "Event payloads: {kind: 'sources', sources: [...]}, {kind: 'chunk', text: '...'}, "
        "{kind: 'done'}, {kind: 'error', message: '...'}."
    ),
)
@limiter.limit("10/minute;200/hour")
async def chat_stream(request: Request, body: ChatRequest):
    if not rag_service.ready:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="RAG service is not ready yet. Try again in a moment.",
        )

    if len(body.message) > 1000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message too long (max 1000 characters).",
        )

    history = [{"role": m.role, "text": m.text} for m in body.history]

    async def event_generator():
        try:
            async for event in rag_service.chat_stream(body.message, history=history):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        except Exception as exc:
            payload = {"kind": "error", "message": f"{type(exc).__name__}: {exc}"}
            yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    # X-Accel-Buffering: disable nginx response buffering behind a proxy.
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
