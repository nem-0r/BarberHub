"""Test bootstrap.

Sets the env vars `config.Settings` requires BEFORE `main` is imported, so the
suite runs in CI without a real .env. Tests here are smoke-level: they assert the
app boots and request validation works. They do NOT require a live DB/Redis —
the /health test tolerates a 503 when infra is absent.
"""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test")
os.environ.setdefault("SECRET_KEY", "test-secret-not-used-for-real-tokens")
os.environ.setdefault("ALLOWED_HOSTS", "*")
os.environ.setdefault("DEBUG", "True")

import pytest
from fastapi.testclient import TestClient

from main import app


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c
