"""Tests for AI router endpoints (Task 6 — Phase 9)."""
import uuid
import pytest
from datetime import date
from decimal import Decimal
from unittest.mock import patch
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.main import app
from app.models import Base, Invoice
from app.database import get_db
from app.config import settings


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

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
    """TestClient with DB override and require_api_key=True (JWT auth active)."""

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


def _register_and_get_token(client: TestClient, email: str = None, org_name: str = None) -> dict:
    """Register a user+org via API and return access_token and org_id."""
    email = email or f"ai-{uuid.uuid4().hex[:8]}@example.com"
    org_name = org_name or f"AI Org {uuid.uuid4().hex[:6]}"
    resp = client.post("/api/auth/register", json={
        "email": email,
        "password": "SecurePass123!",
        "full_name": "AI Test User",
        "organization_name": org_name,
    })
    assert resp.status_code == 201, f"Registration failed: {resp.text}"
    data = resp.json()
    return {"token": data["access_token"], "org_id": data["organization"]["id"]}


@pytest.fixture()
def test_user(client):
    return _register_and_get_token(client)


@pytest.fixture()
def other_user(client):
    return _register_and_get_token(client)


@pytest.fixture()
def test_invoice(client, db_session, test_user):
    """An invoice owned by test_user's org, inserted directly into DB."""
    invoice_id = f"INV-{uuid.uuid4().hex[:12]}"
    inv = Invoice(
        invoice_id=invoice_id,
        invoice_number="AI-TEST-001",
        invoice_date=date.today(),
        due_date=date.today(),
        seller_name="Software GmbH",
        seller_vat_id="DE100000001",
        seller_address="Softwarestr. 1, 60311 Frankfurt",
        buyer_name="Kunde AG",
        buyer_vat_id="DE200000002",
        buyer_address="Kundenstr. 2, 10115 Berlin",
        net_amount=Decimal("1000.00"),
        tax_amount=Decimal("190.00"),
        gross_amount=Decimal("1190.00"),
        tax_rate=Decimal("19.00"),
        currency="EUR",
        line_items=[{"description": "Cloud-Software Lizenz", "quantity": 1, "unit_price": 1190.0}],
        payment_status="unpaid",
        source_type="manual",
        validation_status="pending",
        organization_id=test_user["org_id"],
    )
    db_session.add(inv)
    db_session.commit()
    db_session.refresh(inv)
    return inv


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestAiRouter:

    def test_categorize_invoice_returns_skr03(self, client, test_user, test_invoice):
        """POST /api/ai/categorize should return skr03_account and category."""
        with patch("app.routers.ai.categorize_invoice", return_value={
            "skr03_account": "4964", "category": "IT/Software"
        }):
            response = client.post(
                "/api/ai/categorize",
                json={"invoice_id": test_invoice.invoice_id},
                headers={"Authorization": f"Bearer {test_user['token']}"},
            )
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["skr03_account"] == "4964"
        assert data["category"] == "IT/Software"
        assert data["invoice_id"] == test_invoice.invoice_id

    def test_categorize_invoice_404_for_wrong_org(self, client, other_user, test_invoice):
        """Categorize from different org should return 404."""
        response = client.post(
            "/api/ai/categorize",
            json={"invoice_id": test_invoice.invoice_id},
            headers={"Authorization": f"Bearer {other_user['token']}"},
        )
        assert response.status_code == 404

    def test_monthly_summary_returns_text(self, client, test_user, test_invoice):
        """GET /api/ai/monthly-summary should return summary text."""
        with patch("app.routers.ai.generate_monthly_summary", return_value="Test Zusammenfassung."):
            response = client.get(
                "/api/ai/monthly-summary",
                headers={"Authorization": f"Bearer {test_user['token']}"},
            )
        assert response.status_code == 200, response.text
        data = response.json()
        assert "summary" in data
        assert len(data["summary"]) > 0

    def test_monthly_summary_invalid_month_format(self, client, test_user):
        """Invalid month format should return 422."""
        response = client.get(
            "/api/ai/monthly-summary?month=invalid",
            headers={"Authorization": f"Bearer {test_user['token']}"},
        )
        assert response.status_code == 422
