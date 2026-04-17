# Python 3.9 slim — matches existing FastAPI project version
FROM python:3.9-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
# BGE-M3 model cache — persisted via Docker named volume
ENV SENTENCE_TRANSFORMERS_HOME=/model_cache

# System packages:
#   build-essential + libpq-dev — PostgreSQL / C extensions
#   libgomp1                    — OpenMP (required by torch/numpy)
#   git                         — some pip packages fetch from git
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    libgomp1 \
    git \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# Install CPU-only PyTorch first (saves ~1GB vs full torch)
RUN pip install --upgrade pip && \
    pip install --no-cache-dir \
        torch==2.6.0 \
        --index-url https://download.pytorch.org/whl/cpu

# Main FastAPI dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# RAG-specific dependencies
COPY rag_core/requirements.txt rag_core/requirements.txt
RUN pip install --no-cache-dir -r rag_core/requirements.txt

# Copy all source code
COPY . .

# Make entrypoint executable
RUN chmod +x entrypoint.sh

# Non-root user for security
RUN useradd -m appuser && \
    chown -R appuser /app && \
    mkdir -p /model_cache && \
    chown -R appuser /model_cache

USER appuser

EXPOSE 8000 5555

CMD ["./entrypoint.sh"]
