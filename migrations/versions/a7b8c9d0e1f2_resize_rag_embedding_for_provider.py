"""resize rag_chunks.embedding for embedder provider

Reads the target dimensionality from the EMBEDDING_DIM env var (matches
settings.EMBEDDING_DIM in config.py). If the current column already has the
target width, the migration is a no-op — safe for an existing dev DB that
stays on 1024-dim BGE-M3.

For a fresh prod Supabase project where EMBEDDING_DIM=768 is set, this
shrinks the column from the old 1024 to 768 right after the previous
migration created it. The table is truncated as part of the resize because
pgvector cannot widen/narrow an existing column with data.

A re-embed pass (entrypoint.sh / build_index.py) repopulates the empty
table at boot.

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
    """Return the dim stored in pg_attribute.atttypmod (minus the 4-byte
    pgvector header) for rag_chunks.embedding, or None if missing."""
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
        # rag_chunks doesn't exist yet — earlier migration didn't run? Bail
        # quietly so this migration is replay-safe in odd states.
        return
    if current == target_dim:
        return  # no-op, dims already aligned

    bind.execute(text("DROP INDEX IF EXISTS rag_chunks_embedding_idx"))
    # TRUNCATE: pgvector forbids ALTER TYPE between dims when rows exist.
    # Re-population happens via build_index.py at next container boot.
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
    # Revert to 1024 (BGE-M3 default). Same destructive pattern.
    bind = op.get_bind()
    current = _current_dim(bind)
    if current is None or current == 1024:
        return
    bind.execute(text("DROP INDEX IF EXISTS rag_chunks_embedding_idx"))
    bind.execute(text("TRUNCATE rag_chunks"))
    bind.execute(text("ALTER TABLE rag_chunks ALTER COLUMN embedding TYPE vector(1024)"))
    bind.execute(
        text(
            "CREATE INDEX rag_chunks_embedding_idx "
            "ON rag_chunks USING hnsw (embedding vector_cosine_ops)"
        )
    )
