"""Vector store facade: ChromaDB (legacy) or pgvector, selected by settings.RAG_BACKEND.

Public API: get_client(), index_chunks(), query_db(), collection_stats().
Score contract: cosine similarity in [0, 1], filtered by _MIN_RELEVANCE_SCORE.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path
from typing import Literal

from config import settings
from rag_core.ingest.chunker import Chunk
from rag_core.retrieval.embedder import embed, embed_query

logger = logging.getLogger(__name__)

_COLLECTIONS = ("chunks_fixed", "chunks_recursive")
_MIN_RELEVANCE_SCORE = 0.35


def _backend() -> str:
    return (settings.RAG_BACKEND or "chroma").strip().lower()


def _build_metadata(c: Chunk, strategy: str) -> dict:
    return {
        "source_file": c.metadata.get("source_file", ""),
        "title": c.metadata.get("title", ""),
        "date": c.metadata.get("date", ""),
        "doc_type": c.metadata.get("doc_type", ""),
        "chunk_index": c.chunk_index,
        "chunk_strategy": strategy,
    }


def _chunk_id(c: Chunk, strategy: str) -> str:
    return f"{strategy}_{c.metadata['source_file']}_{c.chunk_index}"


# ===========================================================================
# Backend: ChromaDB (legacy, embedded)
# ===========================================================================

_chroma_client = None
_CHROMA_PATH = str(Path(__file__).parent.parent / "chroma_data")


def _get_chroma_client():
    global _chroma_client
    if _chroma_client is None:
        import chromadb
        from chromadb.config import Settings as ChromaSettings

        logging.getLogger("chromadb.telemetry").setLevel(logging.CRITICAL)
        _chroma_client = chromadb.PersistentClient(
            path=_CHROMA_PATH,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
    return _chroma_client


@lru_cache(maxsize=4)
def _get_chroma_collection(strategy: Literal["fixed", "recursive"]):
    return _get_chroma_client().get_or_create_collection(
        name=f"chunks_{strategy}",
        metadata={"hnsw:space": "cosine"},
    )


def _chroma_index_chunks(chunks: list[Chunk], strategy: str) -> None:
    collection = _get_chroma_collection(strategy)
    texts = [c.text for c in chunks]
    ids = [_chunk_id(c, strategy) for c in chunks]
    metadatas = [_build_metadata(c, strategy) for c in chunks]

    print(f"  [ChromaDB] Embedding {len(chunks)} chunks (strategy={strategy})...")
    vectors = embed(texts)

    batch = 100
    for i in range(0, len(chunks), batch):
        collection.upsert(
            ids=ids[i : i + batch],
            embeddings=vectors[i : i + batch],
            documents=texts[i : i + batch],
            metadatas=metadatas[i : i + batch],
        )
    print(f"  [ChromaDB] Upserted {len(chunks)} chunks into '{collection.name}'.")


def _chroma_query_db(query: str, strategy: str, top_k: int) -> list[dict]:
    collection = _get_chroma_collection(strategy)
    if collection.count() == 0:
        raise RuntimeError(
            f"Collection '{strategy}' is empty. Run build_index.py first."
        )

    vector = embed_query(query)
    results = collection.query(
        query_embeddings=[vector],
        n_results=min(top_k, collection.count()),
        include=["documents", "metadatas", "distances"],
    )
    hits = []
    for doc, meta, dist in zip(
        results["documents"][0],
        results["metadatas"][0],
        results["distances"][0],
    ):
        score = round(1 - dist, 4)
        if score >= _MIN_RELEVANCE_SCORE:
            hits.append({"text": doc, "score": score, "metadata": meta})
    return hits


def _chroma_collection_stats() -> dict:
    client = _get_chroma_client()
    stats = {}
    for name in _COLLECTIONS:
        try:
            stats[name] = client.get_collection(name).count()
        except Exception:
            stats[name] = 0
    return stats


# ===========================================================================
# Backend: pgvector (Postgres / Supabase) — stateless
# ===========================================================================

_pg_engine = None


def _get_pg_engine():
    """Synchronous psycopg2 engine for RAG queries and build_index.

    Prefers MIGRATION_DATABASE_URL (direct port) to avoid pgbouncer
    transaction-mode issues with batched INSERTs.
    """
    global _pg_engine
    if _pg_engine is None:
        from sqlalchemy import create_engine

        raw_url = settings.MIGRATION_DATABASE_URL or settings.DATABASE_URL
        sync_url = raw_url.replace("+asyncpg", "+psycopg2")
        _pg_engine = create_engine(
            sync_url,
            pool_size=2,
            max_overflow=2,
            pool_pre_ping=True,
            pool_recycle=settings.DB_POOL_RECYCLE,
        )
    return _pg_engine


def _vec_literal(vec) -> str:
    """Format a vector as a pgvector text literal."""
    return "[" + ",".join(f"{float(x):.8f}" for x in vec) + "]"


def _pg_index_chunks(chunks: list[Chunk], strategy: str) -> None:
    from sqlalchemy import text as sql

    print(f"  [pgvector] Embedding {len(chunks)} chunks (strategy={strategy})...")
    texts = [c.text for c in chunks]
    vectors = embed(texts)

    if len(vectors) != len(chunks):
        raise RuntimeError(
            f"embed() returned {len(vectors)} vectors for {len(chunks)} chunks "
            "— refusing to upsert truncated data."
        )

    expected_dim = settings.EMBEDDING_DIM
    rows = []
    for c, v in zip(chunks, vectors):
        if len(v) != expected_dim:
            raise ValueError(
                f"Embedding dim {len(v)} != {expected_dim} "
                f"(settings.EMBEDDING_DIM). Embedder, EMBEDDING_DIM and the "
                "pgvector column width must all move together."
            )
        rows.append(
            {
                "id": _chunk_id(c, strategy),
                "strategy": strategy,
                "text": c.text,
                "embedding": _vec_literal(v),
                "metadata": _json_dumps(_build_metadata(c, strategy)),
            }
        )

    stmt = sql(
        """
        INSERT INTO rag_chunks (id, strategy, text, embedding, metadata)
        VALUES (:id, :strategy, :text, CAST(:embedding AS vector),
                CAST(:metadata AS jsonb))
        ON CONFLICT (id) DO UPDATE SET
            strategy  = EXCLUDED.strategy,
            text      = EXCLUDED.text,
            embedding = EXCLUDED.embedding,
            metadata  = EXCLUDED.metadata
        """
    )
    engine = _get_pg_engine()
    batch = 100
    with engine.begin() as conn:
        for i in range(0, len(rows), batch):
            conn.execute(stmt, rows[i : i + batch])
    print(f"  [pgvector] Upserted {len(rows)} chunks (strategy={strategy}).")


def _pg_query_db(query: str, strategy: str, top_k: int) -> list[dict]:
    from sqlalchemy import text as sql

    engine = _get_pg_engine()
    with engine.connect() as conn:
        n = conn.execute(
            sql("SELECT count(*) FROM rag_chunks WHERE strategy = :s"),
            {"s": strategy},
        ).scalar_one()
        if n == 0:
            raise RuntimeError(
                f"Collection '{strategy}' is empty. Run build_index.py first."
            )

        qvec_raw = embed_query(query)
        if len(qvec_raw) != settings.EMBEDDING_DIM:
            raise ValueError(
                f"embed_query() returned dim {len(qvec_raw)} != "
                f"{settings.EMBEDDING_DIM} (settings.EMBEDDING_DIM). "
                "Embedder provider and pgvector column width are out of sync."
            )
        qvec = _vec_literal(qvec_raw)
        rows = conn.execute(
            sql(
                """
                SELECT text,
                       metadata,
                       1 - (embedding <=> CAST(:q AS vector)) AS score
                FROM rag_chunks
                WHERE strategy = :s
                ORDER BY embedding <=> CAST(:q AS vector)
                LIMIT :k
                """
            ),
            {"q": qvec, "s": strategy, "k": top_k},
        ).all()

    hits = []
    for r in rows:
        score = round(float(r.score), 4)
        if score >= _MIN_RELEVANCE_SCORE:
            meta = (
                r.metadata if isinstance(r.metadata, dict) else _json_loads(r.metadata)
            )
            hits.append({"text": r.text, "score": score, "metadata": meta})
    return hits


def _pg_collection_stats() -> dict:
    from sqlalchemy import text as sql

    stats = {name: 0 for name in _COLLECTIONS}
    try:
        engine = _get_pg_engine()
        with engine.connect() as conn:
            for strategy, cnt in conn.execute(
                sql("SELECT strategy, count(*) FROM rag_chunks GROUP BY strategy")
            ):
                key = f"chunks_{strategy}"
                if key in stats:
                    stats[key] = cnt
    except Exception as exc:
        logger.warning("pgvector collection_stats failed: %s", exc)
    return stats


def _json_dumps(d: dict) -> str:
    import json

    return json.dumps(d, ensure_ascii=False)


def _json_loads(s):
    import json

    return json.loads(s)


# ===========================================================================
# Public facade — dispatch on settings.RAG_BACKEND
# ===========================================================================


def get_client():
    """Return backend handle; verifies connection for pgvector."""
    if _backend() == "pgvector":
        from sqlalchemy import text as sql

        engine = _get_pg_engine()
        with engine.connect() as conn:
            conn.execute(sql("SELECT 1"))
        return engine
    return _get_chroma_client()


def index_chunks(chunks: list[Chunk], strategy: Literal["fixed", "recursive"]) -> None:
    if _backend() == "pgvector":
        return _pg_index_chunks(chunks, strategy)
    return _chroma_index_chunks(chunks, strategy)


def query_db(
    query: str,
    strategy: Literal["fixed", "recursive"] = "recursive",
    top_k: int = 5,
) -> list[dict]:
    if _backend() == "pgvector":
        return _pg_query_db(query, strategy, top_k)
    return _chroma_query_db(query, strategy, top_k)


def collection_stats() -> dict:
    if _backend() == "pgvector":
        return _pg_collection_stats()
    return _chroma_collection_stats()
