from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"

    @field_validator("ALGORITHM")
    @classmethod
    def algorithm_whitelist(cls, v: str) -> str:
        allowed = {"HS256", "HS384", "HS512"}
        if v not in allowed:
            raise ValueError(f"ALGORITHM must be one of {allowed}, got {v!r}")
        return v

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    REFRESH_COOKIE_NAME: str = "refresh_token"
    COOKIE_SECURE: bool = False
    COOKIE_SAMESITE: str = "lax"
    COOKIE_DOMAIN: str = ""  # empty → host-only cookie
    DEBUG: bool = False
    ENABLE_PROFILER: bool = False

    # --- Elasticsearch ---
    ELASTIC_ENABLED: bool = True
    ELASTIC_HOST: str = "localhost"
    ELASTIC_PORT: int = 9200

    @property
    def ELASTIC_URL(self) -> str:
        return f"http://{self.ELASTIC_HOST}:{self.ELASTIC_PORT}"

    # --- Background tasks ---
    # True: Celery+Redis. False: in-process BackgroundTasks+APScheduler.
    USE_CELERY: bool = True

    # --- Embedder ---
    EMBEDDER_PROVIDER: str = "sentence_transformer"
    EMBEDDING_DIM: int = 1024
    GEMINI_EMBED_MODEL: str = "models/gemini-embedding-2"

    # --- Redis ---
    REDIS_URL: str = ""
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    RATELIMIT_REDIS_DB: int = 3

    def effective_redis_url(self, db: int = 0) -> str:
        """Return a Redis URL for the requested DB.

        When ``REDIS_URL`` is set (prod / Upstash / any managed Redis), it is
        returned verbatim — the URL's own DB (usually /0) wins, regardless of
        ``db``. Otherwise we build a local URL from HOST/PORT and the per-
        component DB index, matching the historical behaviour.
        """
        if self.REDIS_URL:
            return self.REDIS_URL
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/{db}"

    # --- Database pool ---
    # Defaults are sized for Supabase's connection pooler, NOT a direct
    # connection. Math that bites under load: pool_size * gunicorn workers.
    # With WEB_CONCURRENCY=4 and pool_size=10 that is 40 + overflow — keep
    # it under your plan's connection cap.
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 5
    DB_POOL_RECYCLE: int = 1800
    # Set True when DATABASE_URL points at Supabase's transaction-mode pooler
    # (pgbouncer). Transaction pooling is incompatible with asyncpg's
    # server-side prepared-statement cache → we must disable it.
    DB_PGBOUNCER: bool = False
    # Alembic should NOT run DDL through the transaction pooler (pgbouncer
    # transaction mode breaks Alembic's session-level operations). Point this
    # at the DIRECT connection (port 5432) while DATABASE_URL points at the
    # pooler (6543). Empty → migrations fall back to DATABASE_URL.
    MIGRATION_DATABASE_URL: str = ""

    # SMTP (Brevo) — values must be set via .env, never hardcoded
    MAIL_USERNAME: str = ""
    MAIL_PASSWORD: str = ""
    MAIL_FROM: str = ""
    MAIL_PORT: int = 587
    MAIL_SERVER: str = ""
    MAIL_FROM_NAME: str = "Barbershop App"
    # When set, mail is sent via Brevo's Transactional Email HTTP API instead
    # of SMTP. Required on hosts that block outbound SMTP (e.g. Render Free,
    # which silently drops port 587). Generate at:
    # https://app.brevo.com → SMTP & API → API Keys (NOT the SMTP credentials).
    # Empty → fall back to the SMTP path (docker-compose dev, VPS deploys).
    BREVO_API_KEY: str = ""

    # Supabase
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    SUPABASE_BUCKET: str = "images"

    # Frontend Settings
    FRONTEND_URL: str = "http://localhost:3000"

    # Comma-separated list of trusted Host header values (e.g. "api.example.com,www.example.com").
    # Empty / "*" disables host validation — only acceptable in DEBUG.
    ALLOWED_HOSTS: str = "*"

    @property
    def allowed_hosts_list(self) -> list[str]:
        raw = (self.ALLOWED_HOSTS or "").strip()
        if not raw or raw == "*":
            return ["*"]
        return [h.strip() for h in raw.split(",") if h.strip()]

    # RAG vector store backend. "chroma" = legacy embedded ChromaDB (files in
    # the API process — not horizontally scalable). "pgvector" = vectors live
    # in Postgres/Supabase → API becomes stateless. Kept as a flag so prod can
    # roll back instantly without a redeploy. Flip to "pgvector" once the
    # pgvector index is built (see migration *_add_pgvector_rag).
    RAG_BACKEND: str = "chroma"

    # Gemini (RAG chatbot)
    GEMINI_API_KEY: str = ""
    GEMINI_API_KEY_2: str = ""
    GEMINI_API_KEY_3: str = ""

    # Google OAuth (Sign in with Google)
    GOOGLE_CLIENT_ID: str = ""

    def production_warnings(self) -> list[str]:
        """Misconfigurations that are fine in dev but dangerous in prod.

        Logged loudly at startup (see main.lifespan) instead of crashing —
        a hard failure on boot is worse than a screaming log when the only
        issue might be a forgotten env var on a fresh deploy.
        """
        if self.DEBUG:
            return []
        warnings: list[str] = []
        if self.allowed_hosts_list == ["*"]:
            warnings.append(
                "ALLOWED_HOSTS is '*' with DEBUG=False — Host header is not "
                "validated (Host-header injection risk). Set it to your domain(s)."
            )
        if not self.COOKIE_SECURE:
            warnings.append(
                "COOKIE_SECURE=False with DEBUG=False — the refresh cookie will "
                "be sent over plain HTTP. Set COOKIE_SECURE=True behind HTTPS."
            )
        if self.COOKIE_SAMESITE.lower() == "none" and not self.COOKIE_SECURE:
            warnings.append(
                "COOKIE_SAMESITE=none requires COOKIE_SECURE=True — browsers "
                "reject SameSite=None cookies without the Secure flag."
            )
        if len(self.SECRET_KEY) < 32:
            warnings.append(
                "SECRET_KEY is shorter than 32 chars — weak signing key for JWT. "
                "Use a long random value."
            )
        return warnings

    class Config:
        env_file = ".env"


settings = Settings()
