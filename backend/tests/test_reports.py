"""
Tests for the reports analytics endpoints:
- GET /api/analytics/tax-summary
- GET /api/analytics/cashflow
- GET /api/analytics/overdue-aging
"""
import uuid
from datetime import date, timedelta

import pytest

from app.models import Invoice


def _create_invoice(
    db_session,
    buyer_name: str,
    gross_amount: float,
    tax_rate: float = 19.0,
    invoice_date: date | None = None,
    due_date: date | None = None,
):
    """Helper to insert an invoice row directly."""
    net = round(gross_amount / (1 + tax_rate / 100), 2)
    vat = round(gross_amount - net, 2)
    inv = Invoice(
        invoice_id=f"INV-20260227-{uuid.uuid4().hex[:8]}",
        invoice_number=f"RE-{uuid.uuid4().hex[:6]}",
        invoice_date=invoice_date or date(2026, 2, 15),
        due_date=due_date,
        seller_name="Musterfirma GmbH",
        seller_vat_id="DE123456789",
        buyer_name=buyer_name,
        buyer_vat_id="DE987654321",
        net_amount=net,
        tax_amount=vat,
        gross_amount=gross_amount,
        tax_rate=tax_rate,
        source_type="manual",
        validation_status="pending",
    )
    db_session.add(inv)
    db_session.commit()
    return inv


class TestTaxSummary:
    """GET /api/analytics/tax-summary"""

    def test_tax_summary_by_rate(self, client, db_session):
        """Should group invoices by tax rate and return net/vat/gross sums."""
        _create_invoice(db_session, "Alfa GmbH", 1190.0, tax_rate=19.0)
        _create_invoice(db_session, "Beta AG", 1190.0, tax_rate=19.0)
        _create_invoice(db_session, "Gamma OHG", 535.0, tax_rate=7.0)
        _create_invoice(db_session, "Delta KG", 100.0, tax_rate=0.0)

        resp = client.get("/api/analytics/tax-summary")
        assert resp.status_code == 200

        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 3

        # Index by tax_rate string
        by_rate = {item["tax_rate"]: item for item in data}

        assert "19" in by_rate
        assert by_rate["19"]["count"] == 2
        assert by_rate["19"]["gross"] == pytest.approx(2380.0, abs=0.05)
        assert by_rate["19"]["label"] == "19% (Regelsteuersatz)"

        assert "7" in by_rate
        assert by_rate["7"]["count"] == 1
        assert by_rate["7"]["gross"] == pytest.approx(535.0, abs=0.05)
        assert by_rate["7"]["label"] == "7% (ermäßigter Steuersatz)"

        assert "0" in by_rate
        assert by_rate["0"]["count"] == 1
        assert by_rate["0"]["gross"] == pytest.approx(100.0, abs=0.05)
        assert by_rate["0"]["label"] == "0% (steuerfrei/reverse charge)"

    def test_tax_summary_net_vat_gross_structure(self, client, db_session):
        """Each row should have net, vat, gross fields."""
        _create_invoice(db_session, "Firma A", 1190.0, tax_rate=19.0)

        resp = client.get("/api/analytics/tax-summary")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        row = data[0]
        assert "net" in row
        assert "vat" in row
        assert "gross" in row
        assert "count" in row
        assert "label" in row
        assert "tax_rate" in row
        # For 19%: net = gross / 1.19
        assert row["net"] == pytest.approx(row["gross"] / 1.19, abs=0.02)
        assert row["vat"] == pytest.approx(row["gross"] - row["net"], abs=0.02)

    def test_tax_summary_year_filter(self, client, db_session):
        """Should filter by year parameter."""
        _create_invoice(db_session, "A", 1190.0, tax_rate=19.0, invoice_date=date(2025, 6, 15))
        _create_invoice(db_session, "B", 595.0, tax_rate=19.0, invoice_date=date(2026, 2, 15))

        resp = client.get("/api/analytics/tax-summary?year=2026")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["gross"] == pytest.approx(595.0, abs=0.05)

    def test_tax_summary_empty(self, client):
        """Should return empty list when no invoices exist."""
        resp = client.get("/api/analytics/tax-summary")
        assert resp.status_code == 200
        assert resp.json() == []


class TestCashflow:
    """GET /api/analytics/cashflow"""

    def test_cashflow_returns_months(self, client, db_session):
        """Should return the requested number of months."""
        resp = client.get("/api/analytics/cashflow?months=6")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 6

    def test_cashflow_default_six_months(self, client):
        """Default months=6 returns 6 entries."""
        resp = client.get("/api/analytics/cashflow")
        assert resp.status_code == 200
        assert len(resp.json()) == 6

    def test_cashflow_custom_months(self, client):
        """Custom months param is respected."""
        resp = client.get("/api/analytics/cashflow?months=3")
        assert resp.status_code == 200
        assert len(resp.json()) == 3

    def test_cashflow_structure(self, client):
        """Each entry has month, label, total_amount, invoice_count."""
        resp = client.get("/api/analytics/cashflow?months=1")
        assert resp.status_code == 200
        entry = resp.json()[0]
        assert "month" in entry
        assert "label" in entry
        assert "total_amount" in entry
        assert "invoice_count" in entry

    def test_cashflow_with_data(self, client, db_session):
        """Invoice in current month is reflected in cashflow data."""
        today = date.today()
        _create_invoice(db_session, "Cashflow Test GmbH", 1000.0, invoice_date=today)

        resp = client.get("/api/analytics/cashflow?months=1")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["invoice_count"] == 1
        assert data[0]["total_amount"] == pytest.approx(1000.0)

    def test_cashflow_month_format(self, client):
        """Month field should be in YYYY-MM format."""
        resp = client.get("/api/analytics/cashflow?months=1")
        assert resp.status_code == 200
        month_str = resp.json()[0]["month"]
        # Validate YYYY-MM format
        parts = month_str.split("-")
        assert len(parts) == 2
        assert len(parts[0]) == 4
        assert len(parts[1]) == 2


class TestOverdueAging:
    """GET /api/analytics/overdue-aging"""

    def test_overdue_aging_buckets(self, client, db_session):
        """Should return 4 aging buckets even when some are empty."""
        resp = client.get("/api/analytics/overdue-aging")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 4

        buckets = {item["bucket"] for item in data}
        assert "0-30" in buckets
        assert "31-60" in buckets
        assert "61-90" in buckets
        assert "90+" in buckets

    def test_overdue_aging_structure(self, client):
        """Each bucket has required fields."""
        resp = client.get("/api/analytics/overdue-aging")
        assert resp.status_code == 200
        for item in resp.json():
            assert "bucket" in item
            assert "label" in item
            assert "count" in item
            assert "total_amount" in item
            assert "invoices" in item

    def test_overdue_aging_correct_bucket_assignment(self, client, db_session):
        """Invoices are assigned to the correct aging bucket."""
        today = date.today()

        # 15 days overdue -> 0-30 bucket
        _create_invoice(
            db_session, "Alpha GmbH", 500.0,
            due_date=today - timedelta(days=15),
        )
        # 45 days overdue -> 31-60 bucket
        _create_invoice(
            db_session, "Beta GmbH", 1000.0,
            due_date=today - timedelta(days=45),
        )
        # 75 days overdue -> 61-90 bucket
        _create_invoice(
            db_session, "Gamma GmbH", 1500.0,
            due_date=today - timedelta(days=75),
        )
        # 120 days overdue -> 90+ bucket
        _create_invoice(
            db_session, "Delta GmbH", 2000.0,
            due_date=today - timedelta(days=120),
        )

        resp = client.get("/api/analytics/overdue-aging")
        assert resp.status_code == 200
        data = resp.json()

        by_bucket = {item["bucket"]: item for item in data}

        assert by_bucket["0-30"]["count"] == 1
        assert by_bucket["0-30"]["total_amount"] == pytest.approx(500.0)

        assert by_bucket["31-60"]["count"] == 1
        assert by_bucket["31-60"]["total_amount"] == pytest.approx(1000.0)

        assert by_bucket["61-90"]["count"] == 1
        assert by_bucket["61-90"]["total_amount"] == pytest.approx(1500.0)

        assert by_bucket["90+"]["count"] == 1
        assert by_bucket["90+"]["total_amount"] == pytest.approx(2000.0)

    def test_overdue_aging_invoices_list(self, client, db_session):
        """Each bucket's invoices list has id, number, amount, days_overdue."""
        today = date.today()
        inv = _create_invoice(
            db_session, "Test GmbH", 800.0,
            due_date=today - timedelta(days=10),
        )

        resp = client.get("/api/analytics/overdue-aging")
        assert resp.status_code == 200
        data = resp.json()

        by_bucket = {item["bucket"]: item for item in data}
        invoices = by_bucket["0-30"]["invoices"]
        assert len(invoices) == 1
        assert invoices[0]["id"] == inv.invoice_id
        assert invoices[0]["amount"] == pytest.approx(800.0)
        assert invoices[0]["days_overdue"] == 10

    def test_future_due_date_not_overdue(self, client, db_session):
        """Invoices with future due dates should not appear in overdue aging."""
        today = date.today()
        _create_invoice(
            db_session, "Futurist GmbH", 999.0,
            due_date=today + timedelta(days=30),
        )

        resp = client.get("/api/analytics/overdue-aging")
        assert resp.status_code == 200
        data = resp.json()
        total_count = sum(item["count"] for item in data)
        assert total_count == 0
