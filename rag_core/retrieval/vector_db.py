from __future__ import annotations

import logging
from pathlib import Path
from typing import Literal

import chromadb
from chromadb.config import Settings as ChromaSettings

# ChromaDB 0.6.x has a telemetry bug that spams stderr — silence it
logging.getLogger("chromadb.telemetry").setLevel(logging.CRITICAL)

from rag_core.ingest.chunker import Chunk
from rag_core.retrieval.embedder import embed, embed_query

_CHROMA_PATH = str(Path(__file__).parent.parent / "chroma_data")
_COLLECTIONS = ("chunks_fixed", "chunks_recursive")

_client: chromadb.PersistentClient | None = None


def get_client() -> chromadb.PersistentClient:
    global _client
    if _client is None:
        _client = chromadb.PersistentClient(
            path=_CHROMA_PATH,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
    return _client


def get_collection(strategy: Literal["fixed", "recursive"]) -> chromadb.Collection:
    return get_client().get_or_create_collection(
        name=f"chunks_{strategy}",
        metadata={"hnsw:space": "cosine"},
    )


def index_chunks(chunks: list[Chunk], strategy: Literal["fixed", "recursive"]) -> None:
    """Embed and upsert chunks into the corresponding collection."""
    collection = get_collection(strategy)

    texts     = [c.text for c in chunks]
    ids       = [f"{strategy}_{c.metadata['source_file']}_{c.chunk_index}" for c in chunks]
    metadatas = [
        {
            "source_file":    c.metadata.get("source_file", ""),
            "title":          c.metadata.get("title", ""),
            "date":           c.metadata.get("date", ""),
            "doc_type":       c.metadata.get("doc_type", ""),
            "chunk_index":    c.chunk_index,
            "chunk_strategy": strategy,
        }
        for c in chunks
    ]

    print(f"  [ChromaDB] Embedding {len(chunks)} chunks (strategy={strategy})...")
    vectors = embed(texts)

    # Upsert in batches of 100 to avoid memory spikes
    batch = 100
    for i in range(0, len(chunks), batch):
        collection.upsert(
            ids=ids[i : i + batch],
            embeddings=vectors[i : i + batch],
            documents=texts[i : i + batch],
            metadatas=metadatas[i : i + batch],
        )
    print(f"  [ChromaDB] Upserted {len(chunks)} chunks into '{collection.name}'.")


def query_db(
    query: str,
    strategy: Literal["fixed", "recursive"] = "recursive",
    top_k: int = 5,
) -> list[dict]:
    """Retrieve the top_k most similar chunks for a query."""
    collection = get_collection(strategy)
    if collection.count() == 0:
        raise RuntimeError(f"Collection '{strategy}' is empty. Run build_index.py first.")

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
        # ChromaDB returns cosine distance; convert to similarity score
        hits.append({"text": doc, "score": round(1 - dist, 4), "metadata": meta})
    return hits


def collection_stats() -> dict:
    client = get_client()
    stats = {}
    for name in _COLLECTIONS:
        try:
            col = client.get_collection(name)
            stats[name] = col.count()
        except Exception:
            stats[name] = 0
    return stats
