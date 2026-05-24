from __future__ import annotations

import time
import hashlib
from functools import lru_cache
from typing import Iterator, TypedDict

from rag_core.retrieval.vector_db import query_db
from rag_core.generation.prompts import build_prompt
from rag_core.generation.llm import generate
from rag_core.generation.rotator import rotated_generate_stream


class RAGResult(TypedDict):
    reply: str
    sources: list[str]
    retrieved_chunks: list[dict]


def _dedup_sources(chunks: list[dict]) -> list[str]:
    sources: list[str] = []
    seen: set[str] = set()
    for chunk in chunks:
        src = chunk["metadata"].get("source_file", "")
        if src and src not in seen:
            sources.append(src)
            seen.add(src)
    return sources


def _query_key(query: str, strategy: str, top_k: int) -> str:
    """Stable cache key: normalize whitespace and case."""
    normalized = " ".join(query.strip().lower().split())
    return hashlib.md5(f"{normalized}|{strategy}|{top_k}".encode()).hexdigest()


@lru_cache(maxsize=256)
def _cached_retrieve(cache_key: str, query: str, strategy: str, top_k: int) -> tuple:
    chunks = query_db(query, strategy=strategy, top_k=top_k)
    # lru_cache requires hashable return values
    return tuple(
        (c["text"], c["score"], tuple(sorted(c["metadata"].items()))) for c in chunks
    )


def _retrieve(query: str, strategy: str, top_k: int) -> list[dict]:
    key = _query_key(query, strategy, top_k)
    rows = _cached_retrieve(key, query, strategy, top_k)
    return [{"text": r[0], "score": r[1], "metadata": dict(r[2])} for r in rows]


_NO_CONTEXT_REPLY = (
    "Извините, по вашему вопросу у меня нет подходящей информации в базе знаний. "
    "Попробуйте переформулировать запрос или обратитесь к администратору салона."
)


def answer(
    query: str,
    strategy: str = "recursive",
    top_k: int = 3,
    history: list[dict] | None = None,
) -> RAGResult:
    """Retrieve, prompt, and generate. Retrieval is LRU-cached (256 slots)."""
    t0 = time.perf_counter()
    chunks = _retrieve(query, strategy, top_k)
    t1 = time.perf_counter()

    # Short-circuit on empty retrieval to avoid hallucination.
    if not chunks:
        print(f"[RAG] retrieve={t1 - t0:.2f}s  (no relevant chunks — short-circuit)")
        return RAGResult(reply=_NO_CONTEXT_REPLY, sources=[], retrieved_chunks=[])

    system_prompt, user_message = build_prompt(query, chunks, history=history)
    reply = generate(system_prompt, user_message)
    t2 = time.perf_counter()
    print(
        f"[RAG] retrieve={t1 - t0:.2f}s  generate={t2 - t1:.2f}s  total={t2 - t0:.2f}s"
    )

    return RAGResult(
        reply=reply, sources=_dedup_sources(chunks), retrieved_chunks=chunks
    )


class StreamEvent(TypedDict, total=False):
    kind: str  # "sources" | "chunk" | "done" | "error"
    sources: list[str]
    text: str
    message: str


def answer_stream(
    query: str,
    strategy: str = "recursive",
    top_k: int = 3,
    history: list[dict] | None = None,
) -> Iterator[StreamEvent]:
    """Streaming RAG pipeline: sources, then chunks, then done."""
    try:
        t0 = time.perf_counter()
        chunks = _retrieve(query, strategy, top_k)
        t1 = time.perf_counter()
        print(f"[RAG:stream] retrieve={t1 - t0:.2f}s")

        sources = _dedup_sources(chunks)
        yield {"kind": "sources", "sources": sources}

        if not chunks:
            yield {"kind": "chunk", "text": _NO_CONTEXT_REPLY}
            yield {"kind": "done"}
            return

        system_prompt, user_message = build_prompt(query, chunks, history=history)

        first_chunk = True
        for piece in rotated_generate_stream(system_prompt, user_message):
            if piece:
                if first_chunk:
                    print(f"[RAG:stream] first_token={time.perf_counter() - t1:.2f}s")
                    first_chunk = False
                yield {"kind": "chunk", "text": piece}

        print(f"[RAG:stream] total={time.perf_counter() - t0:.2f}s")
        yield {"kind": "done"}
    except Exception as exc:
        yield {"kind": "error", "message": f"{type(exc).__name__}: {exc}"}
