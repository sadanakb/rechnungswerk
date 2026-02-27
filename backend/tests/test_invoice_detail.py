"""
Tests for GET /api/invoices/{invoice_id} — invoice detail endpoint.

Covers:
  1. Retrieve a single invoice and verify all key fields are returned.
  2. Cross-org access attempt returns 404 (tenant isolation).
"""
import os
import uuid
import pytest
from datetime import date
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("REQUIRE_API_KEY", "false")

from app.main import app
from app.models import Base, Invoice, Organization, OrganizationMember, User
from app.database import get_db
from app.auth import verify_api_key
from app.auth_jwt import hash_password


# ---------------------------------------------------------------------------
# Shared fixtures
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


@pytest.fixture
def client(db_session):
    def _override_get_db():
        try:
            yield db_session
        finally:
            pass

    async def _bypass_api_key():
        return "test-bypass"

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[verify_api_key] = _bypass_api_key
    with patch("app.routers.invoices.settings") as mock_settings:
        mock_settings.require_api_key = True
        mock_settings.max_upload_size_mb = 10
        yield TestClient(app)
    app.dependency_overrides.clear()


def _register_and_login(client, email: str, org_name: str) -> str:
    """Register a user and return their JWT access token."""
    resp = client.post("/api/auth/register", json={
        "email": email,
        "password": "SecurePass123!",
        "full_name": "Test User",
        "organization_name": org_name,
    })
    assert resp.status_code == 201, f"Registration failed: {resp.text}"
    return resp.json()["access_token"]


def _make_invoice_payload(number: str = "RE-DETAIL-001") -> dict:
    return {
        "invoice_number": number,
        "invoice_date": "2026-02-27",
        "due_date": "2026-03-27",
        "seller_name": "Detail GmbH",
        "seller_vat_id": "DE123456789",
        "seller_address": "Detailstraße 1, 60311 Frankfurt",
        "buyer_name": "Käufer Detail AG",
        "buyer_vat_id": "DE987654321",
        "buyer_address": "Hauptstraße 10, 10115 Berlin",
        "line_items": [
            {
                "description": "Beratungsleistung Premium",
                "quantity": 5.0,
                "unit_price": 200.0,
                "net_amount": 1000.0,
                "tax_rate": 19.0,
            },
            {
                "description": "Software-Lizenz",
                "quantity": 1.0,
                "unit_price": 500.0,
                "net_amount": 500.0,
                "tax_rate": 19.0,
            },
        ],
        "tax_rate": 19.0,
        "iban": "DE89370400440532013000",
        "bic": "COBADEFFXXX",
        "payment_account_name": "Detail GmbH",
        "currency": "EUR",
    }


# ---------------------------------------------------------------------------
# Test 1: GET /api/invoices/{invoice_id} — verify all fields returned
# ---------------------------------------------------------------------------

class TestGetInvoiceById:
    """GET /api/invoices/{invoice_id} — full detail including line items."""

    def test_get_invoice_by_id(self, client):
        """Create an invoice, then GET it by ID and verify all detail fields."""
        payload = _make_invoice_payload()
        create_resp = client.post("/api/invoices", json=payload)
        assert create_resp.status_code == 200, create_resp.text
        invoice_id = create_resp.json()["invoice_id"]

        resp = client.get(f"/api/invoices/{invoice_id}")
        assert resp.status_code == 200, resp.text

        data = resp.json()

        # Core identity fields
        assert data["invoice_id"] == invoice_id
        assert data["invoice_number"] == "RE-DETAIL-001"

        # Seller fields — included in detail response
        assert data["seller_name"] == "Detail GmbH"
        assert data["seller_vat_id"] == "DE123456789"
        assert data["seller_address"] == "Detailstraße 1, 60311 Frankfurt"

        # Buyer fields
        assert data["buyer_name"] == "Käufer Detail AG"
        assert data["buyer_vat_id"] == "DE987654321"
        assert data["buyer_address"] == "Hauptstraße 10, 10115 Berlin"

        # Amounts
        assert data["net_amount"] == pytest.approx(1500.0)
        assert data["tax_amount"] == pytest.approx(285.0)
        assert data["gross_amount"] == pytest.approx(1785.0)

        # Currency
        assert data["currency"] == "EUR"

        # Line items must be present and contain both positions
        assert "line_items" in data
        assert isinstance(data["line_items"], list)
        assert len(data["line_items"]) == 2
        descriptions = [li["description"] for li in data["line_items"]]
        assert "Beratungsleistung Premium" in descriptions
        assert "Software-Lizenz" in descriptions

        # Payment info
        assert data["iban"] == "DE89370400440532013000"
        assert data["bic"] == "COBADEFFXXX"

        # Status fields
        assert data["validation_status"] == "pending"
        assert data["source_type"] == "manual"

    def test_get_invoice_by_id_not_found(self, client):
        """Non-existent invoice returns 404."""
        resp = client.get("/api/invoices/INV-20260227-00000000")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Test 2: Cross-org access returns 404
# ---------------------------------------------------------------------------

class TestGetInvoiceByIdCrossOrg:
    """Tenant isolation: users cannot access invoices from another org."""

    def test_get_invoice_by_id_cross_org(self, client):
        """Org B trying to access Org A's invoice should get 404."""
        # Register Org A and Org B
        token_a = _register_and_login(client, "org_a_detail@test.de", "Org A Detail")
        token_b = _register_and_login(client, "org_b_detail@test.de", "Org B Detail")

        # Org A creates an invoice
        payload = _make_invoice_payload("ORG-A-ONLY-001")
        create_resp = client.post(
            "/api/invoices",
            json=payload,
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert create_resp.status_code == 200, create_resp.text
        invoice_id = create_resp.json()["invoice_id"]

        # Org A can see their own invoice
        resp_a = client.get(
            f"/api/invoices/{invoice_id}",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert resp_a.status_code == 200
        assert resp_a.json()["invoice_id"] == invoice_id

        # Org B cannot access Org A's invoice — must get 404
        resp_b = client.get(
            f"/api/invoices/{invoice_id}",
            headers={"Authorization": f"Bearer {token_b}"},
        )
        assert resp_b.status_code == 404, (
            f"Cross-org access should be blocked but got {resp_b.status_code}: {resp_b.text}"
        )
