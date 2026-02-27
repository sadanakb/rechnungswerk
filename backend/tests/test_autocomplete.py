"""
Tests for GET /api/invoices/autocomplete
"""
import os
import pytest

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("REQUIRE_API_KEY", "false")


class TestAutocomplete:
    """GET /api/invoices/autocomplete"""

    def test_autocomplete_returns_matches(self, client, sample_invoice_data):
        """Autocomplete returns matching buyer names when query matches."""
        client.post("/api/invoices", json=sample_invoice_data)
        resp = client.get("/api/invoices/autocomplete?q=Käufer&field=buyer_name")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert any("Käufer" in entry for entry in data)

    def test_autocomplete_empty_for_no_match(self, client, sample_invoice_data):
        """Autocomplete returns empty list when nothing matches."""
        client.post("/api/invoices", json=sample_invoice_data)
        resp = client.get("/api/invoices/autocomplete?q=XYZNONEXISTENT&field=buyer_name")
        assert resp.status_code == 200
        assert resp.json() == []
