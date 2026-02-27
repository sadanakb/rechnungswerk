"""Tests for Mahnwesen email sending and status update endpoints."""
import uuid
import pytest
from unittest.mock import patch, MagicMock
from datetime import date, timedelta
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import Base, Invoice
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


def _register_and_get_token(client: TestClient) -> dict:
    """Register a user and return dict with access_token and org_id."""
    resp = client.post("/api/auth/register", json={
        "email": f"mahnung-email-{uuid.uuid4().hex[:6]}@test.de",
        "password": "SecurePass123!",
        "full_name": "Mahnwesen Email Tester",
        "organization_name": "Mahnung Email GmbH",
    })
    assert resp.status_code == 201, f"Registration failed: {resp.text}"
    data = resp.json()
    return {
        "access_token": data["access_token"],
        "org_id": data["organization"]["id"],
    }


def _create_overdue_invoice(db_session, org_id: int, buyer_endpoint_id: str = None) -> str:
    """Insert an overdue invoice directly into the DB and return its invoice_id."""
    invoice_id = f"INV-{date.today().strftime('%Y%m%d')}-{uuid.uuid4().hex[:8]}"
    inv = Invoice(
        invoice_id=invoice_id,
        invoice_number="RE-2026-EMAIL-TEST",
        invoice_date=date.today() - timedelta(days=60),
        due_date=date.today() - timedelta(days=30),
        seller_name="Verkaufer GmbH",
        seller_vat_id="DE123456789",
        seller_address="Musterstrasse 1, 60311 Frankfurt",
        buyer_name="Kaeufer AG",
        buyer_vat_id="DE987654321",
        buyer_address="Hauptstrasse 5, 10115 Berlin",
        buyer_endpoint_id=buyer_endpoint_id,
        buyer_endpoint_scheme="EM" if buyer_endpoint_id else None,
        net_amount=Decimal("1000.00"),
        tax_amount=Decimal("190.00"),
        gross_amount=Decimal("1190.00"),
        tax_rate=Decimal("19.00"),
        currency="EUR",
        line_items=[{
            "description": "Beratungsleistung",
            "quantity": 1.0,
            "unit_price": 1000.0,
            "net_amount": 1000.0,
            "tax_rate": 19.0,
        }],
        iban="DE89370400440532013000",
        bic="COBADEFFXXX",
        payment_account_name="Verkaufer GmbH",
        source_type="manual",
        validation_status="pending",
        organization_id=org_id,
    )
    db_session.add(inv)
    db_session.commit()
    return invoice_id


def test_create_mahnung_sends_email(client, db_session):
    """POST /{invoice_id}/mahnung should attempt to send email when buyer email exists."""
    auth = _register_and_get_token(client)
    invoice_id = _create_overdue_invoice(
        db_session, auth["org_id"],
        buyer_endpoint_id="kaeufer@example.com",
    )

    with patch("app.routers.mahnwesen.send_mahnung_email", return_value=True) as mock_send:
        resp = client.post(
            f"/api/mahnwesen/{invoice_id}/mahnung",
            headers={"Authorization": f"Bearer {auth['access_token']}"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["level"] == 1
        assert data["status"] == "sent"
        assert data["sent_at"] is not None

        # Verify send_mahnung_email was called with correct params
        mock_send.assert_called_once()
        call_kwargs = mock_send.call_args
        args = call_kwargs[1] if call_kwargs[1] else {}
        # Check positional or keyword args
        if args:
            assert args["to_email"] == "kaeufer@example.com"
            assert args["level"] == 1
            assert args["invoice_number"] == "RE-2026-EMAIL-TEST"
        else:
            # Positional args
            call_args = call_kwargs[0]
            assert call_args[0] == "kaeufer@example.com"  # to_email


def test_create_mahnung_no_email_skips_send(client, db_session):
    """POST /{invoice_id}/mahnung should NOT attempt to send email when no buyer email."""
    auth = _register_and_get_token(client)
    invoice_id = _create_overdue_invoice(
        db_session, auth["org_id"],
        buyer_endpoint_id=None,  # No email
    )

    with patch("app.routers.mahnwesen.send_mahnung_email") as mock_send:
        resp = client.post(
            f"/api/mahnwesen/{invoice_id}/mahnung",
            headers={"Authorization": f"Bearer {auth['access_token']}"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["level"] == 1
        assert data["status"] == "created"
        assert data["sent_at"] is None

        # Email should NOT have been called
        mock_send.assert_not_called()


def test_update_mahnung_status_to_paid(client, db_session):
    """PATCH /{mahnung_id}/status with status='paid' should update the Mahnung."""
    auth = _register_and_get_token(client)
    invoice_id = _create_overdue_invoice(db_session, auth["org_id"])
    headers = {"Authorization": f"Bearer {auth['access_token']}"}

    # Create a Mahnung first
    with patch("app.routers.mahnwesen.send_mahnung_email", return_value=False):
        create_resp = client.post(f"/api/mahnwesen/{invoice_id}/mahnung", headers=headers)
    assert create_resp.status_code == 201
    mahnung_id = create_resp.json()["mahnung_id"]

    # Update status to paid
    resp = client.patch(
        f"/api/mahnwesen/{mahnung_id}/status",
        headers=headers,
        json={"status": "paid"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "paid"
    assert data["mahnung_id"] == mahnung_id


def test_update_mahnung_status_to_cancelled(client, db_session):
    """PATCH /{mahnung_id}/status with status='cancelled' should update the Mahnung."""
    auth = _register_and_get_token(client)
    invoice_id = _create_overdue_invoice(db_session, auth["org_id"])
    headers = {"Authorization": f"Bearer {auth['access_token']}"}

    # Create a Mahnung first
    with patch("app.routers.mahnwesen.send_mahnung_email", return_value=False):
        create_resp = client.post(f"/api/mahnwesen/{invoice_id}/mahnung", headers=headers)
    assert create_resp.status_code == 201
    mahnung_id = create_resp.json()["mahnung_id"]

    # Update status to cancelled
    resp = client.patch(
        f"/api/mahnwesen/{mahnung_id}/status",
        headers=headers,
        json={"status": "cancelled"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "cancelled"
    assert data["mahnung_id"] == mahnung_id
