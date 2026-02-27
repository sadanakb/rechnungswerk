"""
Tests for invoice overdue auto-detection.

Covers GET /api/invoices/check-overdue and lazy overdue marking
on GET /api/invoices list.
"""
import uuid
from datetime import date, timedelta

import pytest


def _make_invoice_data(due_date: str, invoice_number: str | None = None) -> dict:
    """Return minimal valid invoice data with a specific due_date."""
    return {
        "invoice_number": invoice_number or f"RE-OD-{uuid.uuid4().hex[:6].upper()}",
        "invoice_date": "2026-01-01",
        "due_date": due_date,
        "seller_name": "Testfirma GmbH",
        "seller_vat_id": "DE123456789",
        "seller_address": "Teststrasse 1, 60311 Frankfurt am Main",
        "buyer_name": "Kaeufer AG",
        "buyer_vat_id": "DE987654321",
        "buyer_address": "Hauptstrasse 5, 10115 Berlin",
        "line_items": [
            {
                "description": "Beratung",
                "quantity": 1.0,
                "unit_price": 100.0,
                "net_amount": 100.0,
                "tax_rate": 19.0,
            }
        ],
        "tax_rate": 19.0,
        "iban": "DE89370400440532013000",
        "bic": "COBADEFFXXX",
        "payment_account_name": "Testfirma GmbH",
        "currency": "EUR",
    }


class TestOverdueDetection:
    """GET /api/invoices/check-overdue"""

    def test_unpaid_past_due_becomes_overdue(self, client):
        """An unpaid invoice with a due_date in the past should be marked overdue."""
        yesterday = str(date.today() - timedelta(days=1))
        data = _make_invoice_data(due_date=yesterday)

        create_resp = client.post("/api/invoices", json=data)
        assert create_resp.status_code == 200
        invoice_id = create_resp.json()["invoice_id"]

        # Confirm starting status is unpaid
        detail = client.get(f"/api/invoices/{invoice_id}").json()
        assert detail["payment_status"] == "unpaid"

        # Trigger overdue check
        check_resp = client.get("/api/invoices/check-overdue")
        assert check_resp.status_code == 200
        result = check_resp.json()
        assert result["updated"] >= 1

        # Confirm invoice is now overdue
        detail_after = client.get(f"/api/invoices/{invoice_id}").json()
        assert detail_after["payment_status"] == "overdue"

    def test_not_yet_due_stays_unpaid(self, client):
        """An unpaid invoice with a future due_date must NOT be changed to overdue."""
        tomorrow = str(date.today() + timedelta(days=1))
        data = _make_invoice_data(due_date=tomorrow)

        create_resp = client.post("/api/invoices", json=data)
        assert create_resp.status_code == 200
        invoice_id = create_resp.json()["invoice_id"]

        check_resp = client.get("/api/invoices/check-overdue")
        assert check_resp.status_code == 200
        result = check_resp.json()
        assert result["updated"] == 0

        # Status must remain unpaid
        detail = client.get(f"/api/invoices/{invoice_id}").json()
        assert detail["payment_status"] == "unpaid"

    def test_already_paid_not_changed(self, client):
        """A paid invoice with a past due_date must NOT be changed to overdue."""
        yesterday = str(date.today() - timedelta(days=1))
        data = _make_invoice_data(due_date=yesterday)

        create_resp = client.post("/api/invoices", json=data)
        assert create_resp.status_code == 200
        invoice_id = create_resp.json()["invoice_id"]

        # Mark as paid first
        patch_resp = client.patch(
            f"/api/invoices/{invoice_id}/payment-status",
            json={"status": "paid", "paid_date": str(date.today())},
        )
        assert patch_resp.status_code == 200

        # check-overdue must not touch the paid invoice
        check_resp = client.get("/api/invoices/check-overdue")
        assert check_resp.status_code == 200
        assert check_resp.json()["updated"] == 0

        # Status must remain paid
        detail = client.get(f"/api/invoices/{invoice_id}").json()
        assert detail["payment_status"] == "paid"
