"""
Tests for the enhanced analytics endpoints:
- GET /api/analytics/top-suppliers
- GET /api/analytics/category-breakdown
"""
import uuid
from datetime import date

import pytest

from app.models import Invoice


def _create_invoice(db_session, buyer_name: str, gross_amount: float, tax_rate: float = 19.0, invoice_date: date | None = None):
    """Helper to insert an invoice row directly."""
    inv = Invoice(
        invoice_id=f"INV-20260227-{uuid.uuid4().hex[:8]}",
        invoice_number=f"RE-{uuid.uuid4().hex[:6]}",
        invoice_date=invoice_date or date(2026, 2, 15),
        seller_name="Musterfirma GmbH",
        seller_vat_id="DE123456789",
        buyer_name=buyer_name,
        buyer_vat_id="DE987654321",
        net_amount=round(gross_amount / (1 + tax_rate / 100), 2),
        tax_amount=round(gross_amount - gross_amount / (1 + tax_rate / 100), 2),
        gross_amount=gross_amount,
        tax_rate=tax_rate,
        source_type="manual",
        validation_status="pending",
    )
    db_session.add(inv)
    db_session.commit()
    return inv


class TestTopSuppliers:
    """GET /api/analytics/top-suppliers"""

    def test_top_suppliers_returns_data(self, client, db_session):
        """Should return top suppliers grouped by buyer_name."""
        _create_invoice(db_session, "Firma Alpha", 1000.0)
        _create_invoice(db_session, "Firma Alpha", 2000.0)
        _create_invoice(db_session, "Firma Beta", 500.0)

        resp = client.get("/api/analytics/top-suppliers")
        assert resp.status_code == 200

        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 2

        # Alpha should be first (2 invoices)
        assert data[0]["name"] == "Firma Alpha"
        assert data[0]["invoice_count"] == 2
        assert data[0]["total_amount"] == pytest.approx(3000.0)

        assert data[1]["name"] == "Firma Beta"
        assert data[1]["invoice_count"] == 1
        assert data[1]["total_amount"] == pytest.approx(500.0)

    def test_top_suppliers_empty(self, client):
        """Should return empty list when no invoices exist."""
        resp = client.get("/api/analytics/top-suppliers")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_top_suppliers_with_date_filter(self, client, db_session):
        """Should filter by from/to date params."""
        _create_invoice(db_session, "Firma A", 1000.0, invoice_date=date(2026, 1, 10))
        _create_invoice(db_session, "Firma B", 2000.0, invoice_date=date(2026, 2, 15))
        _create_invoice(db_session, "Firma C", 3000.0, invoice_date=date(2026, 3, 20))

        # Filter only February
        resp = client.get("/api/analytics/top-suppliers?from=2026-02-01&to=2026-02-28")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["name"] == "Firma B"

    def test_top_suppliers_limits_to_five(self, client, db_session):
        """Should return at most 5 suppliers."""
        for i in range(7):
            _create_invoice(db_session, f"Firma {i}", 100.0 * (i + 1))

        resp = client.get("/api/analytics/top-suppliers")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 5

    def test_top_suppliers_invalid_date(self, client):
        """Should return 400 for invalid date format."""
        resp = client.get("/api/analytics/top-suppliers?from=not-a-date")
        assert resp.status_code == 400


class TestCategoryBreakdown:
    """GET /api/analytics/category-breakdown"""

    def test_category_breakdown_returns_data(self, client, db_session):
        """Should return revenue grouped by tax rate."""
        _create_invoice(db_session, "A", 1190.0, tax_rate=19.0)
        _create_invoice(db_session, "B", 1190.0, tax_rate=19.0)
        _create_invoice(db_session, "C", 535.0, tax_rate=7.0)
        _create_invoice(db_session, "D", 100.0, tax_rate=0.0)

        resp = client.get("/api/analytics/category-breakdown")
        assert resp.status_code == 200

        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 3

        # Results are ordered by total_amount descending
        rates = {item["tax_rate"]: item for item in data}
        assert 19.0 in rates
        assert 7.0 in rates
        assert 0.0 in rates

        assert rates[19.0]["invoice_count"] == 2
        assert rates[19.0]["total_amount"] == pytest.approx(2380.0)
        assert rates[19.0]["label"] == "19% (Regelsteuersatz)"

        assert rates[7.0]["label"] == "7% (ermäßigt)"
        assert rates[0.0]["label"] == "0% (steuerfrei)"

    def test_category_breakdown_empty(self, client):
        """Should return empty list when no invoices exist."""
        resp = client.get("/api/analytics/category-breakdown")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_category_breakdown_with_date_filter(self, client, db_session):
        """Should filter by date range."""
        _create_invoice(db_session, "A", 1190.0, tax_rate=19.0, invoice_date=date(2026, 1, 5))
        _create_invoice(db_session, "B", 535.0, tax_rate=7.0, invoice_date=date(2026, 2, 10))

        # Only February
        resp = client.get("/api/analytics/category-breakdown?from=2026-02-01&to=2026-02-28")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["tax_rate"] == pytest.approx(7.0)

    def test_category_breakdown_invalid_date(self, client):
        """Should return 400 for invalid date format."""
        resp = client.get("/api/analytics/category-breakdown?to=invalid")
        assert resp.status_code == 400
