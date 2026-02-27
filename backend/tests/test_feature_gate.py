"""Tests for feature gating on premium endpoints."""
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
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)


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


class TestFeatureGating:
    def test_self_hosted_no_gating(self, client):
        """Self-hosted mode (cloud_mode=False) should allow all features."""
        reg = client.post("/api/auth/register", json={
            "email": "selfhost@test.de",
            "password": "SecurePass123!",
            "full_name": "Self Host",
            "organization_name": "SH GmbH",
        })
        token = reg.json()["access_token"]
        with patch("app.feature_gate.settings") as mock:
            mock.cloud_mode = False
            resp = client.get(
                "/api/mahnwesen/overdue",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code == 200

    def test_cloud_free_plan_blocked(self, client):
        """Cloud mode with free plan should block premium features."""
        reg = client.post("/api/auth/register", json={
            "email": "free@test.de",
            "password": "SecurePass123!",
            "full_name": "Free User",
            "organization_name": "Free GmbH",
        })
        token = reg.json()["access_token"]
        with patch("app.feature_gate.settings") as mock:
            mock.cloud_mode = True
            resp = client.get(
                "/api/mahnwesen/overdue",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code == 403

    def test_gobd_report_no_gating(self, client):
        """GoBD report should be accessible to all (not gated)."""
        reg = client.post("/api/auth/register", json={
            "email": "gobd3@test.de",
            "password": "SecurePass123!",
            "full_name": "Test",
            "organization_name": "Test GmbH",
        })
        token = reg.json()["access_token"]
        resp = client.get(
            "/api/gobd/report",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
