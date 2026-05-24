"""resize rag_chunks.embedding for embedder provider

Revision ID: a7b8c9d0e1f2
Revises: f0e1d2c3b4a5
Create Date: 2026-05-20 00:00:00.000000
"""

from __future__ import annotations

import os
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text


revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, Sequence[str], None] = "f0e1d2c3b4a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _current_dim(conn) -> int | None:
    """Return current vector dim for rag_chunks.embedding, or None."""
    row = conn.execute(
        text(
            """
            SELECT atttypmod - 4 AS dim
            FROM   pg_attribute
            WHERE  attrelid = 'rag_chunks'::regclass
            AND    attname  = 'embedding'
            AND    NOT attisdropped
            """
        )
    ).first()
    return int(row[0]) if row and row[0] and row[0] > 0 else None


def upgrade() -> None:
    target_dim = int(os.environ.get("EMBEDDING_DIM", "1024"))
    bind = op.get_bind()

    current = _current_dim(bind)
    if current is None:
        return
    if current == target_dim:
        return

    bind.execute(text("DROP INDEX IF EXISTS rag_chunks_embedding_idx"))
    bind.execute(text("TRUNCATE rag_chunks"))
    bind.execute(
        text(f"ALTER TABLE rag_chunks ALTER COLUMN embedding TYPE vector({target_dim})")
    )
    bind.execute(
        text(
            "CREATE INDEX rag_chunks_embedding_idx "
            "ON rag_chunks USING hnsw (embedding vector_cosine_ops)"
        )
    )


def downgrade() -> None:
    bind = op.get_bind()
    current = _current_dim(bind)
    if current is None or current == 1024:
        return
    bind.execute(text("DROP INDEX IF EXISTS rag_chunks_embedding_idx"))
    bind.execute(text("TRUNCATE rag_chunks"))
    bind.execute(
        text("ALTER TABLE rag_chunks ALTER COLUMN embedding TYPE vector(1024)")
    )
    bind.execute(
        text(
            "CREATE INDEX rag_chunks_embedding_idx "
            "ON rag_chunks USING hnsw (embedding vector_cosine_ops)"
        )
    )
