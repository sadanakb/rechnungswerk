"""Tests for Push Notification endpoints — Phase 11."""
import os
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("REQUIRE_API_KEY", "false")

from app.main import app
from app.models import Base, PushSubscription
from app.database import get_db
from app.config import settings


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture
def client(db_session):
    """TestClient with JWT auth enabled and DB dependency overridden."""

    def _override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    with patch.object(settings, "require_api_key", True):
        with TestClient(app) as c:
            yield c
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _register_and_login(client: TestClient, email: str, org_name: str) -> str:
    """Register a new user+org and return the JWT access token."""
    resp = client.post("/api/auth/register", json={
        "email": email,
        "password": "SecurePass123!",
        "full_name": "Push Test User",
        "organization_name": org_name,
    })
    assert resp.status_code == 201, f"Register failed: {resp.text}"
    return resp.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_subscribe_saves_token(client, db_session):
    """POST /api/push/subscribe saves FCM token."""
    token = _register_and_login(client, "push1@test.de", "Push Org 1")
    res = client.post(
        "/api/push/subscribe",
        json={"fcm_token": "test-fcm-token-abc123", "device_label": "Chrome / macOS"},
        headers=_auth(token),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["subscribed"] is True
    assert data["fcm_token"] == "test-fcm-token-abc123"


def test_subscribe_duplicate_token_is_idempotent(client, db_session):
    """Subscribing with the same token twice returns 200 (no duplicate row)."""
    token = _register_and_login(client, "push2@test.de", "Push Org 2")
    payload = {"fcm_token": "duplicate-token-xyz", "device_label": "Firefox"}
    client.post("/api/push/subscribe", json=payload, headers=_auth(token))
    res = client.post("/api/push/subscribe", json=payload, headers=_auth(token))
    assert res.status_code == 200

    count = db_session.query(PushSubscription).filter(
        PushSubscription.fcm_token == "duplicate-token-xyz"
    ).count()
    assert count == 1


def test_unsubscribe_removes_token(client, db_session):
    """DELETE /api/push/unsubscribe removes the subscription."""
    token = _register_and_login(client, "push3@test.de", "Push Org 3")
    client.post(
        "/api/push/subscribe",
        json={"fcm_token": "remove-me-token", "device_label": "Safari"},
        headers=_auth(token),
    )
    res = client.delete(
        "/api/push/unsubscribe",
        params={"fcm_token": "remove-me-token"},
        headers=_auth(token),
    )
    assert res.status_code == 204

    count = db_session.query(PushSubscription).filter(
        PushSubscription.fcm_token == "remove-me-token"
    ).count()
    assert count == 0


def test_status_returns_subscribed_true(client, db_session):
    """GET /api/push/status returns subscribed=True when token exists."""
    token = _register_and_login(client, "push4@test.de", "Push Org 4")
    client.post(
        "/api/push/subscribe",
        json={"fcm_token": "status-check-token", "device_label": "Edge"},
        headers=_auth(token),
    )
    res = client.get("/api/push/status", headers=_auth(token))
    assert res.status_code == 200
    assert res.json()["subscribed"] is True


def test_push_service_send_returns_false_when_not_configured():
    """send_push() returns False gracefully when Firebase is not configured."""
    import app.push_service as push_svc

    # Ensure Firebase is NOT initialized and env var not set
    original = push_svc._firebase_initialized
    push_svc._firebase_initialized = False

    with patch.dict(os.environ, {}, clear=False):
        # Remove the env var if it exists
        os.environ.pop("FIREBASE_SERVICE_ACCOUNT_JSON", None)
        result = push_svc.send_push(
            fcm_token="fake-token-xyz",
            title="Test",
            body="Test body",
        )

    push_svc._firebase_initialized = original
    assert result is False


def test_push_service_send_returns_false_without_firebase(monkeypatch):
    """send_push() returns False gracefully when Firebase is not initialized and env var missing."""
    import app.push_service as push_svc
    monkeypatch.setattr(push_svc, "_firebase_initialized", False)
    monkeypatch.delenv("FIREBASE_SERVICE_ACCOUNT_JSON", raising=False)

    result = push_svc.send_push(
        fcm_token="fake-token",
        title="Test",
        body="Test body",
    )
    assert result is False
