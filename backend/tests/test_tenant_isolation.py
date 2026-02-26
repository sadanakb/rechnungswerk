"""Tests that tenant isolation works -- users can only see their own org data."""
import os
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Override settings BEFORE importing app modules
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["REQUIRE_API_KEY"] = "false"

from app.main import app
from app.models import Base
from app.database import get_db
from app.auth import verify_api_key


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


@pytest.fixture
def client(db_session):
    def _override_get_db():
        try:
            yield db_session
        finally:
            pass

    # Bypass legacy API-key check so JWT auth is the only gate
    async def _bypass_api_key():
        return "test-bypass"

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[verify_api_key] = _bypass_api_key
    with patch("app.routers.invoices.settings") as mock_settings:
        mock_settings.require_api_key = True
        mock_settings.max_upload_size_mb = 10
        yield TestClient(app)
    app.dependency_overrides.clear()


def register_and_get_token(client, email, org_name):
    resp = client.post("/api/auth/register", json={
        "email": email,
        "password": "SecurePass123!",
        "full_name": "Test User",
        "organization_name": org_name,
    })
    assert resp.status_code == 201, f"Registration failed: {resp.text}"
    return resp.json()["access_token"]


class TestTenantIsolation:
    def test_user_sees_only_own_invoices(self, client):
        token_a = register_and_get_token(client, "a@test.de", "Org A")
        token_b = register_and_get_token(client, "b@test.de", "Org B")

        # User A creates an invoice
        resp = client.post(
            "/api/invoices",
            json={
                "invoice_number": "A-001",
                "invoice_date": "2026-02-26",
                "seller_name": "Seller A",
                "seller_vat_id": "DE111111111",
                "seller_address": "Addr A",
                "buyer_name": "Buyer A",
                "buyer_vat_id": "DE222222222",
                "buyer_address": "Addr B",
                "line_items": [{"description": "Test", "quantity": 1, "unit_price": 100, "net_amount": 100, "tax_rate": 19}],
            },
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert resp.status_code == 200, f"Create invoice failed: {resp.text}"

        # User B lists invoices -- should see 0 (not User A's invoice)
        resp = client.get(
            "/api/invoices",
            headers={"Authorization": f"Bearer {token_b}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert len(data["items"]) == 0

    def test_user_sees_own_invoices(self, client):
        token_a = register_and_get_token(client, "own@test.de", "My Org")

        resp = client.post(
            "/api/invoices",
            json={
                "invoice_number": "OWN-001",
                "invoice_date": "2026-02-26",
                "seller_name": "Seller",
                "seller_vat_id": "DE333333333",
                "seller_address": "Addr",
                "buyer_name": "Buyer",
                "buyer_vat_id": "DE444444444",
                "buyer_address": "Addr",
                "line_items": [{"description": "Test", "quantity": 1, "unit_price": 100, "net_amount": 100, "tax_rate": 19}],
            },
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert resp.status_code == 200, f"Create invoice failed: {resp.text}"

        resp = client.get(
            "/api/invoices",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert len(data["items"]) == 1
        assert data["items"][0]["invoice_number"] == "OWN-001"

    def test_unauthenticated_sees_all_invoices(self, client):
        """Without auth token, all invoices are visible (backwards-compatible)."""
        token_a = register_and_get_token(client, "unauth@test.de", "Unauth Org")

        # Create invoice with auth
        client.post(
            "/api/invoices",
            json={
                "invoice_number": "UNAUTH-001",
                "invoice_date": "2026-02-26",
                "seller_name": "Seller",
                "seller_vat_id": "DE555555555",
                "seller_address": "Addr",
                "buyer_name": "Buyer",
                "buyer_vat_id": "DE666666666",
                "buyer_address": "Addr",
                "line_items": [{"description": "Test", "quantity": 1, "unit_price": 100, "net_amount": 100, "tax_rate": 19}],
            },
            headers={"Authorization": f"Bearer {token_a}"},
        )

        # List without any auth header -- should see all
        resp = client.get("/api/invoices")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1

    def test_create_invoice_sets_org_id(self, client, db_session):
        """Creating an invoice with JWT should auto-set organization_id."""
        from app.models import Invoice

        token = register_and_get_token(client, "orgset@test.de", "OrgSet Corp")

        resp = client.post(
            "/api/invoices",
            json={
                "invoice_number": "ORGSET-001",
                "invoice_date": "2026-02-26",
                "seller_name": "Seller",
                "seller_vat_id": "DE777777777",
                "seller_address": "Addr",
                "buyer_name": "Buyer",
                "buyer_vat_id": "DE888888888",
                "buyer_address": "Addr",
                "line_items": [{"description": "Test", "quantity": 1, "unit_price": 200, "net_amount": 200, "tax_rate": 19}],
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200

        invoice_id = resp.json()["invoice_id"]
        inv = db_session.query(Invoice).filter(Invoice.invoice_id == invoice_id).first()
        assert inv is not None
        assert inv.organization_id is not None
