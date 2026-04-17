#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "Starting BarberHub Backend Entrypoint..."

# 1. Run database migrations
echo "Applying database migrations..."
alembic upgrade head

# 2. Build/Update RAG Vector Index
# This ensures that documents in rag_core/data/ are indexed in ChromaDB on startup
echo "Building RAG index..."
python3 -m rag_core.ingest.build_index

# 3. Start the FastAPI application
echo "Starting FastAPI server..."
# Using 0.0.0.0 to allow access from outside the container
exec uvicorn main:app --host 0.0.0.0 --port 8000
