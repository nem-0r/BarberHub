#!/bin/bash
# Production entrypoint. Dev still uses entrypoint.sh (single uvicorn).
# Referenced by docker-compose.prod.yml and (via Dockerfile.prod) render.yaml.
set -e

echo "[prod] Applying database migrations..."
# Use MIGRATION_DATABASE_URL (direct port 5432) if set, so Alembic doesn't
# run DDL through pgbouncer's transaction pooler.
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
    python3 -m rag_core.ingest.build_index
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
