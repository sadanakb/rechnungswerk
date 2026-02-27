"""Tests for API Key management endpoints.

Endpoints under test:
- GET    /api/api-keys        — list org keys
- POST   /api/api-keys        — create key (full key returned once)
- DELETE /api/api-keys/{id}   — revoke (soft-delete)

Cross-org isolation is verified: org B cannot see or revoke org A keys.

Test patterns follow test_users.py exactly:
  - In-memory SQLite via db_session fixture
  - client fixture overrides get_db and patches require_api_key = True
  - _register_and_get_token helper creates a user + org, returns JWT
"""
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import Base
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
# Helper
# ---------------------------------------------------------------------------

def _register_and_get_token(
    client: TestClient,
    email: str = "user@test.de",
    org_name: str = "Test GmbH",
) -> str:
    """Register a user+org and return the access token."""
    resp = client.post("/api/auth/register", json={
        "email": email,
        "password": "SecurePass123!",
        "full_name": "Max Mustermann",
        "organization_name": org_name,
    })
    assert resp.status_code == 201, resp.text
    return resp.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_create_api_key_returns_full_key_once(client):
    """POST /api/api-keys returns full_key and warning only at creation time."""
    token = _register_and_get_token(client, email="create@test.de")

    resp = client.post(
        "/api/api-keys",
        json={
            "name": "Produktionsschluessel",
            "scopes": ["read:invoices", "write:invoices"],
        },
        headers=_auth(token),
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()

    # Full key is present and starts with the expected prefix
    assert "full_key" in data
    assert data["full_key"].startswith("rw_live_")
    assert len(data["full_key"]) > 12

    # Warning field is present
    assert "warning" in data
    assert data["warning"] == "Wird nur einmal angezeigt"

    # Prefix stored is the first 12 chars of the full key
    assert data["key_prefix"] == data["full_key"][:12]

    # Metadata is correct
    assert data["name"] == "Produktionsschluessel"
    assert "read:invoices" in data["scopes"]
    assert "write:invoices" in data["scopes"]
    assert data["is_active"] is True

    # key_hash must NOT be returned in any response
    assert "key_hash" not in data


def test_list_api_keys_hides_key(client):
    """GET /api/api-keys never exposes full_key or key_hash."""
    token = _register_and_get_token(client, email="list@test.de")

    # Create two keys
    client.post(
        "/api/api-keys",
        json={"name": "Key A", "scopes": ["read:invoices"]},
        headers=_auth(token),
    )
    client.post(
        "/api/api-keys",
        json={"name": "Key B", "scopes": ["read:suppliers", "write:suppliers"]},
        headers=_auth(token),
    )

    resp = client.get("/api/api-keys", headers=_auth(token))
    assert resp.status_code == 200, resp.text
    keys = resp.json()

    assert len(keys) == 2

    for key in keys:
        # Sensitive fields must be absent
        assert "full_key" not in key
        assert "key_hash" not in key
        # Expected fields present
        assert "id" in key
        assert "name" in key
        assert "key_prefix" in key
        assert "scopes" in key
        assert "created_at" in key
        assert "last_used_at" in key
        assert key["is_active"] is True


def test_revoke_api_key(client):
    """DELETE /api/api-keys/{id} soft-deletes the key; it no longer appears in list."""
    token = _register_and_get_token(client, email="revoke@test.de")

    # Create a key
    create_resp = client.post(
        "/api/api-keys",
        json={"name": "Zu widerrufender Key", "scopes": ["read:invoices"]},
        headers=_auth(token),
    )
    assert create_resp.status_code == 201
    key_id = create_resp.json()["id"]

    # Verify it's listed
    list_resp = client.get("/api/api-keys", headers=_auth(token))
    assert any(k["id"] == key_id for k in list_resp.json())

    # Revoke it
    del_resp = client.delete(f"/api/api-keys/{key_id}", headers=_auth(token))
    assert del_resp.status_code == 204, del_resp.text

    # No longer in the list
    list_resp2 = client.get("/api/api-keys", headers=_auth(token))
    assert not any(k["id"] == key_id for k in list_resp2.json())

    # Second revoke returns 404
    del_resp2 = client.delete(f"/api/api-keys/{key_id}", headers=_auth(token))
    assert del_resp2.status_code == 404


def test_cross_org_isolation(client):
    """Org B cannot list or revoke keys belonging to org A."""
    token_a = _register_and_get_token(client, email="org_a@test.de", org_name="Org A GmbH")
    token_b = _register_and_get_token(client, email="org_b@test.de", org_name="Org B GmbH")

    # Org A creates a key
    create_resp = client.post(
        "/api/api-keys",
        json={"name": "Org A Key", "scopes": ["read:invoices"]},
        headers=_auth(token_a),
    )
    assert create_resp.status_code == 201
    key_id_a = create_resp.json()["id"]

    # Org B lists keys — should be empty
    list_resp_b = client.get("/api/api-keys", headers=_auth(token_b))
    assert list_resp_b.status_code == 200
    assert list_resp_b.json() == []

    # Org B tries to revoke Org A's key — should be 404
    del_resp = client.delete(f"/api/api-keys/{key_id_a}", headers=_auth(token_b))
    assert del_resp.status_code == 404

    # Org A's key is still active (verify via org A listing)
    list_resp_a = client.get("/api/api-keys", headers=_auth(token_a))
    assert any(k["id"] == key_id_a for k in list_resp_a.json())


def test_unauthenticated_rejected(client):
    """All API key endpoints reject unauthenticated requests."""
    get_resp = client.get("/api/api-keys")
    assert get_resp.status_code == 401

    post_resp = client.post("/api/api-keys", json={"name": "x", "scopes": []})
    assert post_resp.status_code == 401

    delete_resp = client.delete("/api/api-keys/1")
    assert delete_resp.status_code == 401


def test_invalid_scope_rejected(client):
    """POST /api/api-keys rejects unknown scopes."""
    token = _register_and_get_token(client, email="scope@test.de")
    resp = client.post(
        "/api/api-keys",
        json={"name": "Bad Scopes", "scopes": ["delete:everything", "read:invoices"]},
        headers=_auth(token),
    )
    assert resp.status_code == 400
    assert "Unbekannte Scopes" in resp.json()["detail"]


def test_empty_name_rejected(client):
    """POST /api/api-keys rejects an empty name."""
    token = _register_and_get_token(client, email="emptyname@test.de")
    resp = client.post(
        "/api/api-keys",
        json={"name": "   ", "scopes": ["read:invoices"]},
        headers=_auth(token),
    )
    assert resp.status_code == 400
    assert "Name" in resp.json()["detail"]
