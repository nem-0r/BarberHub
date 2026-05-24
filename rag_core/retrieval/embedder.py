"""Embedder facade: 'sentence_transformer' (local BGE-M3) or 'gemini' (HTTP).

Selected via settings.EMBEDDER_PROVIDER; dim must match settings.EMBEDDING_DIM.
"""

from __future__ import annotations

import os
import time
from functools import lru_cache
from pathlib import Path
from typing import Protocol


_DEFAULT_CACHE = str(Path(__file__).parent.parent / ".model_cache")
_CACHE_DIR = os.environ.get("SENTENCE_TRANSFORMERS_HOME", _DEFAULT_CACHE)
os.environ.setdefault("SENTENCE_TRANSFORMERS_HOME", _CACHE_DIR)


class EmbedderProtocol(Protocol):
    @property
    def dim(self) -> int: ...
    def embed(self, texts: list[str]) -> list[list[float]]: ...
    def embed_query(self, query: str) -> list[float]: ...


# ===========================================================================
# Provider: SentenceTransformer (local BGE-M3)
# ===========================================================================


class SentenceTransformerEmbedder:
    """Local BAAI/bge-m3."""

    def __init__(self) -> None:
        # Lazy imports so the prod image can drop torch entirely.
        import torch
        from sentence_transformers import SentenceTransformer

        device = "mps" if torch.backends.mps.is_available() else "cpu"
        print(f"[Embedder] Loading BAAI/bge-m3 on {device} ...")
        self._model = SentenceTransformer(
            "BAAI/bge-m3",
            cache_folder=_CACHE_DIR,
            device=device,
        )
        self._dim = 1024
        print(f"[Embedder] BGE-M3 ready on {device}.")

    @property
    def dim(self) -> int:
        return self._dim

    def embed(self, texts: list[str]) -> list[list[float]]:
        vectors = self._model.encode(
            texts,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        return vectors.tolist()

    def embed_query(self, query: str) -> list[float]:
        prefixed = f"Represent this sentence for searching relevant passages: {query}"
        vector = self._model.encode(
            [prefixed],
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        return vector[0].tolist()


# ===========================================================================
# Provider: Gemini text-embedding-004 (HTTP, no local model)
# ===========================================================================


class GeminiEmbedder:
    """Google Gemini text-embedding via the generativeai SDK."""

    _MAX_ATTEMPTS = 4

    # Probe candidates at init; use first that returns the expected dimensionality.
    # Each entry: (model_name, extra_kwargs_dict).
    _EMBED_MODEL_CANDIDATES: list[tuple[str, dict]] = [
        ("models/gemini-embedding-2", {"output_dimensionality": 768}),  # stable v2
        ("models/gemini-embedding-001", {"output_dimensionality": 768}),  # stable v1
        (
            "models/gemini-embedding-2-preview",
            {"output_dimensionality": 768},
        ),  # preview v2
    ]

    def __init__(self) -> None:
        from config import settings

        self._dim = settings.EMBEDDING_DIM
        self._keys = self._load_keys()
        self._key_idx = 0
        self._configure(self._keys[0])

        configured = (settings.GEMINI_EMBED_MODEL or "").strip()
        candidates: list[tuple[str, dict]] = []
        if configured:
            candidates.append((configured, {}))
        for c in self._EMBED_MODEL_CANDIDATES:
            if c[0] != configured:
                candidates.append(c)

        self._model, self._extra_kwargs = self._probe_models(candidates)
        print(
            f"[Embedder] Gemini {self._model} ready "
            f"({self._dim}-dim, {len(self._keys)} key(s))."
        )

    def _probe_models(self, candidates: list[tuple[str, dict]]) -> tuple[str, dict]:
        """Return the first candidate that responds with the expected vector dim."""
        import google.generativeai as genai

        print(f"[Embedder] Probing {len(candidates)} embedding model candidate(s) ...")
        last_err: Exception | None = None
        for cand_name, extra in candidates:
            try:
                resp = genai.embed_content(
                    model=cand_name,
                    content="probe",
                    task_type="retrieval_document",
                    **extra,
                )
                vec = resp.get("embedding") if isinstance(resp, dict) else None
                if isinstance(vec, list) and len(vec) == self._dim:
                    print(f"  [Embedder] ✓ {cand_name} ({len(vec)}-dim)")
                    return cand_name, extra
                got_len = len(vec) if isinstance(vec, list) else type(vec).__name__
                print(
                    f"  [Embedder] ? {cand_name} — dim mismatch "
                    f"(got {got_len}, expected {self._dim})"
                )
            except Exception as exc:
                last_err = exc
                msg = str(exc)
                print(f"  [Embedder] ✗ {cand_name} — {msg[:140]}")
        raise RuntimeError(
            "No working Gemini embedding model found. Tried: "
            + ", ".join(c[0] for c in candidates)
            + f". Last error: {last_err}. "
            "Consider migrating to the google-genai SDK (v1 endpoint)."
        )

    @property
    def dim(self) -> int:
        return self._dim

    @staticmethod
    def _load_keys() -> list[str]:
        keys: list[str] = []
        for env_var in ("GEMINI_API_KEY", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3"):
            val = os.getenv(env_var, "").strip()
            if val and val not in ("YOUR_SECOND_KEY_HERE", "YOUR_THIRD_KEY_HERE"):
                keys.append(val)
        if not keys:
            raise RuntimeError(
                "GeminiEmbedder requires GEMINI_API_KEY in the environment."
            )
        return keys

    def _configure(self, key: str) -> None:
        import google.generativeai as genai

        genai.configure(api_key=key)

    def _rotate_key(self) -> None:
        """Move to the next key on rate-limit/auth failure."""
        self._key_idx = (self._key_idx + 1) % len(self._keys)
        self._configure(self._keys[self._key_idx])

    def _call_with_retry(self, fn):
        last: Exception | None = None
        for attempt in range(self._MAX_ATTEMPTS):
            try:
                return fn()
            except Exception as exc:
                last = exc
                msg = str(exc).lower()
                rotate = (
                    "429" in msg
                    or "quota" in msg
                    or "rate" in msg
                    or "401" in msg
                    or "403" in msg
                    or "invalid" in msg
                )
                if rotate and len(self._keys) > 1:
                    self._rotate_key()
                time.sleep(0.5 * (2**attempt))
        raise RuntimeError(f"Gemini embed_content failed after retries: {last}")

    def embed(self, texts: list[str]) -> list[list[float]]:
        import google.generativeai as genai

        out: list[list[float]] = []
        for idx, text in enumerate(texts):
            resp = self._call_with_retry(
                lambda t=text: genai.embed_content(
                    model=self._model,
                    content=t,
                    task_type="retrieval_document",
                    **self._extra_kwargs,
                )
            )
            vec = resp["embedding"]
            if (
                not isinstance(vec, list)
                or not vec
                or not isinstance(vec[0], (int, float))
            ):
                raise RuntimeError(
                    f"GeminiEmbedder: unexpected embed_content response shape "
                    f"for text #{idx} (got type={type(vec).__name__}). "
                    f"Response keys: {list(resp.keys()) if isinstance(resp, dict) else resp!r}"
                )
            if len(vec) != self._dim:
                raise RuntimeError(
                    f"GeminiEmbedder: model returned dim {len(vec)} != "
                    f"expected {self._dim} (text #{idx}). "
                    "Check GEMINI_EMBED_MODEL and EMBEDDING_DIM alignment."
                )
            out.append(list(self._l2_normalize(vec)))
        return out

    def embed_query(self, query: str) -> list[float]:
        import google.generativeai as genai

        resp = self._call_with_retry(
            lambda: genai.embed_content(
                model=self._model,
                content=query,
                task_type="retrieval_query",
                **self._extra_kwargs,
            )
        )
        return list(self._l2_normalize(resp["embedding"]))

    @staticmethod
    def _l2_normalize(vec) -> list[float]:
        s = sum(float(x) * float(x) for x in vec) ** 0.5
        if s == 0:
            return [float(x) for x in vec]
        return [float(x) / s for x in vec]


# ===========================================================================
# Factory / public API
# ===========================================================================

_embedder: EmbedderProtocol | None = None


def _build_embedder() -> EmbedderProtocol:
    from config import settings

    provider = (settings.EMBEDDER_PROVIDER or "sentence_transformer").strip().lower()
    if provider in ("gemini", "google"):
        return GeminiEmbedder()
    if provider in ("sentence_transformer", "sentence-transformer", "bge-m3", "local"):
        return SentenceTransformerEmbedder()
    raise ValueError(
        f"Unknown EMBEDDER_PROVIDER={provider!r}. "
        "Use 'gemini' or 'sentence_transformer'."
    )


def get_embedder() -> EmbedderProtocol:
    global _embedder
    if _embedder is None:
        _embedder = _build_embedder()
    return _embedder


def embed(texts: list[str]) -> list[list[float]]:
    return get_embedder().embed(texts)


@lru_cache(maxsize=512)
def _embed_query_cached(normalized_query: str) -> tuple[float, ...]:
    """Cached query embedding. Returns a tuple so it remains hashable."""
    return tuple(get_embedder().embed_query(normalized_query))


def embed_query(query: str) -> list[float]:
    """Embed query string; normalizes case and whitespace for cache reuse."""
    normalized = " ".join(query.strip().lower().split())
    return list(_embed_query_cached(normalized))
