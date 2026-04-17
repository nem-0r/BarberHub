"""
Build the ChromaDB vector index from documents in rag_core/data/.

Usage (from backend_fastapi/ root):
    python -m rag_core.ingest.build_index
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from rag_core.ingest.loader import load_all
from rag_core.ingest.chunker import FixedSizeChunker, RecursiveChunker
from rag_core.retrieval.vector_db import index_chunks, collection_stats

DATA_DIR = Path(__file__).parent.parent / "data"


def build_index(data_dir: Path = DATA_DIR) -> None:
    print("=" * 60)
    print("BarberHub RAG — Index Builder")
    print("=" * 60)

    print(f"\n[1/3] Loading documents from: {data_dir}")
    docs = load_all(data_dir)
    if not docs:
        print("ERROR: No documents found. Place PDF, DOCX, or MD files in data/")
        sys.exit(1)
    print(f"  Total: {len(docs)} document(s)")

    fixed_chunker     = FixedSizeChunker(chunk_tokens=256, overlap_tokens=38)
    recursive_chunker = RecursiveChunker(max_tokens=350, min_tokens=100)

    all_fixed:     list = []
    all_recursive: list = []

    print("\n[2/3] Chunking...")
    for doc in docs:
        fc = fixed_chunker.chunk(doc)
        rc = recursive_chunker.chunk(doc)
        print(f"  {doc['metadata']['source_file']}: fixed={len(fc)}, recursive={len(rc)}")
        all_fixed.extend(fc)
        all_recursive.extend(rc)

    print(f"  Total fixed chunks:     {len(all_fixed)}")
    print(f"  Total recursive chunks: {len(all_recursive)}")

    print("\n[3/3] Embedding and indexing into ChromaDB...")
    index_chunks(all_fixed,     strategy="fixed")
    index_chunks(all_recursive, strategy="recursive")

    stats = collection_stats()
    print("\n" + "=" * 60)
    print("Done. Collection sizes:")
    for name, count in stats.items():
        print(f"  {name}: {count} vectors")
    print("=" * 60)


if __name__ == "__main__":
    build_index()
