"""Tests for Phase 12 Connect onboarding + payment settings endpoints."""
import os
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("REQUIRE_API_KEY", "false")

from app.main import app
from app.models import Base, Organization, OrganizationMember, User
from app.database import get_db
from app.config import settings


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
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


def _register_and_login(client, email="connect_test@test.de", org_name="Connect Org"):
    resp = client.post("/api/auth/register", json={
        "email": email,
        "password": "SecurePass123!",
        "full_name": "Connect Test",
        "organization_name": org_name,
    })
    assert resp.status_code == 201, resp.text
    return resp.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_connect_onboard_returns_url(client, db_session):
    token = _register_and_login(client)
    with patch("app.routers.billing.stripe_service.create_connect_onboarding_url") as mock_onboard:
        mock_onboard.return_value = {"url": "https://stripe.com/onboarding/test", "account_id": "acct_test_001"}
        res = client.post("/api/billing/connect-onboard", headers=_auth(token))
    assert res.status_code == 200
    data = res.json()
    assert "url" in data
    assert data["url"].startswith("https://")


def test_connect_onboard_saves_account_id(client, db_session):
    token = _register_and_login(client, "connect_save@test.de", "Connect Save Org")
    with patch("app.routers.billing.stripe_service.create_connect_onboarding_url") as mock_onboard:
        mock_onboard.return_value = {"url": "https://stripe.com/onboarding/test", "account_id": "acct_save_001"}
        client.post("/api/billing/connect-onboard", headers=_auth(token))
    org = db_session.query(Organization).filter(Organization.name == "Connect Save Org").first()
    assert org.stripe_connect_account_id == "acct_save_001"


def test_connect_status_not_onboarded(client, db_session):
    token = _register_and_login(client, "connect_status@test.de", "Connect Status Org")
    res = client.get("/api/billing/connect-status", headers=_auth(token))
    assert res.status_code == 200
    data = res.json()
    assert data["onboarded"] is False
    assert data["account_id"] is None


def test_connect_status_after_onboarding(client, db_session):
    token = _register_and_login(client, "connect_done@test.de", "Connect Done Org")
    org = db_session.query(Organization).filter(Organization.name == "Connect Done Org").first()
    org.stripe_connect_account_id = "acct_done_001"
    db_session.commit()

    with patch("app.routers.billing.stripe_service.get_connect_account_status") as mock_status:
        mock_status.return_value = {
            "onboarded": True, "charges_enabled": True,
            "details_submitted": True, "payouts_enabled": True,
        }
        res = client.get("/api/billing/connect-status", headers=_auth(token))
    assert res.status_code == 200
    data = res.json()
    assert data["onboarded"] is True
    assert data["account_id"] == "acct_done_001"
    db_session.refresh(org)
    assert org.stripe_connect_onboarded is True


def test_payment_settings_get_and_patch(client, db_session):
    token = _register_and_login(client, "paypal_test@test.de", "PayPal Org")
    # GET — initially null
    res = client.get("/api/billing/payment-settings", headers=_auth(token))
    assert res.status_code == 200
    assert res.json()["paypal_link"] is None

    # PATCH — set link
    res = client.patch("/api/billing/payment-settings",
                       json={"paypal_link": "https://paypal.me/testorg"},
                       headers=_auth(token))
    assert res.status_code == 200
    assert res.json()["paypal_link"] == "https://paypal.me/testorg"

    # GET again — persisted
    res = client.get("/api/billing/payment-settings", headers=_auth(token))
    assert res.json()["paypal_link"] == "https://paypal.me/testorg"
