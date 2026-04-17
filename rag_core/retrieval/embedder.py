from __future__ import annotations

import os
from pathlib import Path

# Use Docker volume path if set, otherwise fall back to local cache
_DEFAULT_CACHE = str(Path(__file__).parent.parent / ".model_cache")
_CACHE_DIR = os.environ.get("SENTENCE_TRANSFORMERS_HOME", _DEFAULT_CACHE)
os.environ.setdefault("SENTENCE_TRANSFORMERS_HOME", _CACHE_DIR)

from sentence_transformers import SentenceTransformer

_MODEL_NAME = "BAAI/bge-m3"
_model: SentenceTransformer | None = None


def get_embedder() -> SentenceTransformer:
    global _model
    if _model is None:
        print(f"[Embedder] Loading {_MODEL_NAME} ...")
        _model = SentenceTransformer(_MODEL_NAME, cache_folder=_CACHE_DIR)
        print(f"[Embedder] Ready.")
    return _model


def embed(texts: list[str]) -> list[list[float]]:
    """Embed a list of document strings."""
    model = get_embedder()
    vectors = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
    return vectors.tolist()


def embed_query(query: str) -> list[float]:
    """Embed a query string. Uses the BGE-M3 retrieval prefix for better ranking."""
    model = get_embedder()
    prefixed = f"Represent this sentence for searching relevant passages: {query}"
    vector = model.encode([prefixed], normalize_embeddings=True, show_progress_bar=False)
    return vector[0].tolist()
