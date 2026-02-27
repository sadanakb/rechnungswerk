"""Tests for send invoice by email endpoint (Task 8)."""
import pytest
from unittest.mock import AsyncMock, patch


class TestSendInvoiceEmail:
    """Test the send-email endpoint on invoices."""

    def _create_invoice(self, client, invoice_number="RE-2026-EMAIL-001"):
        """Helper: create a minimal invoice and return the Invoice row data."""
        resp = client.post(
            "/api/invoices",
            json={
                "invoice_number": invoice_number,
                "invoice_date": "2026-02-27",
                "seller_name": "Email Test GmbH",
                "seller_vat_id": "DE123456789",
                "seller_address": "Teststraße 1, 60311 Frankfurt",
                "buyer_name": "Empfänger GmbH",
                "buyer_vat_id": "DE987654321",
                "buyer_address": "Hauptstraße 5, 10115 Berlin",
                "tax_rate": 19.0,
                "currency": "EUR",
                "source_type": "manual",
                "iban": "DE89370400440532013000",
                "bic": "COBADEFFXXX",
                "payment_account_name": "Email Test GmbH",
                "line_items": [
                    {
                        "description": "Testleistung",
                        "quantity": 1.0,
                        "unit_price": 100.0,
                        "net_amount": 100.0,
                        "tax_rate": 19.0,
                    }
                ],
            },
        )
        assert resp.status_code in (200, 201), f"Invoice creation failed: {resp.text}"
        return resp.json()

    def test_send_creates_share_link_if_missing(self, client, db_session):
        """POST /api/invoices/{id}/send-email should auto-create a share link if none exists."""
        from app.models import InvoiceShareLink

        data = self._create_invoice(client)
        invoice_id = data.get("invoice_id") or data.get("id")

        # Ensure no existing link
        # (freshly created invoice has no link yet by default)
        link_count_before = db_session.query(InvoiceShareLink).count()

        with patch("app.email_service.enqueue_email", new_callable=AsyncMock) as mock_enqueue:
            mock_enqueue.return_value = True
            response = client.post(
                f"/api/invoices/{invoice_id}/send-email",
                json={"to_email": "kunde@example.com"},
            )

        assert response.status_code == 200, response.text
        resp_data = response.json()
        assert "token" in resp_data
        assert resp_data["portal_url"].startswith("/portal/")

        # Verify link was created in DB
        link_count_after = db_session.query(InvoiceShareLink).count()
        assert link_count_after == link_count_before + 1

    def test_send_email_called_with_correct_args(self, client):
        """The enqueue_email function should be called with correct invoice data."""
        data = self._create_invoice(client, invoice_number="RE-2026-EMAIL-002")
        invoice_id = data.get("invoice_id") or data.get("id")

        with patch("app.email_service.enqueue_email", new_callable=AsyncMock) as mock_enqueue:
            mock_enqueue.return_value = True
            response = client.post(
                f"/api/invoices/{invoice_id}/send-email",
                json={"to_email": "empfaenger@test.de"},
            )

        assert response.status_code == 200, response.text
        mock_enqueue.assert_called_once()
        call_args = mock_enqueue.call_args
        # Second positional arg should be the task type
        assert call_args[0][1] == "invoice_portal"
        # to_email kwarg should match what we sent
        assert call_args[1]["to_email"] == "empfaenger@test.de"

    def test_send_invoice_email_nonexistent_invoice_returns_404(self, client):
        """Sending email for a non-existent invoice should return 404."""
        response = client.post(
            "/api/invoices/INV-99990101-nonexist/send-email",
            json={"to_email": "test@example.com"},
        )
        assert response.status_code == 404
