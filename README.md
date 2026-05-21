# BarberHub RAG & API Architecture

BarberHub is a production-grade backend application demonstrating a complete Next.js and FastAPI stack combined with an advanced RAG (Retrieval-Augmented Generation) AI Assistant. The system handles business logic (bookings, online salon management) and provides AI-driven contextual assistance to users.


Key Technologies

- **Frontend:** Next.js (App Router), React Context API, TailwindCSS
- **Backend Core:** Python 3.10+, FastAPI (ASGI), Uvicorn
- **Database & ORM:** PostgreSQL (via Supabase), asyncpg, SQLModel (Pydantic + SQLAlchemy)
- **AI/RAG Pipeline:** ChromaDB (Vector Store), BGE-M3 (Local Embeddings), Gemini Flash Lite LLM
- **Background Tasks:** Celery + Redis 7 (Message Broker) for Emails/Images
- **Monitoring & Logging:** Elasticsearch, Flower

## System Architecture Details

### 1. Asynchronous API Layer

The core API is fully asynchronous utilizing `FastAPI` and `asyncpg`. Authentication is implemented via robust JWT tokens (`python-jose`) and `bcrypt` password hashing. Middlewares are strategically used for logging requests directly to `Elasticsearch` and profiling endpoints without blocking the main event loop.

### 2. Scalable Background Processing

To keep the REST API highly responsive, heavy I/O and processing tasks are offloaded to **Celery Workers**.

- Sending notifications/emails using `fastapi-mail` and SMTP Brevo.
- Compressing uploaded avatars/images via `Pillow` before uploading to **Supabase Storage**.
- Time-based triggers (like appointment reminders) handled by **Celery Beat**.

### 3. RAG AI Assistant integration

Instead of relying on basic LLM APIs, BarberHub incorporates a scalable RAG engine:

- User inquiries are transformed into embeddings locally via `BGE-M3` (hosted directly in the Docker Model Cache volume to avoid recurring API transfer costs).
- Context is retrieved from a local cluster of `ChromaDB`.
- System reliability is guaranteed via an API Key Rotation script managing multiple Gemini API limits simultaneously, guaranteeing 99% uptime for the chatbot inference layer.

### 4. Containerization

The entire stack is containerized with **Docker Compose**, running multiple microservices isolated on shared networks (Redis, Elasticsearch, App, Worker, Beat, Frontend) enabling one-click deployment.

## Getting Started

### Prerequisites

- Docker and Docker Compose installed.
- Setup a PostgreSQL database on Supabase and retrieve your `.env` connection strings.

### Launching the Stack

1. Clone the repository
2. Fill out your `.env` file referencing `.env.example`
3. Run: `docker-compose up --build -d`
4. Access the API at `http://localhost:8000/docs`
5. Access the Next.js Frontend at `http://localhost:3000`

---

*Built as a scalable architectural blueprint for modern LLM-integrated platforms.*
