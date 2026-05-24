"""RAG service — wraps rag_core pipeline with lazy initialization."""

from __future__ import annotations

import asyncio
from typing import AsyncIterator

from rag_core.generation.rag_pipeline import (
    RAGResult,
    answer,
    answer_stream,
    StreamEvent,
)
from rag_core.retrieval.embedder import get_embedder
from rag_core.retrieval.vector_db import collection_stats, get_client


class RAGService:
    """Holds warm references to the embedding model and vector store client."""

    def __init__(self):
        self._ready = False

    def warmup(self) -> None:
        """Load embedding model, vector store, and Gemini rotator at startup."""
        import time

        print("[RAG] Warming up embedding model (BGE-M3)...")
        t0 = time.perf_counter()
        get_embedder()
        print(f"[RAG] Embedding model ready in {time.perf_counter() - t0:.1f}s")

        from config import settings

        backend = (settings.RAG_BACKEND or "chroma").strip().lower()
        store = (
            "pgvector (Postgres)" if backend == "pgvector" else "ChromaDB (embedded)"
        )

        print(f"[RAG] Connecting to vector store: {store}...")
        get_client()
        stats = collection_stats()
        print(f"[RAG] {store} ready. Collections: {stats}")

        if all(v == 0 for v in stats.values()):
            print(
                f"[RAG] WARNING: {store} is empty. "
                "Run `python -m rag_core.ingest.build_index` to index documents."
            )

        print("[RAG] Probing Gemini models (eliminates cold-start on first chat)...")
        t1 = time.perf_counter()
        from rag_core.generation.rotator import get_rotator

        get_rotator()
        print(f"[RAG] Gemini rotator ready in {time.perf_counter() - t1:.1f}s")

        self._ready = True
        print("[RAG] Service fully ready.")

    @property
    def ready(self) -> bool:
        return self._ready

    async def chat(self, message: str, history: list[dict] | None = None) -> RAGResult:
        """Run the RAG pipeline, offloading blocking work to a threadpool."""
        if not self._ready:
            raise RuntimeError("RAG service not initialized. Call warmup() first.")

        if len(message) > 1000:
            raise ValueError("Message too long (max 1000 characters).")

        loop = asyncio.get_running_loop()
        result: RAGResult = await loop.run_in_executor(
            None,
            lambda: answer(message, strategy="recursive", top_k=3, history=history),
        )
        return result

    async def chat_stream(
        self, message: str, history: list[dict] | None = None
    ) -> AsyncIterator[StreamEvent]:
        """Bridge the sync answer_stream generator into async via a queue."""
        if not self._ready:
            raise RuntimeError("RAG service not initialized. Call warmup() first.")

        if len(message) > 1000:
            raise ValueError("Message too long (max 1000 characters).")

        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[StreamEvent | None] = asyncio.Queue()
        _SENTINEL: StreamEvent | None = None

        def _put(item: StreamEvent | None) -> None:
            asyncio.run_coroutine_threadsafe(queue.put(item), loop).result()

        def producer() -> None:
            try:
                for event in answer_stream(
                    message, strategy="recursive", top_k=3, history=history
                ):
                    _put(event)
            except Exception as exc:
                _put({"kind": "error", "message": f"{type(exc).__name__}: {exc}"})
            finally:
                _put(_SENTINEL)

        loop.run_in_executor(None, producer)

        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=60.0)
            except asyncio.TimeoutError:
                yield {
                    "kind": "error",
                    "message": "Request timed out. The AI model did not respond in time. Please try again.",
                }
                return
            if event is _SENTINEL:
                return
            yield event


rag_service = RAGService()
