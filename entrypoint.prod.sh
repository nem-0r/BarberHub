#!/bin/bash
# Production entrypoint. Dev still uses entrypoint.sh (single uvicorn).
# Referenced by docker-compose.prod.yml and (via Dockerfile.prod) render.yaml.
set -e

# ---------------------------------------------------------------------------
# Bootstrap a fresh DB (first prod deploy).
#
# Historic story: dev was bootstrapped with SQLModel.metadata.create_all() and
# alembic only carries deltas (no initial CREATE TABLE migration). A brand-new
# Supabase prod project therefore has no `salons`, `users`, etc., and the very
# first ALTER migration crashes with `relation "salons" does not exist`.
#
# Fix: if `alembic_version` is missing (truly fresh DB), run create_all() to
# materialise every SQLModel, then stamp alembic at the last revision before
# pgvector so the column-add migrations are skipped (the table already has the
# right columns from create_all). pgvector + the resize migration then run as
# normal "deltas" on top.
# ---------------------------------------------------------------------------

echo "[prod] Checking DB bootstrap state..."
NEEDS_BOOTSTRAP=$(python3 <<'PYEOF'
import os
from sqlalchemy import create_engine, inspect

raw_url = os.environ.get("MIGRATION_DATABASE_URL") or os.environ["DATABASE_URL"]
url = raw_url.replace("+asyncpg", "+psycopg2")
insp = inspect(create_engine(url))
print("1" if not insp.has_table("alembic_version") else "0")
PYEOF
)

if [ "$NEEDS_BOOTSTRAP" = "1" ]; then
    echo "[prod] Fresh DB detected — running SQLModel.metadata.create_all..."
    python3 <<'PYEOF'
import os
from sqlalchemy import create_engine
from app import register_models

register_models()
from sqlmodel import SQLModel

raw_url = os.environ.get("MIGRATION_DATABASE_URL") or os.environ["DATABASE_URL"]
url = raw_url.replace("+asyncpg", "+psycopg2")
engine = create_engine(url)
SQLModel.metadata.create_all(engine)
print("[prod] Base tables created via SQLModel.metadata")
PYEOF

    echo "[prod] Stamping alembic at e5f4a3b2c1d0 (last pre-pgvector revision)..."
    alembic stamp e5f4a3b2c1d0
fi

echo "[prod] Applying database migrations..."
alembic upgrade head

echo "[prod] Checking RAG index..."
NEED_INDEX=$(python3 -c "
from rag_core.retrieval.vector_db import collection_stats
try:
    stats = collection_stats()
    print('0' if stats and all(v > 0 for v in stats.values()) else '1')
except Exception:
    print('1')
")
if [ "${RAG_FORCE_REINDEX:-0}" = "1" ] || [ "$NEED_INDEX" = "1" ]; then
    echo "[prod] Building RAG index..."
    # Don't crash the container on a transient Gemini 429 — `set -e` would
    # otherwise abort boot before uvicorn starts, looping the deploy. If the
    # index build fails, /chat returns 503 until the next deploy retries.
    python3 -m rag_core.ingest.build_index || \
        echo "[prod] RAG index build failed — chat will 503 until the next boot retries."
else
    echo "[prod] RAG index already populated — skipping."
fi

# Single uvicorn worker. Render Free / Fly free have ~512 MB RAM and 0.1-0.25
# shared CPU — extra gunicorn workers would just thrash. ${PORT:-8000} lets
# the platform inject its own port (Render does, VPS uses 8000).
WORKERS="${WEB_CONCURRENCY:-1}"
PORT="${PORT:-8000}"
echo "[prod] Starting uvicorn on 0.0.0.0:${PORT} (workers=${WORKERS})..."
exec uvicorn main:app \
    --host 0.0.0.0 \
    --port "${PORT}" \
    --workers "${WORKERS}" \
    --timeout-keep-alive 30 \
    --access-log
