"""
RAG service for FastAPI.
Wraps rag_core pipeline with lazy initialization — model loads once on startup.
"""
from __future__ import annotations

import asyncio
from functools import lru_cache

from rag_core.generation.rag_pipeline import RAGResult, answer
from rag_core.retrieval.embedder import get_embedder
from rag_core.retrieval.vector_db import collection_stats, get_client


class RAGService:
    """
    Singleton service that holds warm references to the embedding model
    and ChromaDB client so they don't reload on every request.
    """

    def __init__(self):
        self._ready = False

    def warmup(self) -> None:
        """
        Call once on FastAPI startup.
        Loads BGE-M3 model and opens ChromaDB connection.
        """
        print("[RAG] Warming up embedding model (BGE-M3)...")
        get_embedder()  # triggers model download/load

        print("[RAG] Connecting to ChromaDB...")
        client = get_client()
        stats = collection_stats()
        print(f"[RAG] ChromaDB ready. Collections: {stats}")

        if all(v == 0 for v in stats.values()):
            print(
                "[RAG] WARNING: ChromaDB collections are empty. "
                "Run `python -m rag_core.ingest.build_index` to index documents."
            )

        self._ready = True
        print("[RAG] Service ready.")

    @property
    def ready(self) -> bool:
        return self._ready

    async def chat(self, message: str, history: list[dict] | None = None) -> RAGResult:
        """
        Run the RAG pipeline asynchronously (offloads blocking I/O to threadpool).
        history is a list of {"role": "user"|"bot", "text": "..."} dicts.
        """
        if not self._ready:
            raise RuntimeError("RAG service not initialized. Call warmup() first.")

        if len(message) > 1000:
            raise ValueError("Message too long (max 1000 characters).")

        loop = asyncio.get_event_loop()
        result: RAGResult = await loop.run_in_executor(
            None,
            lambda: answer(message, strategy="recursive", top_k=3, history=history),
        )
        return result


# Module-level singleton — imported by routes and main.py
rag_service = RAGService()
