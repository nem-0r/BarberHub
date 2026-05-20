"""add pgvector rag store

Moves the RAG vector store out of the embedded ChromaDB files (which live
inside the API process and block horizontal scaling) into Postgres via the
pgvector extension. The two former Chroma collections (chunks_fixed,
chunks_recursive) collapse into ONE table with a `strategy` column.

Raw SQL on purpose: the `vector` type is unknown to SQLAlchemy/Alembic
autogenerate, so this migration is written by hand.

Revision ID: f0e1d2c3b4a5
Revises: e5f4a3b2c1d0
Create Date: 2026-05-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'f0e1d2c3b4a5'
down_revision: Union[str, Sequence[str], None] = 'e5f4a3b2c1d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# BGE-M3 dense embedding dimensionality. If the embedder ever changes,
# this and rag_core/retrieval/vector_db.py must move together.
_EMBED_DIM = 1024


def upgrade() -> None:
    # Idempotent: Supabase may already have the extension enabled via the
    # dashboard. CREATE EXTENSION IF NOT EXISTS is safe either way.
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.execute(
        f"""
        CREATE TABLE IF NOT EXISTS rag_chunks (
            id        TEXT PRIMARY KEY,
            strategy  TEXT NOT NULL,
            text      TEXT NOT NULL,
            embedding vector({_EMBED_DIM}) NOT NULL,
            metadata  JSONB NOT NULL DEFAULT '{{}}'::jsonb
        )
        """
    )

    # Filter by strategy ('fixed' | 'recursive') before/with the ANN search.
    op.execute(
        "CREATE INDEX IF NOT EXISTS rag_chunks_strategy_idx "
        "ON rag_chunks (strategy)"
    )

    # HNSW for approximate nearest-neighbour. cosine ops because BGE-M3
    # embeddings are L2-normalized → cosine distance matches Chroma's
    # previous 'hnsw:space=cosine' behaviour and the same 0.35 threshold.
    op.execute(
        "CREATE INDEX IF NOT EXISTS rag_chunks_embedding_idx "
        "ON rag_chunks USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS rag_chunks")
    # Deliberately NOT dropping the `vector` extension: it is harmless to
    # keep, may be shared, and dropping it on a managed DB (Supabase) can
    # require elevated privileges. Re-running upgrade is still idempotent.
