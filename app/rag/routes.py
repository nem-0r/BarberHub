"""
POST /api/chat — BarberHub RAG chatbot endpoint.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.rag.service import rag_service

router = APIRouter(prefix="/api", tags=["Chat"])


class HistoryMessage(BaseModel):
    role: str  # "user" or "bot"
    text: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000)
    history: list[HistoryMessage] = Field(default_factory=list)


class ChatResponse(BaseModel):
    reply: str
    sources: list[str]


@router.post(
    "/chat",
    response_model=ChatResponse,
    summary="BarberHub RAG Chatbot",
    description="Ask questions about BarberHub platform rules, haircuts, and barbershops in Almaty.",
)
async def chat(request: ChatRequest) -> ChatResponse:
    if not rag_service.ready:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="RAG service is not ready yet. Try again in a moment.",
        )

    try:
        history = [{"role": m.role, "text": m.text} for m in request.history]
        result = await rag_service.chat(request.message, history=history)
        return ChatResponse(reply=result["reply"], sources=result["sources"])
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        )
