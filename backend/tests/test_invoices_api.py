"""
Integration tests for the invoice API endpoints.

Tests exercise the full stack: HTTP → FastAPI → SQLAlchemy → in-memory SQLite.
External services (OCR, Ollama) are NOT tested here — see test_ocr_pipeline.py.
"""
import pytest
from datetime import date


class TestCreateInvoice:
    """POST /api/invoices"""

    def test_create_invoice_success(self, client, sample_invoice_data):
        resp = client.post("/api/invoices", json=sample_invoice_data)
        assert resp.status_code == 200

        data = resp.json()
        assert data["invoice_number"] == "RE-2026-001"
        assert data["seller_name"] == "Musterfirma GmbH"
        assert data["source_type"] == "manual"
        assert data["validation_status"] == "pending"
        assert data["invoice_id"].startswith("INV-")
        assert data["net_amount"] == 1500.0
        assert data["tax_amount"] == pytest.approx(285.0)
        assert data["gross_amount"] == pytest.approx(1785.0)

    def test_create_invoice_calculates_amounts(self, client, sample_invoice_data):
        """Amounts should be auto-calculated from line items + tax_rate."""
        sample_invoice_data["line_items"] = [
            {"description": "A", "quantity": 2, "unit_price": 100, "net_amount": 200, "tax_rate": 19},
            {"description": "B", "quantity": 1, "unit_price": 300, "net_amount": 300, "tax_rate": 19},
        ]
        resp = client.post("/api/invoices", json=sample_invoice_data)
        assert resp.status_code == 200
        data = resp.json()
        assert data["net_amount"] == 500.0
        assert data["tax_amount"] == pytest.approx(95.0)
        assert data["gross_amount"] == pytest.approx(595.0)

    def test_create_invoice_invalid_iban(self, client, sample_invoice_data):
        sample_invoice_data["iban"] = "INVALID"
        resp = client.post("/api/invoices", json=sample_invoice_data)
        assert resp.status_code == 422


class TestListInvoices:
    """GET /api/invoices"""

    def test_empty_list(self, client):
        resp = client.get("/api/invoices")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

    def test_list_after_create(self, client, sample_invoice_data):
        client.post("/api/invoices", json=sample_invoice_data)
        resp = client.get("/api/invoices")
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["invoice_number"] == "RE-2026-001"

    def test_pagination(self, client, sample_invoice_data):
        # Create 3 invoices
        for i in range(3):
            data = {**sample_invoice_data, "invoice_number": f"RE-2026-{i:03d}"}
            client.post("/api/invoices", json=data)

        resp = client.get("/api/invoices?skip=1&limit=1")
        data = resp.json()
        assert data["total"] == 3
        assert len(data["items"]) == 1
        assert data["skip"] == 1
        assert data["limit"] == 1


class TestGetInvoice:
    """GET /api/invoices/{invoice_id}"""

    def test_get_existing_invoice(self, client, sample_invoice_data):
        create_resp = client.post("/api/invoices", json=sample_invoice_data)
        invoice_id = create_resp.json()["invoice_id"]

        resp = client.get(f"/api/invoices/{invoice_id}")
        assert resp.status_code == 200
        assert resp.json()["invoice_id"] == invoice_id

    def test_get_nonexistent_invoice(self, client):
        resp = client.get("/api/invoices/INV-20260223-00000000")
        assert resp.status_code == 404


class TestDeleteInvoice:
    """DELETE /api/invoices/{invoice_id}"""

    def test_delete_existing(self, client, sample_invoice_data):
        create_resp = client.post("/api/invoices", json=sample_invoice_data)
        invoice_id = create_resp.json()["invoice_id"]

        resp = client.delete(f"/api/invoices/{invoice_id}")
        assert resp.status_code == 200
        assert resp.json()["message"] == "Rechnung gelöscht"

        # Confirm deleted
        resp = client.get(f"/api/invoices/{invoice_id}")
        assert resp.status_code == 404

    def test_delete_nonexistent(self, client):
        resp = client.delete("/api/invoices/INV-20260223-00000000")
        assert resp.status_code == 404


class TestGenerateXRechnung:
    """POST /api/invoices/{id}/generate-xrechnung"""

    def test_generate_xrechnung(self, client, sample_invoice_data):
        create_resp = client.post("/api/invoices", json=sample_invoice_data)
        invoice_id = create_resp.json()["invoice_id"]

        resp = client.post(f"/api/invoices/{invoice_id}/generate-xrechnung")
        assert resp.status_code == 200
        data = resp.json()
        assert "download_url" in data

    def test_download_xrechnung(self, client, sample_invoice_data):
        create_resp = client.post("/api/invoices", json=sample_invoice_data)
        invoice_id = create_resp.json()["invoice_id"]

        # Generate first
        client.post(f"/api/invoices/{invoice_id}/generate-xrechnung")

        # Then download
        resp = client.get(f"/api/invoices/{invoice_id}/download-xrechnung")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/xml"
        assert "<?xml" in resp.text

    def test_download_without_generate_fails(self, client, sample_invoice_data):
        create_resp = client.post("/api/invoices", json=sample_invoice_data)
        invoice_id = create_resp.json()["invoice_id"]

        resp = client.get(f"/api/invoices/{invoice_id}/download-xrechnung")
        assert resp.status_code == 404


class TestAnalytics:
    """GET /api/analytics/summary"""

    def test_analytics_empty(self, client):
        resp = client.get("/api/analytics/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_invoices"] == 0
        assert data["total_volume"] == 0
        assert len(data["monthly_volumes"]) == 6

    def test_analytics_with_data(self, client, sample_invoice_data):
        client.post("/api/invoices", json=sample_invoice_data)
        resp = client.get("/api/analytics/summary")
        data = resp.json()
        assert data["total_invoices"] == 1
        assert data["total_volume"] > 0


class TestExportDATEV:
    """GET /api/export/datev"""

    def test_export_empty_fails(self, client):
        resp = client.get("/api/export/datev")
        assert resp.status_code == 404

    def test_export_csv(self, client, sample_invoice_data):
        client.post("/api/invoices", json=sample_invoice_data)
        resp = client.get("/api/export/datev?format=csv")
        assert resp.status_code == 200
        assert "text/csv" in resp.headers["content-type"]

    def test_export_buchungsstapel(self, client, sample_invoice_data):
        client.post("/api/invoices", json=sample_invoice_data)
        resp = client.get("/api/export/datev?format=buchungsstapel")
        assert resp.status_code == 200
