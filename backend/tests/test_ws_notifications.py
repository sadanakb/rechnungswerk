"""Tests for WebSocket event notifications from invoice actions (Task 4)."""
import uuid
from datetime import datetime, timedelta, date

import pytest
from unittest.mock import AsyncMock, patch

from app.models import Invoice, InvoiceShareLink


@pytest.fixture()
def test_user():
    """Minimal user dict as used by share-link creation."""
    return {"user_id": 1}


@pytest.fixture()
def test_invoice(db_session):
    """A persisted Invoice row for use in portal tests."""
    inv = Invoice(
        invoice_id=f"INV-TEST-{uuid.uuid4().hex[:8].upper()}",
        invoice_number="RE-2026-WS-001",
        invoice_date=date(2026, 2, 28),
        due_date=date(2026, 3, 28),
        seller_name="Test Seller GmbH",
        seller_vat_id="DE111222333",
        seller_address="Teststraße 1, 60311 Frankfurt",
        buyer_name="Test Buyer AG",
        buyer_vat_id="DE444555666",
        buyer_address="Käuferstraße 5, 10115 Berlin",
        net_amount=1000.00,
        tax_amount=190.00,
        gross_amount=1190.00,
        tax_rate=19.0,
        currency="EUR",
        line_items=[{"description": "Test", "quantity": 1, "unit_price": 1000.0}],
        iban="DE89370400440532013000",
        bic="COBADEFFXXX",
        payment_account_name="Test Seller GmbH",
        source_type="manual",
        payment_status="unpaid",
        organization_id=None,
    )
    db_session.add(inv)
    db_session.commit()
    db_session.refresh(inv)
    return inv


class TestWebSocketNotifications:

    def test_portal_confirm_payment_sends_ws_event(self, client, db_session, test_user, test_invoice):
        """Confirming payment via portal should trigger a WebSocket event."""
        link = InvoiceShareLink(
            invoice_id=test_invoice.id,
            token=str(uuid.uuid4()),
            expires_at=datetime.utcnow() + timedelta(days=30),
            created_by_user_id=test_user["user_id"],
        )
        db_session.add(link)
        db_session.commit()
        db_session.refresh(link)

        with patch("app.ws.notify_org", new_callable=AsyncMock) as mock_notify:
            response = client.post(f"/api/portal/{link.token}/confirm-payment")

        assert response.status_code == 200
        mock_notify.assert_called_once()
        call_args = mock_notify.call_args
        assert call_args[0][1] == "invoice.paid"

    def test_portal_visit_sends_ws_event(self, client, db_session, test_user, test_invoice):
        """Visiting the portal GET endpoint should trigger a portal.visited event."""
        link = InvoiceShareLink(
            invoice_id=test_invoice.id,
            token=str(uuid.uuid4()),
            expires_at=datetime.utcnow() + timedelta(days=30),
            created_by_user_id=test_user["user_id"],
        )
        db_session.add(link)
        db_session.commit()
        db_session.refresh(link)

        with patch("app.ws.notify_org", new_callable=AsyncMock) as mock_notify:
            response = client.get(f"/api/portal/{link.token}")

        assert response.status_code == 200
        mock_notify.assert_called_once()
        assert mock_notify.call_args[0][1] == "portal.visited"
