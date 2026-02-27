"""Tests for public portal API endpoints (Task 7)."""
import pytest
from datetime import datetime, timedelta


class TestPortalAPI:

    def _setup_invoice_and_link(self, client):
        """Helper: create invoice + share link, return (invoice_id, token)."""
        resp = client.post(
            "/api/invoices",
            json={
                "invoice_number": "RE-PORTAL-001",
                "invoice_date": "2026-02-27",
                "seller_name": "Portal GmbH",
                "seller_vat_id": "DE123456789",
                "seller_address": "Portalstraße 1, 60311 Frankfurt",
                "buyer_name": "Kunde GmbH",
                "buyer_vat_id": "DE987654321",
                "buyer_address": "Hauptstraße 5, 10115 Berlin",
                "tax_rate": 19.0,
                "currency": "EUR",
                "source_type": "manual",
                "iban": "DE89370400440532013000",
                "bic": "COBADEFFXXX",
                "payment_account_name": "Portal GmbH",
                "line_items": [
                    {
                        "description": "Portalleistung",
                        "quantity": 1.0,
                        "unit_price": 200.0,
                        "net_amount": 200.0,
                        "tax_rate": 19.0,
                    }
                ],
            },
        )
        assert resp.status_code in (200, 201), f"Invoice creation failed: {resp.text}"
        invoice_id = resp.json().get("invoice_id") or resp.json().get("id")

        link_resp = client.post(f"/api/invoices/{invoice_id}/share-link")
        assert link_resp.status_code == 201, f"Share link creation failed: {link_resp.text}"
        token = link_resp.json()["token"]

        return invoice_id, token

    def test_get_portal_invoice_returns_data(self, client):
        """GET /api/portal/{token} should return invoice data without auth."""
        _, token = self._setup_invoice_and_link(client)

        # No auth headers — this is a public endpoint
        resp = client.get(f"/api/portal/{token}")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["invoice_number"] == "RE-PORTAL-001"
        assert data["buyer_name"] == "Kunde GmbH"
        assert "payment_status" in data

    def test_invalid_token_returns_404(self, client):
        """GET /api/portal/{token} with unknown token should return 404."""
        resp = client.get("/api/portal/00000000-0000-0000-0000-000000000000")
        assert resp.status_code == 404

    def test_confirm_payment_updates_status(self, client):
        """POST /api/portal/{token}/confirm-payment should mark invoice as paid."""
        invoice_id, token = self._setup_invoice_and_link(client)

        resp = client.post(f"/api/portal/{token}/confirm-payment")
        assert resp.status_code == 200, resp.text
        assert resp.json()["payment_status"] == "paid"

        # Verify via portal GET that status is updated
        get_resp = client.get(f"/api/portal/{token}")
        assert get_resp.status_code == 200
        assert get_resp.json()["payment_status"] == "paid"

    def test_expired_token_returns_410(self, client, db_session):
        """Portal endpoint should return 410 for expired tokens."""
        from app.models import InvoiceShareLink

        _, token = self._setup_invoice_and_link(client)

        # Manually expire the token using the test db_session
        link = db_session.query(InvoiceShareLink).filter(
            InvoiceShareLink.token == token
        ).first()
        link.expires_at = datetime.utcnow() - timedelta(days=1)
        db_session.commit()

        resp = client.get(f"/api/portal/{token}")
        assert resp.status_code == 410

    def test_xml_download_returns_xml_content_type(self, client):
        """GET /api/portal/{token}/download-xml should return XML content type."""
        _, token = self._setup_invoice_and_link(client)

        resp = client.get(f"/api/portal/{token}/download-xml")
        assert resp.status_code == 200
        assert "xml" in resp.headers.get("content-type", "").lower()

    def test_access_count_increments(self, client, db_session):
        """Each GET to the portal endpoint should increment access_count."""
        from app.models import InvoiceShareLink

        _, token = self._setup_invoice_and_link(client)

        link_before = db_session.query(InvoiceShareLink).filter(
            InvoiceShareLink.token == token
        ).first()
        count_before = link_before.access_count

        client.get(f"/api/portal/{token}")
        db_session.refresh(link_before)
        assert link_before.access_count == count_before + 1

    def test_confirm_payment_idempotent(self, client):
        """Confirming payment twice should return 'paid' both times."""
        _, token = self._setup_invoice_and_link(client)

        resp1 = client.post(f"/api/portal/{token}/confirm-payment")
        assert resp1.status_code == 200
        assert resp1.json()["payment_status"] == "paid"

        resp2 = client.post(f"/api/portal/{token}/confirm-payment")
        assert resp2.status_code == 200
        assert resp2.json()["payment_status"] == "paid"
