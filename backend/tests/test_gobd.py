"""Tests for GoBD compliance report generation."""
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


class TestGoBDReport:
    def test_generate_report(self, client):
        reg = client.post("/api/auth/register", json={
            "email": "gobd@test.de",
            "password": "SecurePass123!",
            "full_name": "Test",
            "organization_name": "GoBD GmbH",
        })
        assert reg.status_code == 201
        token = reg.json()["access_token"]

        resp = client.get(
            "/api/gobd/report",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"
        # PDF files start with %PDF
        assert resp.content[:5] == b"%PDF-"

    def test_report_requires_auth(self, client):
        resp = client.get("/api/gobd/report")
        assert resp.status_code == 401

    def test_report_contains_org_name(self, client):
        """Verify the PDF contains the organization name."""
        reg = client.post("/api/auth/register", json={
            "email": "gobd2@test.de",
            "password": "SecurePass123!",
            "full_name": "Test User",
            "organization_name": "Musterfirma AG",
        })
        assert reg.status_code == 201
        token = reg.json()["access_token"]

        resp = client.get(
            "/api/gobd/report",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        # Check Content-Disposition includes org slug
        cd = resp.headers.get("content-disposition", "")
        assert "musterfirma-ag" in cd
