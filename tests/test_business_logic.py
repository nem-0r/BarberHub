"""Business-logic tests — no DB/Redis required.

Proves the invariants a reviewer will ask about:
  * the booking state machine cannot make illegal jumps,
  * production misconfig is detected,
  * the rate-limiter is backed by a shared store (not per-worker memory).

DB-bound concurrency tests (double-booking under load) belong in a
separate suite that spins up Postgres in CI services — tracked in advice.md.
"""

from app.bookings.service import ALLOWED_TRANSITIONS
from app.bookings.models import BookingStatus
from config import Settings
from app.limiter import limiter


# --- Booking state machine ----------------------------------------------

TERMINAL = {BookingStatus.cancelled, BookingStatus.completed, BookingStatus.no_show}


def test_every_status_has_a_transition_rule():
    """No status may be missing from the map — an unmapped status would
    silently allow/deny transitions depending on the .get() default."""
    for status in BookingStatus:
        assert status in ALLOWED_TRANSITIONS


def test_terminal_states_are_dead_ends():
    for status in TERMINAL:
        assert ALLOWED_TRANSITIONS[status] == [], f"{status} must be terminal"


def test_pending_can_only_confirm_or_cancel():
    assert set(ALLOWED_TRANSITIONS[BookingStatus.pending]) == {
        BookingStatus.confirmed,
        BookingStatus.cancelled,
    }


def test_confirmed_cannot_jump_back_to_pending():
    assert BookingStatus.pending not in ALLOWED_TRANSITIONS[BookingStatus.confirmed]


def test_confirmed_terminal_options():
    assert set(ALLOWED_TRANSITIONS[BookingStatus.confirmed]) == {
        BookingStatus.completed,
        BookingStatus.cancelled,
        BookingStatus.no_show,
    }


# --- Production config guard ---------------------------------------------

_BASE = dict(DATABASE_URL="postgresql+asyncpg://t:t@localhost/t",
             SECRET_KEY="x" * 40)


def test_debug_mode_suppresses_warnings():
    s = Settings(DEBUG=True, ALLOWED_HOSTS="*", COOKIE_SECURE=False, **_BASE)
    assert s.production_warnings() == []


def test_prod_flags_insecure_defaults():
    s = Settings(DEBUG=False, ALLOWED_HOSTS="*", COOKIE_SECURE=False, **_BASE)
    joined = " ".join(s.production_warnings())
    assert "ALLOWED_HOSTS" in joined
    assert "COOKIE_SECURE" in joined


def test_prod_samesite_none_requires_secure():
    s = Settings(DEBUG=False, ALLOWED_HOSTS="example.com",
                 COOKIE_SECURE=False, COOKIE_SAMESITE="none", **_BASE)
    assert any("SameSite=None" in w for w in s.production_warnings())


def test_prod_weak_secret_key_flagged():
    s = Settings(DEBUG=False, ALLOWED_HOSTS="example.com",
                 COOKIE_SECURE=True, SECRET_KEY="short",
                 DATABASE_URL=_BASE["DATABASE_URL"])
    assert any("SECRET_KEY" in w for w in s.production_warnings())


def test_hardened_prod_config_is_clean():
    s = Settings(DEBUG=False, ALLOWED_HOSTS="example.com",
                 COOKIE_SECURE=True, COOKIE_SAMESITE="lax", **_BASE)
    assert s.production_warnings() == []


# --- Rate limiter --------------------------------------------------------

def test_rate_limiter_uses_shared_redis_store():
    """Per-worker in-memory counters do not actually enforce limits under
    gunicorn. The storage backend must be Redis."""
    assert "redis://" in (limiter._storage_uri or "")


# --- RAG vector-store facade (pgvector migration) ------------------------

from rag_core.retrieval import vector_db as vdb
from rag_core.ingest.chunker import Chunk


def test_rag_backend_defaults_to_chroma():
    """Rollback safety: the pgvector path must NOT activate until the flag
    is explicitly flipped, so a deploy can't break the chatbot silently."""
    assert vdb._backend() == "chroma"


def test_metadata_shape_is_backend_agnostic():
    """Both backends store/return this exact shape — downstream code (the
    prompt builder) must not care which store answered."""
    c = Chunk(text="hi", chunk_index=7, strategy="ignored",
              metadata={"source_file": "faq.md", "title": "FAQ",
                        "date": "2026", "doc_type": "md"})
    m = vdb._build_metadata(c, "recursive")
    assert set(m) == {"source_file", "title", "date", "doc_type",
                      "chunk_index", "chunk_strategy"}
    assert m["chunk_index"] == 7
    assert m["chunk_strategy"] == "recursive"
    assert m["source_file"] == "faq.md"


def test_chunk_id_is_stable_and_strategy_scoped():
    c = Chunk(text="x", chunk_index=3, strategy="s",
              metadata={"source_file": "guide.md"})
    assert vdb._chunk_id(c, "fixed") == "fixed_guide.md_3"
    # Same chunk under another strategy → different id (no collision across
    # the two strategies now sharing one table).
    assert vdb._chunk_id(c, "recursive") != vdb._chunk_id(c, "fixed")


def test_vector_literal_roundtrips_to_floats():
    """pgvector ingests embeddings as a bracketed text literal cast to
    ::vector — the literal must parse back to the same numbers."""
    vec = [0.1, -0.25, 1.0, 0.0]
    lit = vdb._vec_literal(vec)
    assert lit.startswith("[") and lit.endswith("]")
    parsed = [float(x) for x in lit[1:-1].split(",")]
    assert parsed == [round(v, 8) for v in vec]
