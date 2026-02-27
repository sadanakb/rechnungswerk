"""Tests for invoice share link endpoints (Task 6)."""
import pytest


class TestShareLinks:

    def _create_invoice(self, client):
        """Helper: create a minimal invoice and return its invoice_id."""
        resp = client.post(
            "/api/invoices",
            json={
                "invoice_number": "RE-2026-SHARE-001",
                "invoice_date": "2026-02-27",
                "seller_name": "Test GmbH",
                "seller_vat_id": "DE123456789",
                "seller_address": "Teststraße 1, 60311 Frankfurt",
                "buyer_name": "Kunde GmbH",
                "buyer_vat_id": "DE987654321",
                "buyer_address": "Hauptstraße 5, 10115 Berlin",
                "tax_rate": 19.0,
                "currency": "EUR",
                "source_type": "manual",
                "iban": "DE89370400440532013000",
                "bic": "COBADEFFXXX",
                "payment_account_name": "Test GmbH",
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
        data = resp.json()
        return data.get("invoice_id") or data.get("id")

    def test_create_share_link_returns_token_and_url(self, client):
        """Creating a share link should return a token and /portal/ URL."""
        invoice_id = self._create_invoice(client)

        resp = client.post(f"/api/invoices/{invoice_id}/share-link")
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert "token" in data
        assert data["url"] == f"/portal/{data['token']}"
        assert "expires_at" in data
        assert len(data["token"]) == 36  # UUID v4 format

    def test_create_share_link_regenerates_on_duplicate(self, client):
        """Creating a second share link for the same invoice should replace the first."""
        invoice_id = self._create_invoice(client)

        resp1 = client.post(f"/api/invoices/{invoice_id}/share-link")
        assert resp1.status_code == 201
        token1 = resp1.json()["token"]

        resp2 = client.post(f"/api/invoices/{invoice_id}/share-link")
        assert resp2.status_code == 201
        token2 = resp2.json()["token"]

        assert token1 != token2  # New token generated

    def test_delete_share_link_revokes_it(self, client):
        """Deleting a share link should return 204."""
        invoice_id = self._create_invoice(client)

        client.post(f"/api/invoices/{invoice_id}/share-link")

        resp = client.delete(f"/api/invoices/{invoice_id}/share-link")
        assert resp.status_code == 204

    def test_share_link_not_found_for_wrong_invoice(self, client):
        """Requesting a share link for a non-existent invoice should return 404."""
        resp = client.post("/api/invoices/NONEXISTENT-ID-99999/share-link")
        assert resp.status_code == 404

    def test_share_link_delete_nonexistent_invoice_returns_404(self, client):
        """Deleting share link for a non-existent invoice should return 404."""
        resp = client.delete("/api/invoices/NONEXISTENT-ID-99999/share-link")
        assert resp.status_code == 404

    def test_share_link_delete_without_existing_link_returns_204(self, client):
        """Deleting a share link that doesn't exist yet should return 204 (idempotent)."""
        invoice_id = self._create_invoice(client)
        resp = client.delete(f"/api/invoices/{invoice_id}/share-link")
        assert resp.status_code == 204
