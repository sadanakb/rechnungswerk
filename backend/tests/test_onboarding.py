"""Tests for onboarding endpoints: status, company update, complete."""
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


def _register_and_get_token(client: TestClient) -> str:
    """Helper: register a user and return the access token."""
    resp = client.post("/api/auth/register", json={
        "email": "onboard@test.de",
        "password": "SecurePass123!",
        "full_name": "Test User",
        "organization_name": "Onboard GmbH",
    })
    assert resp.status_code == 201
    return resp.json()["access_token"]


def test_get_onboarding_status(client):
    """GET /api/onboarding/status returns completed=False for new org."""
    token = _register_and_get_token(client)
    resp = client.get(
        "/api/onboarding/status",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["completed"] is False
    assert data["org_name"] == "Onboard GmbH"
    assert data["has_vat_id"] is False
    assert data["has_address"] is False


def test_update_company_info(client):
    """POST /api/onboarding/company updates vat_id and address."""
    token = _register_and_get_token(client)
    resp = client.post(
        "/api/onboarding/company",
        json={"vat_id": "DE123456789", "address": "Musterstr. 1, 60311 Frankfurt"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["has_vat_id"] is True
    assert data["has_address"] is True
    assert data["completed"] is False


def test_complete_onboarding(client):
    """POST /api/onboarding/complete sets onboarding_completed=True."""
    token = _register_and_get_token(client)
    resp = client.post(
        "/api/onboarding/complete",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["completed"] is True

    # Verify via status endpoint
    status_resp = client.get(
        "/api/onboarding/status",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert status_resp.status_code == 200
    assert status_resp.json()["completed"] is True
