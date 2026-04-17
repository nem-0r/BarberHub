from __future__ import annotations

from typing import TypedDict

from rag_core.retrieval.vector_db import query_db
from rag_core.generation.prompts import build_prompt
from rag_core.generation.llm import generate


class RAGResult(TypedDict):
    reply: str
    sources: list[str]
    retrieved_chunks: list[dict]


def answer(
    query: str,
    strategy: str = "recursive",
    top_k: int = 3,
    history: list[dict] | None = None,
) -> RAGResult:
    """
    Run the full RAG pipeline: retrieve -> prompt -> generate.
    Used by both the CLI eval scripts and the FastAPI endpoint.
    history is an optional list of {"role": "user"|"bot", "text": "..."} dicts
    representing recent conversation turns to include in the prompt.
    """
    chunks = query_db(query, strategy=strategy, top_k=top_k)
    system_prompt, user_message = build_prompt(query, chunks, history=history)
    reply = generate(system_prompt, user_message)

    # Deduplicate sources while preserving order
    sources: list[str] = []
    seen: set[str] = set()
    for chunk in chunks:
        src = chunk["metadata"].get("source_file", "")
        if src and src not in seen:
            sources.append(src)
            seen.add(src)

    return RAGResult(reply=reply, sources=sources, retrieved_chunks=chunks)
