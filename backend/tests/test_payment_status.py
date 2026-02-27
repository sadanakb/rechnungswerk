"""
Tests for the invoice payment status lifecycle.

Covers: PATCH /api/invoices/{id}/payment-status and
        GET /api/invoices?payment_status= filter.
"""
import pytest
from datetime import date


class TestPaymentStatus:
    """PATCH /api/invoices/{invoice_id}/payment-status"""

    def test_mark_invoice_as_paid(self, client, sample_invoice_data):
        """Marking an invoice paid should return ok=True and status=paid."""
        create_resp = client.post("/api/invoices", json=sample_invoice_data)
        assert create_resp.status_code == 200
        invoice_id = create_resp.json()["invoice_id"]

        patch_resp = client.patch(
            f"/api/invoices/{invoice_id}/payment-status",
            json={
                "status": "paid",
                "paid_date": "2026-02-27",
                "payment_method": "Ueberweisung",
                "payment_reference": "TXN-12345",
            },
        )
        assert patch_resp.status_code == 200
        data = patch_resp.json()
        assert data["ok"] is True
        assert data["payment_status"] == "paid"

        # Verify it persisted via GET
        get_resp = client.get(f"/api/invoices/{invoice_id}")
        assert get_resp.status_code == 200
        detail = get_resp.json()
        assert detail["payment_status"] == "paid"
        assert detail["paid_date"] == "2026-02-27"
        assert detail["payment_method"] == "Ueberweisung"
        assert detail["payment_reference"] == "TXN-12345"

    def test_mark_invoice_as_overdue(self, client, sample_invoice_data):
        """Status can be changed to overdue."""
        create_resp = client.post("/api/invoices", json=sample_invoice_data)
        invoice_id = create_resp.json()["invoice_id"]

        patch_resp = client.patch(
            f"/api/invoices/{invoice_id}/payment-status",
            json={"status": "overdue"},
        )
        assert patch_resp.status_code == 200
        assert patch_resp.json()["payment_status"] == "overdue"

    def test_partial_payment(self, client, sample_invoice_data):
        """Status can be set to partial."""
        create_resp = client.post("/api/invoices", json=sample_invoice_data)
        invoice_id = create_resp.json()["invoice_id"]

        patch_resp = client.patch(
            f"/api/invoices/{invoice_id}/payment-status",
            json={"status": "partial", "payment_reference": "PART-001"},
        )
        assert patch_resp.status_code == 200
        assert patch_resp.json()["payment_status"] == "partial"

        # Verify reference persisted
        get_resp = client.get(f"/api/invoices/{invoice_id}")
        assert get_resp.json()["payment_reference"] == "PART-001"

    def test_invalid_status_rejected(self, client, sample_invoice_data):
        """An unrecognised status value must be rejected with HTTP 400."""
        create_resp = client.post("/api/invoices", json=sample_invoice_data)
        invoice_id = create_resp.json()["invoice_id"]

        patch_resp = client.patch(
            f"/api/invoices/{invoice_id}/payment-status",
            json={"status": "invalid_status"},
        )
        assert patch_resp.status_code == 400
        assert "Erlaubt" in patch_resp.json()["detail"]

    def test_payment_status_filter(self, client, sample_invoice_data):
        """GET ?payment_status=paid should return only paid invoices."""
        # Create 3 invoices
        ids = []
        for i in range(3):
            data = {**sample_invoice_data, "invoice_number": f"RE-FILTER-{i:03d}"}
            resp = client.post("/api/invoices", json=data)
            assert resp.status_code == 200
            ids.append(resp.json()["invoice_id"])

        # Mark first two as paid
        for inv_id in ids[:2]:
            patch_resp = client.patch(
                f"/api/invoices/{inv_id}/payment-status",
                json={"status": "paid"},
            )
            assert patch_resp.status_code == 200

        # Filter: paid should return exactly 2
        list_resp = client.get("/api/invoices?payment_status=paid")
        assert list_resp.status_code == 200
        data = list_resp.json()
        assert data["total"] == 2
        for item in data["items"]:
            assert item["payment_status"] == "paid"

        # Filter: unpaid should return exactly 1
        list_resp_unpaid = client.get("/api/invoices?payment_status=unpaid")
        assert list_resp_unpaid.status_code == 200
        unpaid_data = list_resp_unpaid.json()
        assert unpaid_data["total"] == 1
        assert unpaid_data["items"][0]["invoice_id"] == ids[2]
