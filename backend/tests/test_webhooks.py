"""
Tests for the outbound webhook system.

Endpoints under /api/webhooks (JWT-protected, org-scoped):
  GET    /api/webhooks
  POST   /api/webhooks
  DELETE /api/webhooks/{id}
  POST   /api/webhooks/{id}/test
  GET    /api/webhooks/{id}/deliveries
"""
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import Base
from app.database import get_db
from app.config import settings


# ---------------------------------------------------------------------------
# Fixtures (mirror test_users.py patterns exactly)
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


def _register_and_get_token(client: TestClient, email: str = "webhook@test.de") -> str:
    """Helper: register a user and return the access token."""
    resp = client.post("/api/auth/register", json={
        "email": email,
        "password": "SecurePass123!",
        "full_name": "Webhook Tester",
        "organization_name": "Webhook GmbH",
    })
    assert resp.status_code == 201
    return resp.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_create_webhook_subscription(client):
    """POST /api/webhooks creates a subscription and returns secret once."""
    token = _register_and_get_token(client)

    resp = client.post(
        "/api/webhooks",
        json={"url": "https://example.com/hook", "events": ["invoice.created"]},
        headers=_auth(token),
    )
    assert resp.status_code == 201
    data = resp.json()

    assert data["url"] == "https://example.com/hook"
    assert "invoice.created" in data["events"]
    assert data["is_active"] is True
    assert "id" in data
    assert "secret" in data
    assert data["secret"].startswith("whsec_")


def test_create_webhook_unknown_event_rejected(client):
    """POST /api/webhooks with unknown event returns 422."""
    token = _register_and_get_token(client, email="badhook@test.de")

    resp = client.post(
        "/api/webhooks",
        json={"url": "https://example.com/hook", "events": ["not.an.event"]},
        headers=_auth(token),
    )
    assert resp.status_code == 422


def test_list_webhook_subscriptions(client):
    """GET /api/webhooks lists subscriptions for the org."""
    token = _register_and_get_token(client, email="list@test.de")

    # Create two subscriptions
    client.post(
        "/api/webhooks",
        json={"url": "https://a.example.com/hook", "events": ["invoice.created"]},
        headers=_auth(token),
    )
    client.post(
        "/api/webhooks",
        json={"url": "https://b.example.com/hook", "events": ["mahnung.sent"]},
        headers=_auth(token),
    )

    resp = client.get("/api/webhooks", headers=_auth(token))
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 2
    urls = {s["url"] for s in data}
    assert "https://a.example.com/hook" in urls
    assert "https://b.example.com/hook" in urls
    # Secret must NOT appear in list response
    for sub in data:
        assert "secret" not in sub


def test_delete_webhook_subscription(client):
    """DELETE /api/webhooks/{id} removes the subscription."""
    token = _register_and_get_token(client, email="delete@test.de")

    create_resp = client.post(
        "/api/webhooks",
        json={"url": "https://delete.example.com/hook", "events": ["invoice.created"]},
        headers=_auth(token),
    )
    assert create_resp.status_code == 201
    sub_id = create_resp.json()["id"]

    del_resp = client.delete(f"/api/webhooks/{sub_id}", headers=_auth(token))
    assert del_resp.status_code == 200
    assert del_resp.json()["id"] == sub_id

    # Confirm it's gone from list
    list_resp = client.get("/api/webhooks", headers=_auth(token))
    assert list_resp.status_code == 200
    assert all(s["id"] != sub_id for s in list_resp.json())


def test_delete_webhook_wrong_org_returns_404(client):
    """DELETE /api/webhooks/{id} by different org should return 404."""
    token_a = _register_and_get_token(client, email="orga@test.de")
    token_b = _register_and_get_token(client, email="orgb@test.de")

    # Org A creates a subscription
    create_resp = client.post(
        "/api/webhooks",
        json={"url": "https://orga.example.com/hook", "events": ["invoice.created"]},
        headers=_auth(token_a),
    )
    assert create_resp.status_code == 201
    sub_id = create_resp.json()["id"]

    # Org B tries to delete it
    del_resp = client.delete(f"/api/webhooks/{sub_id}", headers=_auth(token_b))
    assert del_resp.status_code == 404


def test_webhook_test_ping(client):
    """POST /api/webhooks/{id}/test sends a ping event (httpx.post mocked)."""
    token = _register_and_get_token(client, email="ping@test.de")

    create_resp = client.post(
        "/api/webhooks",
        json={"url": "https://ping.example.com/hook", "events": ["invoice.created"]},
        headers=_auth(token),
    )
    assert create_resp.status_code == 201
    sub_id = create_resp.json()["id"]

    # Mock httpx.post so no real HTTP call is made
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = '{"ok": true}'

    with patch("app.webhook_service.httpx.post", return_value=mock_response) as mock_post:
        test_resp = client.post(f"/api/webhooks/{sub_id}/test", headers=_auth(token))

    assert test_resp.status_code == 200
    data = test_resp.json()
    assert data["status"] == "success"
    assert data["response_code"] == 200

    # Verify httpx.post was called with the right URL
    mock_post.assert_called_once()
    call_args = mock_post.call_args
    assert call_args[0][0] == "https://ping.example.com/hook"

    # Verify the X-RechnungsWerk-Event header
    headers_sent = call_args[1]["headers"]
    assert headers_sent["X-RechnungsWerk-Event"] == "ping"
    assert "sha256=" in headers_sent["X-RechnungsWerk-Signature"]


def test_webhook_delivery_log(client):
    """GET /api/webhooks/{id}/deliveries returns delivery records."""
    token = _register_and_get_token(client, email="deliveries@test.de")

    create_resp = client.post(
        "/api/webhooks",
        json={"url": "https://log.example.com/hook", "events": ["invoice.created"]},
        headers=_auth(token),
    )
    assert create_resp.status_code == 201
    sub_id = create_resp.json()["id"]

    # Trigger a test ping so we have at least one delivery record
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = "ok"

    with patch("app.webhook_service.httpx.post", return_value=mock_response):
        client.post(f"/api/webhooks/{sub_id}/test", headers=_auth(token))

    # Fetch delivery log
    log_resp = client.get(f"/api/webhooks/{sub_id}/deliveries", headers=_auth(token))
    assert log_resp.status_code == 200
    deliveries = log_resp.json()
    assert isinstance(deliveries, list)
    assert len(deliveries) >= 1

    first = deliveries[0]
    assert first["subscription_id"] == sub_id
    assert first["event_type"] == "ping"
    assert first["status"] in ("success", "failed", "pending")
    assert "id" in first
    assert "attempts" in first


def test_unauthenticated_rejected(client):
    """All webhook endpoints reject requests without a valid token."""
    get_resp = client.get("/api/webhooks")
    assert get_resp.status_code == 401

    post_resp = client.post(
        "/api/webhooks",
        json={"url": "https://x.com/hook", "events": ["invoice.created"]},
    )
    assert post_resp.status_code == 401
