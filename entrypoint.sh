#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "Starting BarberHub Backend Entrypoint..."

# 1. Run database migrations
echo "Applying database migrations..."
alembic upgrade head

# 2. Build/Update RAG Vector Index — ONLY if the collection is empty.
# Re-embedding the corpus with BGE-M3 on CPU costs 30-120s and is pure waste
# when the chroma_data volume already holds vectors from a previous start.
# Set RAG_FORCE_REINDEX=1 to rebuild anyway (e.g. after changing docs).
echo "Checking RAG index..."
NEED_INDEX=$(python3 -c "
from rag_core.retrieval.vector_db import collection_stats
try:
    stats = collection_stats()
    print('0' if stats and all(v > 0 for v in stats.values()) else '1')
except Exception:
    print('1')
")
if [ "${RAG_FORCE_REINDEX:-0}" = "1" ] || [ "$NEED_INDEX" = "1" ]; then
    echo "Building RAG index..."
    python3 -m rag_core.ingest.build_index
else
    echo "RAG index already populated — skipping rebuild."
fi

# 3. Start the FastAPI application
echo "Starting FastAPI server..."
# Using 0.0.0.0 to allow access from outside the container
exec uvicorn main:app --host 0.0.0.0 --port 8000
