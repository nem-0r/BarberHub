from __future__ import annotations

import re
from dataclasses import dataclass, field

from rag_core.ingest.loader import DocChunk


@dataclass
class Chunk:
    text: str
    chunk_index: int
    strategy: str
    metadata: dict = field(default_factory=dict)


def _approx_tokens(text: str) -> int:
    # ~4 chars per token
    return max(1, len(text) // 4)


def _word_split(text: str, max_tokens: int) -> list[str]:
    """Hard split by words when nothing else fits."""
    words = text.split()
    segments: list[str] = []
    current: list[str] = []
    current_len = 0
    for word in words:
        wlen = _approx_tokens(word) + 1
        if current_len + wlen > max_tokens and current:
            segments.append(" ".join(current))
            current, current_len = [], 0
        current.append(word)
        current_len += wlen
    if current:
        segments.append(" ".join(current))
    return segments


class FixedSizeChunker:
    """Fixed-size windows with overlap (default: 256 tokens, 38-token overlap)."""

    def __init__(self, chunk_tokens: int = 256, overlap_tokens: int = 38):
        assert 100 <= chunk_tokens <= 512, "chunk_tokens must be in [100, 512]"
        assert 0 <= overlap_tokens < chunk_tokens
        self.chunk_tokens = chunk_tokens
        self.overlap_tokens = overlap_tokens

    def chunk(self, doc: DocChunk) -> list[Chunk]:
        words = doc["text"].split()
        step = self.chunk_tokens - self.overlap_tokens

        tok_per_word = 1.3  # ~1.3 tokens per word
        word_window = max(1, int(self.chunk_tokens / tok_per_word))
        word_step = max(1, int(step / tok_per_word))

        chunks: list[Chunk] = []
        i = 0
        idx = 0
        while i < len(words):
            window = words[i : i + word_window]
            text = " ".join(window)
            if _approx_tokens(text) >= 100:
                chunks.append(
                    Chunk(
                        text=text,
                        chunk_index=idx,
                        strategy="fixed",
                        metadata={**doc["metadata"], "chunk_strategy": "fixed"},
                    )
                )
                idx += 1
            i += word_step

        return chunks


class RecursiveChunker:
    """Splits on paragraphs, then sentences, then words. Merges short pieces."""

    def __init__(self, max_tokens: int = 350, min_tokens: int = 100):
        assert 100 <= max_tokens <= 512
        self.max_tokens = max_tokens
        self.min_tokens = min_tokens

    def _para_split(self, text: str) -> list[str]:
        return [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]

    def _sentence_split(self, text: str) -> list[str]:
        parts = re.split(r"(?<=[.!?…])\s+", text)
        return [p.strip() for p in parts if p.strip()]

    def _split_to_fit(self, text: str) -> list[str]:
        if _approx_tokens(text) <= self.max_tokens:
            return [text]

        paras = self._para_split(text)
        if len(paras) > 1:
            result: list[str] = []
            for p in paras:
                result.extend(self._split_to_fit(p))
            return result

        sents = self._sentence_split(text)
        if len(sents) > 1:
            result = []
            for s in sents:
                result.extend(self._split_to_fit(s))
            return result

        return _word_split(text, self.max_tokens)

    def _merge_short(self, pieces: list[str]) -> list[str]:
        """Merge adjacent short pieces so no chunk is smaller than min_tokens."""
        merged: list[str] = []
        buffer = ""
        for piece in pieces:
            candidate = (buffer + " " + piece).strip() if buffer else piece
            if _approx_tokens(candidate) <= self.max_tokens:
                buffer = candidate
            else:
                if buffer:
                    merged.append(buffer)
                buffer = piece
        if buffer:
            merged.append(buffer)
        return merged

    def chunk(self, doc: DocChunk) -> list[Chunk]:
        raw_pieces = self._split_to_fit(doc["text"])
        merged = self._merge_short(raw_pieces)

        chunks: list[Chunk] = []
        for idx, text in enumerate(merged):
            if _approx_tokens(text) < 50:  # skip noise fragments
                continue
            chunks.append(
                Chunk(
                    text=text,
                    chunk_index=idx,
                    strategy="recursive",
                    metadata={**doc["metadata"], "chunk_strategy": "recursive"},
                )
            )
        return chunks
