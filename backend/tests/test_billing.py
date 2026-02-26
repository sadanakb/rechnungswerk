"""Tests for billing endpoints."""
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


def register_and_get_token(client, email="pay@test.de"):
    resp = client.post("/api/auth/register", json={
        "email": email,
        "password": "SecurePass123!",
        "full_name": "Test",
        "organization_name": "Pay Org",
    })
    return resp.json()["access_token"]


class TestCheckout:
    @patch("app.routers.billing.stripe_service.create_checkout_session")
    def test_create_checkout_success(self, mock_create, client):
        mock_create.return_value = "https://checkout.stripe.com/test"

        token = register_and_get_token(client)
        resp = client.post(
            "/api/billing/checkout",
            json={"plan": "starter"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["url"] == "https://checkout.stripe.com/test"
        mock_create.assert_called_once()

    def test_checkout_invalid_plan(self, client):
        token = register_and_get_token(client)
        resp = client.post(
            "/api/billing/checkout",
            json={"plan": "enterprise"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 400

    def test_checkout_without_auth(self, client):
        resp = client.post("/api/billing/checkout", json={"plan": "starter"})
        assert resp.status_code == 401
