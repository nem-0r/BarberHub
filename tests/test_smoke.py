"""Smoke tests — no infra required. Catch the most common deploy regressions:
app fails to import, routes vanish, request validation breaks.
"""


def test_root_ok(client):
    r = client.get("/")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_health_shape(client):
    """/health may be 200 (infra up) or 503 (CI without DB/Redis) — but the
    contract (status + per-dependency checks) must always hold."""
    r = client.get("/health")
    assert r.status_code in (200, 503)
    body = r.json()
    assert body["status"] in ("ok", "degraded")
    assert "database" in body["checks"]
    assert "redis" in body["checks"]


def test_openapi_exposes_core_routes(client):
    paths = client.get("/openapi.json").json()["paths"]
    assert "/users/login" in paths
    assert "/users/oauth/google" in paths       # Google OAuth wired
    assert "/users/refresh" in paths            # refresh-token flow wired
    assert "/ml/evaluate-barber" in paths
    assert "/api/chat" in paths


def test_refresh_without_cookie_is_401(client):
    """Refresh must reject when no httpOnly refresh cookie is present."""
    r = client.post("/users/refresh")
    assert r.status_code == 401


def test_register_validation_rejects_bad_body(client):
    """FastAPI validates before touching the DB → 422 without infra."""
    r = client.post("/users/", json={"email": "not-an-email", "password": "x"})
    assert r.status_code == 422


def test_login_requires_fields(client):
    r = client.post("/users/login", json={})
    assert r.status_code == 422


def test_ml_endpoint_requires_auth(client):
    """Blocker 4 regression guard: /ml/evaluate-barber must not be anonymous."""
    r = client.post("/ml/evaluate-barber", json={
        "years_experience_cat": 1, "skills": [], "education_count": 0,
    })
    assert r.status_code == 401
