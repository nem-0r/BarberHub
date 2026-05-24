# BarberHub

A production-style booking platform for barbershops, built as a full-stack
application with an async FastAPI backend, a Next.js frontend, background job
processing, and an integrated AI assistant (RAG) plus a machine-learning
classifier for staff skill grading.

> Single-developer project demonstrating end-to-end backend engineering:
> async APIs, authentication, vector search, distributed task queues,
> containerized deployment, and CI.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [API Overview](#api-overview)
- [RAG Assistant](#rag-assistant)
- [ML Skill Classifier](#ml-skill-classifier)
- [Background Jobs](#background-jobs)
- [Testing](#testing)
- [Deployment](#deployment)
- [CI/CD](#cicd)

---

## Overview

BarberHub lets salon owners manage staff, services, and schedules, and lets
clients browse salons and book appointments. On top of the core booking domain,
it ships two AI features:

- A **RAG chatbot** that answers user questions grounded in salon/service data,
  using local embeddings and a PostgreSQL vector store.
- An **ML classifier** that predicts a barber's skill tier (Junior → Master)
  from their skills, experience, and education.

The backend is fully asynchronous, organized into ten domain modules, and
designed to run as a small set of containers (API, workers, scheduler, cache,
reverse proxy, frontend).

## Features

**Booking domain**
- Salons, staff, services, staff–service links, weekly schedules, bookings, reviews
- Availability calculation with timezone-aware slot generation
- Concurrency-safe booking to prevent double-booking the same slot

**Authentication & security**
- JWT access tokens + refresh tokens with **rotation and a Redis JTI blocklist**
  (a used refresh token is revoked, enabling stolen-token detection)
- Google OAuth sign-in
- Role-based access control (owner / admin / client)
- Email verification and password reset flows
- Per-route rate limiting backed by Redis
- `bcrypt` password hashing, `TrustedHost` and CORS hardening

**AI / ML**
- Retrieval-augmented chatbot with streaming responses (Server-Sent Events)
- Local BGE-M3 embeddings; PostgreSQL `pgvector` store with an HNSW cosine index
- Multi-key Gemini rotation to stay within per-key rate limits
- scikit-learn skill classifier served behind an authenticated endpoint

**Platform**
- Async REST API (FastAPI + `asyncpg`)
- Background workers (Celery + Redis) with a scheduler for periodic jobs
- Request logging to Elasticsearch and optional profiling middleware
- Readiness probe, Docker Compose stack, and GitHub Actions CI

## Architecture

```
                          HTTPS
                            │
                      ┌─────▼─────┐
                      │   Caddy   │  auto-HTTPS reverse proxy
                      └──┬─────┬──┘
              /api/* ,   │     │   /
              app routes │     │   static + SSR
                   ┌─────▼──┐  └──────────┐
                   │ FastAPI│             │
                   │  (API) │        ┌────▼─────┐
                   └─┬───┬──┘        │ Next.js  │
        enqueue jobs │   │ query     │ frontend │
                ┌────▼┐  │           └──────────┘
                │Redis│  │
                └──┬──┘  │
        ┌──────────┼─────┼───────────────┐
        │          │     │               │
   ┌────▼────┐ ┌───▼───┐ │          ┌─────▼──────┐
   │ Celery  │ │ Celery│ │          │ PostgreSQL │
   │ images  │ │ email │ │          │ + pgvector │
   └─────────┘ └───────┘ │          │   (HNSW)   │
   ┌─────────┐           │          └─────▲──────┘
   │  Beat   │ periodic  │   embeddings   │
   └─────────┘           │  (BGE-M3 local)│
                    ┌────▼─────────┐      │
                    │ RAG pipeline │──────┘
                    └──────┬───────┘
                           │ generation
                     ┌─────▼──────┐
                     │ Gemini API │  (round-robin keys)
                     └────────────┘

   Cross-cutting: Elasticsearch (request logs) · Flower (Celery monitoring)
```

Request flow: the API handles synchronous reads/writes against PostgreSQL and
enqueues slow I/O (email, image processing) to Celery so the request path stays
fast. The RAG pipeline embeds queries locally, retrieves context from pgvector,
and grounds the answer with Gemini.

## Tech Stack

| Layer | Technologies |
|---|---|
| Language | Python 3.11, TypeScript |
| API | FastAPI, Uvicorn/Gunicorn, async/await, `asyncpg` |
| Data modeling | SQLModel, SQLAlchemy 2.0, Pydantic v2, Alembic |
| Database | PostgreSQL + `pgvector` (HNSW); Supabase in production |
| Cache / broker | Redis |
| Background jobs | Celery, Celery Beat, APScheduler (free-tier fallback) |
| AI / RAG | BGE-M3 (sentence-transformers), Gemini API, custom retrieval pipeline |
| ML | scikit-learn (Random Forest, GridSearchCV), pandas, joblib |
| Auth | JWT (`python-jose`), Google OAuth, `bcrypt`, RBAC |
| Storage / email | Supabase Storage (S3-compatible), Brevo (SMTP + HTTP API) |
| Observability | Elasticsearch (request logs), Flower, Pyinstrument |
| Frontend | Next.js 16 (App Router), React, React Query, Radix UI, Tailwind CSS |
| Infra | Docker, Docker Compose, Caddy, GitHub Actions |

## Project Structure

```
backend_fastapi/
├── app/
│   ├── users/            # auth, JWT/OAuth, RBAC, email verify, password reset
│   ├── salons/           # salon CRUD, search/sort, stats
│   ├── staff/            # barbers
│   ├── services/         # offered services
│   ├── staff_services/   # barber↔service links
│   ├── schedules/        # weekly schedules, availability
│   ├── bookings/         # appointments, slot calculation, cancel/status
│   ├── reviews/          # ratings & reviews
│   ├── rag/              # chatbot routes + service (warmup, readiness)
│   ├── ml/               # skill-classifier endpoint
│   ├── tasks/            # Celery tasks (email, images), beat, scheduler
│   ├── middleware/       # request logging, profiler
│   ├── dependencies.py   # auth/session dependencies, user cache
│   ├── limiter.py        # rate limiter
│   └── pagination.py     # shared pagination params
├── rag_core/             # ingestion, retrieval, generation, embeddings, eval
│   ├── ingest/
│   ├── retrieval/        # vector_db facade (pgvector / chroma backends)
│   └── generation/       # Gemini key rotator, RAG pipeline
├── ml/                   # dataset, training, trained model, report
├── migrations/           # Alembic migrations (schema, indexes, pgvector)
├── frontend/             # Next.js app
├── main.py               # FastAPI app, middleware, lifespan, health
├── config.py             # pydantic-settings configuration
├── database.py           # async engine / session
├── docker-compose.yml        # local development
├── docker-compose.prod.yml   # production stack
├── Caddyfile / render.yaml   # deployment config
└── .github/workflows/ci.yml  # CI
```

## Getting Started

### Prerequisites

- Docker and Docker Compose
- A Gemini API key for the chatbot; Google OAuth and Brevo (email) keys are
  optional and only needed to exercise those features

The Compose stack bundles a `pgvector`-enabled PostgreSQL, Redis, and a local
BGE-M3 model cache, so nothing else has to be installed to run it. Production
points `DATABASE_URL` at a managed Postgres (Supabase) instead.

### Quick start (local)

```bash
# 1. clone
git clone https://github.com/nem-0r/barberhub.git
cd barberhub

# 2. configure
cp .env.example .env
# set SECRET_KEY and GEMINI_API_KEY. DATABASE_URL is optional — leave it unset
# to use the bundled Postgres, or set it to point at Supabase instead.

# 3. run the full stack
docker compose up --build

# API:      http://localhost:8000
# Swagger:  http://localhost:8000/docs
# Frontend: http://localhost:3000
# Flower:   http://localhost:5555
```

On the first start the entrypoint runs migrations (`alembic upgrade head`),
downloads the BGE-M3 model into a cached volume, and builds the vector index,
so the initial boot takes a few minutes. Later starts reuse the cache and skip
the rebuild (set `RAG_FORCE_REINDEX=1` to rebuild after changing the corpus).

### Local backend without Docker

Needs a reachable Postgres (with `pgvector`) and Redis. The simplest option is
to start just those from Compose and point the app at them:

```bash
docker compose up -d postgres redis
# in .env: DATABASE_URL=postgresql+asyncpg://barberhub:barberhub@localhost:5432/barberhub

python -m venv venv && source venv/bin/activate
pip install -r requirements-dev.txt
alembic upgrade head
uvicorn main:app --reload
```

## Configuration

Configuration is loaded from environment variables via `pydantic-settings`
(`config.py`). Key variables:

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | Async Postgres connection (asyncpg) | bundled local Postgres (Compose) |
| `MIGRATION_DATABASE_URL` | Direct (non-pooler) connection for Alembic; falls back to `DATABASE_URL` | — |
| `SECRET_KEY` | JWT signing key | — |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access token TTL | `30` |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Refresh token TTL | `30` |
| `RAG_BACKEND` | Vector store: `pgvector` or `chroma` | `chroma` (Compose sets `pgvector`) |
| `EMBEDDER_PROVIDER` | `sentence_transformer` (local) or `gemini` | `sentence_transformer` |
| `GEMINI_API_KEY` (+ `_2`, `_3`) | Gemini keys for rotation | — |
| `GOOGLE_CLIENT_ID` | Google OAuth client | — |
| `USE_CELERY` | Celery workers vs in-process scheduler | `True` |
| `REDIS_URL` / `REDIS_HOST` | Redis connection | — |
| `DB_PGBOUNCER` | Use Supabase transaction pooler | `False` |
| `SUPABASE_URL` / `SUPABASE_KEY` / `SUPABASE_BUCKET` | Image storage | — |
| `BREVO_API_KEY` / `MAIL_*` | Email transport | — |
| `FRONTEND_URL` | CORS origin | `http://localhost:3000` |
| `DEBUG` | Verbose errors, relaxed CORS | `False` |

See `.env.example` for the complete list. Secrets are never committed.

## API Overview

Interactive docs at `/docs` (Swagger) and `/redoc`. Routers:

| Prefix | Module | Highlights |
|---|---|---|
| `/users` | Auth & accounts | `register`, `login`, `refresh`, `logout`, `oauth/google`, `forgot-password`, `reset-password/{token}`, `verify/{token}`, `me`, `me/avatar` |
| `/salons` | Salons | list (search/sort/paginate), CRUD, `{id}/stats`, image upload |
| `/staff` | Barbers | CRUD, image upload, by salon |
| `/services` | Services | CRUD, by salon |
| `/staff-services` | Links | assign/unassign services to barbers |
| `/schedules` | Schedules | weekly schedule CRUD, availability |
| `/bookings` | Appointments | create, list, `{id}/status`, `{id}/cancel`, available slots |
| `/reviews` | Reviews | create, list by salon/staff |
| `/api/chat`, `/api/chat/stream` | RAG | chatbot (JSON + SSE streaming) |
| `/ml/evaluate-barber` | ML | skill-tier prediction |
| `/health` | Ops | readiness probe (DB + Redis + RAG) |

## RAG Assistant

The retrieval pipeline lives in `rag_core/` and is wired into the API via
`app/rag/`:

1. **Ingestion** — source documents are chunked (fixed and recursive strategies)
   and embedded.
2. **Embeddings** — BGE-M3 runs locally (cached in a Docker volume), so there is
   no per-request embedding API cost. A Gemini embedding provider is available as
   an alternative for memory-constrained deployments.
3. **Vector store** — chunks are stored in PostgreSQL via `pgvector` with an
   **HNSW** index using `vector_cosine_ops`. The store sits behind a small
   backend-agnostic facade (`vector_db.py`) so the implementation can be swapped
   (`pgvector` / `chroma`) via `RAG_BACKEND`.
4. **Retrieval** — top-k similarity search with a cosine threshold; results are
   cached to skip redundant searches for repeated queries.
5. **Generation** — retrieved context is grounded into a Gemini prompt. A
   round-robin **key rotator** (`rag_core/generation/rotator.py`) cycles across
   multiple Gemini keys to stay under per-key rate limits, with model fallback
   ordering.

The model is loaded lazily at startup as a background task; `/api/chat`
endpoints return `503` until warmup completes (surfaced via `/health`).

## ML Skill Classifier

Located in `ml/`. A Random Forest classifier predicts a barber's skill tier
(Junior / Middle / Senior / Top) from engineered features (weighted skill
scores, ordinal experience, skill-breadth counts).

- Trained on a **131-row synthetic dataset** modeled on Kazakhstan market data,
  including deliberate edge cases.
- Tuned with `GridSearchCV` (cross-validated); reaches **88.9% test accuracy /
  89.0% weighted F1**, improving on a Decision Tree baseline (81.5%).
- Served live through the authenticated `/ml/evaluate-barber` endpoint.

Full methodology and plots are in `ml/Report.md`.

## Background Jobs

Slow I/O is offloaded from the request path to Celery workers (Redis broker):

- **Email** — verification, password reset, notifications (Brevo).
- **Images** — avatar/salon image compression (Pillow) with a decompression
  guard, then upload to Supabase Storage.
- **Periodic** — appointment reminders via Celery Beat.

For free-tier single-process deployments (`USE_CELERY=False`), periodic jobs run
in-process via APScheduler instead of a dedicated beat container.

## Testing

```bash
pytest -v
```

Test suites (`tests/`) cover smoke checks, core business logic, and **booking
concurrency** — verifying the system rejects double-booking the same slot under
simultaneous requests.

## Deployment

The production stack (`docker-compose.prod.yml`) runs:

`caddy` (auto-HTTPS reverse proxy) · `app` (Gunicorn/Uvicorn) ·
`worker-images` · `worker-email` · `beat` · `flower` · `redis` · `frontend`.

Production hardening includes:

- Separate prod Dockerfiles and entrypoint (`Dockerfile.prod`, `entrypoint.prod.sh`)
- Redis-backed rate limiting (no in-memory state across workers)
- Generic client-facing error responses (no internal leakage) with full
  server-side logging
- A `/health` readiness probe with a hard timeout so orchestrators stop routing
  to a broken instance instead of looping deploys
- Connection pooling tuned for Supabase's transaction pooler
- `render.yaml` for managed deployment

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs on every push:

- **Backend** — installs dependencies, runs `alembic upgrade head` against a
  test database, then `pytest`.
- **Frontend** — installs with a frozen lockfile and runs the production build.

---

*BarberHub — built to practice production backend engineering end to end.*
