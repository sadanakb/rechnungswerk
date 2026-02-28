"""Tests for GDPR endpoints — Phase 11 (Art. 17 + Art. 20)."""
import io
import json
import os
import secrets
import zipfile
from datetime import datetime, timezone, timedelta
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("REQUIRE_API_KEY", "false")

from app.main import app
from app.models import Base, GdprDeleteRequest
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
    """TestClient with JWT auth and DB dependency overridden."""

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
        "full_name": "GDPR Test User",
        "organization_name": org_name,
    })
    assert resp.status_code == 201, f"Register failed: {resp.text}"
    return resp.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_export_zip_contains_four_files(client, db_session):
    """GET /api/gdpr/export returns a ZIP with exactly 4 files."""
    token = _register_and_login(client, "gdpr_export1@test.de", "GDPR Org 1")
    res = client.get("/api/gdpr/export", headers=_auth(token))
    assert res.status_code == 200
    assert "application/zip" in res.headers.get("content-type", "")

    zf = zipfile.ZipFile(io.BytesIO(res.content))
    names = set(zf.namelist())
    assert "rechnungen.csv" in names
    assert "kontakte.csv" in names
    assert "organisation.json" in names
    assert "profil.json" in names


def test_export_profil_contains_email(client, db_session):
    """profil.json in the export contains the authenticated user's email."""
    email_addr = "gdpr_export2@test.de"
    token = _register_and_login(client, email_addr, "GDPR Org 2")
    res = client.get("/api/gdpr/export", headers=_auth(token))
    assert res.status_code == 200

    zf = zipfile.ZipFile(io.BytesIO(res.content))
    profil = json.loads(zf.read("profil.json"))
    assert isinstance(profil.get("email"), str)
    assert len(profil["email"]) > 0
    assert profil["email"] == email_addr


def test_request_delete_sends_email(client, db_session):
    """POST /api/gdpr/request-delete creates a GdprDeleteRequest and calls send_gdpr_delete_confirmation."""
    token = _register_and_login(client, "gdpr_delete1@test.de", "GDPR Org 3")
    with patch("app.routers.gdpr.send_gdpr_delete_confirmation") as mock_email:
        res = client.post("/api/gdpr/request-delete", headers=_auth(token))
        assert res.status_code == 200
        data = res.json()
        assert data["message"] == "Bestätigungs-E-Mail wurde gesendet."
        mock_email.assert_called_once()


def test_confirm_delete_with_valid_token(client, db_session):
    """DELETE /api/gdpr/confirm-delete?token=... deletes user data when token is valid."""
    token = _register_and_login(client, "gdpr_delete2@test.de", "GDPR Org 4")
    with patch("app.email_service.send_gdpr_delete_confirmation"):
        client.post("/api/gdpr/request-delete", headers=_auth(token))

    req = db_session.query(GdprDeleteRequest).first()
    assert req is not None, "GdprDeleteRequest should have been created"

    res = client.delete(f"/api/gdpr/confirm-delete?token={req.token}")
    assert res.status_code == 200
    data = res.json()
    assert "gelöscht" in data["message"] or "deleted" in data["message"].lower()


def test_confirm_delete_with_expired_token(client, db_session):
    """DELETE /api/gdpr/confirm-delete with expired token returns 400."""
    expired = GdprDeleteRequest(
        user_id=9999,
        token=secrets.token_hex(32),
        expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    db_session.add(expired)
    db_session.commit()

    res = client.delete(f"/api/gdpr/confirm-delete?token={expired.token}")
    assert res.status_code == 400


def test_confirm_delete_with_invalid_token(client, db_session):
    """DELETE /api/gdpr/confirm-delete with unknown token returns 404."""
    res = client.delete("/api/gdpr/confirm-delete?token=completely-fake-token-xyz-123")
    assert res.status_code == 404
