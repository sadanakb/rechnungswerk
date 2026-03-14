"""Tests for AI-features router endpoints.

Covers:
  POST /api/ai/draft-invoice
  POST /api/ai/generate-reminder
  POST /api/ai/suggest-line-item
"""
import json
import uuid
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.database import get_db
from app.main import app
from app.models import Base, Contact, Invoice, Organization


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
    """TestClient with in-memory DB and JWT auth active."""

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
    """Register a new user + org via API and return token + org_id."""
    email = email or f"feat-{uuid.uuid4().hex[:8]}@example.com"
    org_name = org_name or f"FeatOrg {uuid.uuid4().hex[:6]}"
    resp = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": "SecurePass123!",
            "full_name": "AI Feature Tester",
            "organization_name": org_name,
        },
    )
    assert resp.status_code == 201, f"Registration failed: {resp.text}"
    data = resp.json()
    return {"token": data["access_token"], "org_id": data["organization"]["id"]}


def _upgrade_to_starter(db_session, org_id: int) -> None:
    """Upgrade an organisation to the starter plan directly in the DB."""
    org = db_session.query(Organization).filter(Organization.id == org_id).first()
    assert org is not None, f"Organisation {org_id} not found"
    org.plan = "starter"
    db_session.commit()


def _make_invoice(db_session, org_id: int, **kwargs) -> Invoice:
    """Create and persist a minimal Invoice for a given org."""
    invoice_id = kwargs.pop("invoice_id", f"INV-{uuid.uuid4().hex[:12]}")
    invoice_number = kwargs.pop("invoice_number", f"T-{uuid.uuid4().hex[:6]}")
    inv = Invoice(
        invoice_id=invoice_id,
        invoice_number=invoice_number,
        invoice_date=date.today(),
        due_date=kwargs.pop("due_date", date.today()),
        seller_name=kwargs.pop("seller_name", "Seller GmbH"),
        buyer_name=kwargs.pop("buyer_name", "Buyer AG"),
        net_amount=Decimal("100.00"),
        tax_amount=Decimal("19.00"),
        gross_amount=Decimal("119.00"),
        payment_status=kwargs.pop("payment_status", "unpaid"),
        source_type="manual",
        validation_status="pending",
        organization_id=org_id,
        **kwargs,
    )
    db_session.add(inv)
    db_session.commit()
    db_session.refresh(inv)
    return inv


def _make_mock_ai_client(content: str) -> MagicMock:
    """Return a mock AI client whose completions return the given JSON content string."""
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = content
    mock_client.chat.completions.create.return_value = mock_response
    return mock_client


# ---------------------------------------------------------------------------
# Class TestDraftInvoice
# ---------------------------------------------------------------------------


class TestDraftInvoice:
    """Tests for POST /api/ai/draft-invoice."""

    _FULL_AI_RESPONSE = json.dumps(
        {
            "buyer_name": "Müller GmbH",
            "line_items": [
                {
                    "description": "Beratungsleistung",
                    "quantity": 2,
                    "unit": "Stunden",
                    "unit_price": 120.0,
                }
            ],
            "tax_rate": 19,
            "payment_terms_days": 14,
            "currency": "EUR",
            "notes": "Bitte bis Monatsende überweisen.",
        }
    )

    def test_draft_invoice_success(self, client, db_session):
        """Starter-plan user with full text receives all fields in the response."""
        user = _register_and_get_token(client)
        _upgrade_to_starter(db_session, user["org_id"])

        mock_client = _make_mock_ai_client(self._FULL_AI_RESPONSE)
        with patch("app.routers.ai_features.get_ai_client", return_value=(mock_client, None)):
            with patch.object(settings, "cloud_mode", True):
                resp = client.post(
                    "/api/ai/draft-invoice",
                    json={"text": "Rechnung für 2 Stunden Beratung à 120 EUR an Müller GmbH."},
                    headers={"Authorization": f"Bearer {user['token']}"},
                )

        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["buyer_name"] == "Müller GmbH"
        assert data["tax_rate"] == 19.0
        assert data["payment_terms_days"] == 14
        assert data["currency"] == "EUR"
        assert data["notes"] is not None
        assert len(data["line_items"]) == 1
        assert data["line_items"][0]["description"] == "Beratungsleistung"

    def test_draft_invoice_minimal_text(self, client, db_session):
        """Minimal AI response produces sensible defaults (tax_rate=19, currency=EUR)."""
        user = _register_and_get_token(client)
        _upgrade_to_starter(db_session, user["org_id"])

        minimal_response = json.dumps(
            {
                "buyer_name": None,
                "line_items": [
                    {"description": "Pauschalleistung", "quantity": 1, "unit": "Stück", "unit_price": 500.0}
                ],
                "tax_rate": 19,
                "payment_terms_days": 30,
                "currency": "EUR",
                "notes": None,
            }
        )
        mock_client = _make_mock_ai_client(minimal_response)
        with patch("app.routers.ai_features.get_ai_client", return_value=(mock_client, None)):
            with patch.object(settings, "cloud_mode", True):
                resp = client.post(
                    "/api/ai/draft-invoice",
                    json={"text": "Rechnung 500€"},
                    headers={"Authorization": f"Bearer {user['token']}"},
                )

        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["tax_rate"] == 19.0
        assert data["currency"] == "EUR"
        assert data["payment_terms_days"] == 30

    def test_draft_invoice_free_plan_403(self, client, db_session):
        """Free-plan user is rejected with 403 before any AI call is made."""
        user = _register_and_get_token(client)
        # Deliberately do NOT upgrade the plan — remains "free"

        with patch.object(settings, "cloud_mode", True):
            resp = client.post(
                "/api/ai/draft-invoice",
                json={"text": "Rechnung 100 EUR an Beispiel GmbH"},
                headers={"Authorization": f"Bearer {user['token']}"},
            )

        assert resp.status_code == 403

    def test_draft_invoice_empty_text(self, client, db_session):
        """Empty text string must be rejected with 422."""
        user = _register_and_get_token(client)
        _upgrade_to_starter(db_session, user["org_id"])

        with patch.object(settings, "cloud_mode", True):
            resp = client.post(
                "/api/ai/draft-invoice",
                json={"text": ""},
                headers={"Authorization": f"Bearer {user['token']}"},
            )

        assert resp.status_code == 422

    def test_draft_invoice_text_too_long(self, client, db_session):
        """Text exceeding 2000 characters must be rejected with 422."""
        user = _register_and_get_token(client)
        _upgrade_to_starter(db_session, user["org_id"])

        with patch.object(settings, "cloud_mode", True):
            resp = client.post(
                "/api/ai/draft-invoice",
                json={"text": "x" * 2001},
                headers={"Authorization": f"Bearer {user['token']}"},
            )

        assert resp.status_code == 422

    def test_draft_invoice_contact_matching(self, client, db_session):
        """When a Contact with the buyer_name exists, buyer_id is populated in the response."""
        user = _register_and_get_token(client)
        _upgrade_to_starter(db_session, user["org_id"])

        # Insert a matching contact directly in the DB
        contact = Contact(
            org_id=user["org_id"],
            type="customer",
            name="Müller GmbH",
        )
        db_session.add(contact)
        db_session.commit()
        db_session.refresh(contact)

        mock_client = _make_mock_ai_client(self._FULL_AI_RESPONSE)
        with patch("app.routers.ai_features.get_ai_client", return_value=(mock_client, None)):
            with patch.object(settings, "cloud_mode", True):
                resp = client.post(
                    "/api/ai/draft-invoice",
                    json={"text": "Rechnung an Müller GmbH über 240 EUR"},
                    headers={"Authorization": f"Bearer {user['token']}"},
                )

        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["buyer_name"] == "Müller GmbH"
        assert data["buyer_id"] == str(contact.id)

    def test_draft_invoice_no_ai_client(self, client, db_session):
        """When get_ai_client returns (None, None), the endpoint responds with 503."""
        user = _register_and_get_token(client)
        _upgrade_to_starter(db_session, user["org_id"])

        with patch("app.routers.ai_features.get_ai_client", return_value=(None, None)):
            with patch.object(settings, "cloud_mode", True):
                resp = client.post(
                    "/api/ai/draft-invoice",
                    json={"text": "Rechnung 100 EUR an Beispiel GmbH"},
                    headers={"Authorization": f"Bearer {user['token']}"},
                )

        assert resp.status_code == 503


# ---------------------------------------------------------------------------
# Class TestGenerateReminder
# ---------------------------------------------------------------------------


class TestGenerateReminder:
    """Tests for POST /api/ai/generate-reminder."""

    _FREUNDLICH_RESPONSE = json.dumps(
        {
            "subject": "Zahlungserinnerung zu Ihrer Rechnung",
            "body": (
                "Sehr geehrte Damen und Herren,\n\n"
                "wir möchten Sie freundlich an die ausstehende Zahlung erinnern.\n\n"
                "Mit freundlichen Grüßen"
            ),
        }
    )

    _BESTIMMT_RESPONSE = json.dumps(
        {
            "subject": "Zweite Zahlungserinnerung – sofortige Zahlung erforderlich",
            "body": (
                "Sehr geehrte Damen und Herren,\n\n"
                "wir fordern Sie auf, den Betrag innerhalb von 7 Tagen zu überweisen.\n\n"
                "Mit freundlichen Grüßen"
            ),
        }
    )

    @pytest.fixture()
    def overdue_invoice(self, client, db_session):
        """An invoice with a due_date in the past, owned by a starter-plan user."""
        user = _register_and_get_token(client)
        _upgrade_to_starter(db_session, user["org_id"])
        inv = _make_invoice(
            db_session,
            user["org_id"],
            due_date=date.today() - timedelta(days=15),
            buyer_name="Testkunde GmbH",
        )
        return {"user": user, "invoice": inv}

    def test_generate_reminder_freundlich(self, client, db_session, overdue_invoice):
        """Freundlich tone returns 200 with non-empty subject and body."""
        user = overdue_invoice["user"]
        invoice = overdue_invoice["invoice"]

        mock_client = _make_mock_ai_client(self._FREUNDLICH_RESPONSE)
        with patch("app.routers.ai_features.get_ai_client", return_value=(mock_client, None)):
            with patch.object(settings, "cloud_mode", True):
                resp = client.post(
                    "/api/ai/generate-reminder",
                    json={"invoice_id": invoice.invoice_id, "tone": "freundlich"},
                    headers={"Authorization": f"Bearer {user['token']}"},
                )

        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "subject" in data and data["subject"]
        assert "body" in data and data["body"]

    def test_generate_reminder_bestimmt(self, client, db_session, overdue_invoice):
        """Bestimmt tone returns a distinct response with subject and body."""
        user = overdue_invoice["user"]
        invoice = overdue_invoice["invoice"]

        mock_client = _make_mock_ai_client(self._BESTIMMT_RESPONSE)
        with patch("app.routers.ai_features.get_ai_client", return_value=(mock_client, None)):
            with patch.object(settings, "cloud_mode", True):
                resp = client.post(
                    "/api/ai/generate-reminder",
                    json={"invoice_id": invoice.invoice_id, "tone": "bestimmt"},
                    headers={"Authorization": f"Bearer {user['token']}"},
                )

        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["subject"] != ""
        assert data["body"] != ""

    def test_generate_reminder_invoice_not_found(self, client, db_session):
        """Requesting a reminder for a non-existent invoice_id returns 404."""
        user = _register_and_get_token(client)
        _upgrade_to_starter(db_session, user["org_id"])

        with patch("app.routers.ai_features.get_ai_client", return_value=(_make_mock_ai_client("{}"), None)):
            with patch.object(settings, "cloud_mode", True):
                resp = client.post(
                    "/api/ai/generate-reminder",
                    json={"invoice_id": "INV-does-not-exist", "tone": "freundlich"},
                    headers={"Authorization": f"Bearer {user['token']}"},
                )

        assert resp.status_code == 404

    def test_generate_reminder_wrong_org(self, client, db_session):
        """An invoice belonging to another org returns 404, not the reminder."""
        owner = _register_and_get_token(client)
        _upgrade_to_starter(db_session, owner["org_id"])
        invoice = _make_invoice(db_session, owner["org_id"])

        # A second user from a completely different organisation tries to access it
        other = _register_and_get_token(client)
        _upgrade_to_starter(db_session, other["org_id"])

        with patch("app.routers.ai_features.get_ai_client", return_value=(_make_mock_ai_client("{}"), None)):
            with patch.object(settings, "cloud_mode", True):
                resp = client.post(
                    "/api/ai/generate-reminder",
                    json={"invoice_id": invoice.invoice_id, "tone": "freundlich"},
                    headers={"Authorization": f"Bearer {other['token']}"},
                )

        assert resp.status_code == 404

    def test_generate_reminder_free_plan(self, client, db_session):
        """Free-plan user receives 403 when requesting a payment reminder."""
        user = _register_and_get_token(client)
        # Plan stays "free"
        invoice = _make_invoice(db_session, user["org_id"])

        with patch.object(settings, "cloud_mode", True):
            resp = client.post(
                "/api/ai/generate-reminder",
                json={"invoice_id": invoice.invoice_id, "tone": "freundlich"},
                headers={"Authorization": f"Bearer {user['token']}"},
            )

        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Class TestSuggestLineItem
# ---------------------------------------------------------------------------


class TestSuggestLineItem:
    """Tests for POST /api/ai/suggest-line-item."""

    def test_suggest_history_match(self, client, db_session):
        """When the org has a matching invoice line item, source='history' is returned without AI."""
        user = _register_and_get_token(client)
        _make_invoice(
            db_session,
            user["org_id"],
            line_items=[
                {"description": "Webentwicklung Frontend", "quantity": 5, "unit": "Stunden", "unit_price": 90.0, "tax_rate": 19.0}
            ],
        )

        mock_client = MagicMock()
        with patch("app.routers.ai_features.get_ai_client", return_value=(mock_client, None)):
            with patch.object(settings, "cloud_mode", True):
                resp = client.post(
                    "/api/ai/suggest-line-item",
                    json={"description_prefix": "Webent"},
                    headers={"Authorization": f"Bearer {user['token']}"},
                )

        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert len(data["suggestions"]) >= 1
        assert data["suggestions"][0]["source"] == "history"
        assert "Webentwicklung Frontend" in data["suggestions"][0]["description"]
        # AI must NOT have been called when history matches
        mock_client.chat.completions.create.assert_not_called()

    def test_suggest_no_history_ai_fallback(self, client, db_session):
        """No history match with a 5+ char prefix triggers an AI call on starter plan."""
        user = _register_and_get_token(client)
        _upgrade_to_starter(db_session, user["org_id"])
        # Org has no invoices at all — no history

        ai_suggestions = json.dumps(
            [
                {"description": "React Entwicklung", "unit_price": 95.0, "unit": "Stunden", "tax_rate": 19},
                {"description": "React Native App", "unit_price": 110.0, "unit": "Stunden", "tax_rate": 19},
            ]
        )
        mock_client = _make_mock_ai_client(ai_suggestions)
        with patch("app.routers.ai_features.get_ai_client", return_value=(mock_client, None)):
            with patch.object(settings, "cloud_mode", True):
                resp = client.post(
                    "/api/ai/suggest-line-item",
                    json={"description_prefix": "React"},
                    headers={"Authorization": f"Bearer {user['token']}"},
                )

        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert len(data["suggestions"]) >= 1
        assert data["suggestions"][0]["source"] == "ai"
        mock_client.chat.completions.create.assert_called_once()

    def test_suggest_prefix_too_short(self, client, db_session):
        """A prefix with fewer than 3 characters returns an empty suggestions list."""
        user = _register_and_get_token(client)

        with patch.object(settings, "cloud_mode", True):
            resp = client.post(
                "/api/ai/suggest-line-item",
                json={"description_prefix": "ab"},
                headers={"Authorization": f"Bearer {user['token']}"},
            )

        assert resp.status_code == 200, resp.text
        assert resp.json()["suggestions"] == []

    def test_suggest_deduplication(self, client, db_session):
        """Identical line-item descriptions across multiple invoices produce only one suggestion."""
        user = _register_and_get_token(client)
        line_items = [
            {"description": "Webentwicklung Backend", "quantity": 3, "unit": "Stunden", "unit_price": 100.0, "tax_rate": 19.0}
        ]
        _make_invoice(db_session, user["org_id"], line_items=line_items)
        _make_invoice(db_session, user["org_id"], line_items=line_items)

        with patch.object(settings, "cloud_mode", True):
            resp = client.post(
                "/api/ai/suggest-line-item",
                json={"description_prefix": "Webentwicklung"},
                headers={"Authorization": f"Bearer {user['token']}"},
            )

        assert resp.status_code == 200, resp.text
        data = resp.json()
        descriptions = [s["description"] for s in data["suggestions"]]
        assert len(descriptions) == len(set(d.lower() for d in descriptions)), (
            "Duplicate descriptions found in suggestions"
        )

    def test_suggest_requires_auth(self, client):
        """Calling the endpoint without any token must be rejected (401 or 403)."""
        resp = client.post(
            "/api/ai/suggest-line-item",
            json={"description_prefix": "Webentwicklung"},
        )
        assert resp.status_code in (401, 403)
