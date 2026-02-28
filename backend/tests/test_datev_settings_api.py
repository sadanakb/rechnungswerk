"""Tests for DATEV settings API endpoints (Phase 10)."""
import uuid
import pytest
from unittest.mock import patch
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.main import app
from app.models import Base
from app.database import get_db
from app.config import settings


@pytest.fixture(scope="function")
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
    session.rollback()
    session.close()
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture(scope="function")
def client(db_session):
    def _override():
        try:
            yield db_session
        finally:
            pass
    app.dependency_overrides[get_db] = _override
    with patch.object(settings, "require_api_key", True):
        with TestClient(app) as c:
            yield c
    app.dependency_overrides.clear()


def _register_and_get_token(client):
    email = f"datev-{uuid.uuid4().hex[:8]}@example.com"
    resp = client.post("/api/auth/register", json={
        "email": email,
        "password": "SecurePass123!",
        "full_name": "DATEV Test",
        "organization_name": f"TestOrg {uuid.uuid4().hex[:6]}",
    })
    assert resp.status_code == 201, f"Registration failed: {resp.text}"
    data = resp.json()
    return {"token": data["access_token"], "org_id": data["organization"]["id"]}


class TestDATEVSettingsApi:

    def test_get_datev_settings_initially_null(self, client):
        """GET /api/onboarding/datev-settings returns nulls for fresh org."""
        user = _register_and_get_token(client)
        resp = client.get(
            "/api/onboarding/datev-settings",
            headers={"Authorization": f"Bearer {user['token']}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["datev_berater_nr"] is None
        assert data["datev_mandant_nr"] is None
        assert data["steuerberater_email"] is None

    def test_post_datev_settings_saves_fields(self, client):
        """POST /api/onboarding/datev-settings should persist the three fields."""
        user = _register_and_get_token(client)
        resp = client.post(
            "/api/onboarding/datev-settings",
            json={
                "datev_berater_nr": "12345",
                "datev_mandant_nr": "00001",
                "steuerberater_email": "stb@kanzlei.de",
            },
            headers={"Authorization": f"Bearer {user['token']}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["datev_berater_nr"] == "12345"
        assert data["datev_mandant_nr"] == "00001"
        assert data["steuerberater_email"] == "stb@kanzlei.de"

    def test_post_datev_settings_partial_update(self, client):
        """POST with only berater_nr should not overwrite existing mandant_nr."""
        user = _register_and_get_token(client)
        # First: set both
        client.post(
            "/api/onboarding/datev-settings",
            json={"datev_berater_nr": "12345", "datev_mandant_nr": "00001"},
            headers={"Authorization": f"Bearer {user['token']}"},
        )
        # Then: update only berater_nr
        resp = client.post(
            "/api/onboarding/datev-settings",
            json={"datev_berater_nr": "99999"},
            headers={"Authorization": f"Bearer {user['token']}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["datev_berater_nr"] == "99999"
        assert data["datev_mandant_nr"] == "00001"  # unchanged
