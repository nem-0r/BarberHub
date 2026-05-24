"""add pgvector rag store

Revision ID: f0e1d2c3b4a5
Revises: e5f4a3b2c1d0
Create Date: 2026-05-19 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op


revision: str = "f0e1d2c3b4a5"
down_revision: Union[str, Sequence[str], None] = "e5f4a3b2c1d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_EMBED_DIM = 1024


def upgrade() -> None:
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

    op.execute(
        "CREATE INDEX IF NOT EXISTS rag_chunks_strategy_idx ON rag_chunks (strategy)"
    )

    op.execute(
        "CREATE INDEX IF NOT EXISTS rag_chunks_embedding_idx "
        "ON rag_chunks USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS rag_chunks")
