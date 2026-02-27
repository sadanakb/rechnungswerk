"""
Tests for GET /api/invoices/stats
"""
import os
import pytest
from datetime import date

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("REQUIRE_API_KEY", "false")


class TestDashboardStats:
    """GET /api/invoices/stats"""

    def test_empty_org_returns_zeros(self, client):
        """Stats for an org with no invoices should return all-zero values."""
        resp = client.get("/api/invoices/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_invoices"] == 0
        assert data["invoices_this_month"] == 0
        assert data["revenue_this_month"] == 0.0
        assert data["revenue_last_month"] == 0.0
        assert data["overdue_count"] == 0
        assert data["overdue_amount"] == 0.0
        assert data["paid_count"] == 0
        assert data["unpaid_count"] == 0
        assert data["validation_rate"] == 0.0
        assert isinstance(data["monthly_revenue"], list)
        assert len(data["monthly_revenue"]) == 6

    def test_with_data_returns_correct_totals(self, client, sample_invoice_data):
        """Stats should reflect created invoices correctly."""
        # Create an invoice dated this month
        today = date.today()
        sample_invoice_data["invoice_date"] = today.strftime("%Y-%m-%d")
        client.post("/api/invoices", json=sample_invoice_data)

        resp = client.get("/api/invoices/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_invoices"] == 1
        assert data["invoices_this_month"] == 1
        assert data["revenue_this_month"] > 0
        assert isinstance(data["monthly_revenue"], list)
        assert len(data["monthly_revenue"]) == 6
