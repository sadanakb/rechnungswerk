"""
Tests for enhanced invoice filter params on GET /api/invoices.

Covers: status, date range, and search filters.
"""
import uuid
import pytest
from datetime import date


def _make_invoice(base: dict, **overrides) -> dict:
    """Return a copy of base invoice data with overrides applied."""
    return {**base, **overrides}


class TestFilterByStatus:
    """GET /api/invoices?status=<value>"""

    def test_filter_by_status_valid(self, client, sample_invoice_data):
        # Create 2 invoices: one "valid", one "invalid" (via direct DB manipulation is not
        # available from the client, so we create them and patch via the detail endpoint
        # which doesn't exist — instead we use validation endpoint pattern from test_invoices_api)
        # Simplest approach: create invoices, then directly verify filtering works
        # by inserting with known statuses through the DB session indirectly.
        #
        # Since POST /api/invoices always sets validation_status="pending", we create
        # 3 invoices and manipulate the DB session via the saved_invoice fixture pattern.
        pass

    def test_filter_by_status_returns_only_matching(self, client, db_session, sample_invoice_data):
        """Create invoices with different statuses; filter should return only matching ones."""
        import uuid as _uuid
        from app.models import Invoice

        def _create_inv(number, status):
            inv = Invoice(
                invoice_id=f"INV-TEST-{_uuid.uuid4().hex[:8]}",
                invoice_number=number,
                invoice_date=date(2026, 1, 15),
                seller_name="Seller GmbH",
                buyer_name="Buyer AG",
                net_amount=100.0,
                tax_amount=19.0,
                gross_amount=119.0,
                source_type="manual",
                validation_status=status,
            )
            db_session.add(inv)

        _create_inv("RE-VALID-001", "valid")
        _create_inv("RE-VALID-002", "valid")
        _create_inv("RE-INVALID-001", "invalid")
        db_session.commit()

        resp = client.get("/api/invoices?status=valid")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        for item in data["items"]:
            assert item["validation_status"] == "valid"

    def test_filter_by_status_invalid(self, client, db_session):
        """Filter status=invalid returns only invalid invoices."""
        import uuid as _uuid
        from app.models import Invoice

        for i in range(3):
            inv = Invoice(
                invoice_id=f"INV-TEST-{_uuid.uuid4().hex[:8]}",
                invoice_number=f"RE-STATUS-{i}",
                invoice_date=date(2026, 1, 10),
                seller_name="Seller GmbH",
                buyer_name="Buyer AG",
                net_amount=200.0,
                tax_amount=38.0,
                gross_amount=238.0,
                source_type="manual",
                validation_status="invalid" if i == 0 else "pending",
            )
            db_session.add(inv)
        db_session.commit()

        resp = client.get("/api/invoices?status=invalid")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["validation_status"] == "invalid"

    def test_filter_by_status_no_match(self, client, db_session):
        """Filter by a status that no invoice has returns empty list."""
        import uuid as _uuid
        from app.models import Invoice

        inv = Invoice(
            invoice_id=f"INV-TEST-{_uuid.uuid4().hex[:8]}",
            invoice_number="RE-PENDING-001",
            invoice_date=date(2026, 1, 5),
            seller_name="S GmbH",
            buyer_name="B AG",
            net_amount=50.0,
            tax_amount=9.5,
            gross_amount=59.5,
            source_type="manual",
            validation_status="pending",
        )
        db_session.add(inv)
        db_session.commit()

        resp = client.get("/api/invoices?status=xrechnung_generated")
        assert resp.status_code == 200
        assert resp.json()["total"] == 0
        assert resp.json()["items"] == []


class TestFilterByDateRange:
    """GET /api/invoices?date_from=...&date_to=..."""

    def test_filter_date_range_includes_matching(self, client, db_session):
        """Invoices within the date range are returned."""
        import uuid as _uuid
        from app.models import Invoice

        dates = [
            date(2026, 1, 10),
            date(2026, 4, 15),
            date(2026, 8, 20),
        ]
        for i, d in enumerate(dates):
            inv = Invoice(
                invoice_id=f"INV-DATE-{_uuid.uuid4().hex[:8]}",
                invoice_number=f"RE-DATE-{i}",
                invoice_date=d,
                seller_name="Seller GmbH",
                buyer_name="Buyer AG",
                net_amount=100.0,
                tax_amount=19.0,
                gross_amount=119.0,
                source_type="manual",
                validation_status="pending",
            )
            db_session.add(inv)
        db_session.commit()

        # Only January–June should match
        resp = client.get("/api/invoices?date_from=2026-01-01&date_to=2026-06-30")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        invoice_dates = {item["invoice_date"] for item in data["items"]}
        assert "2026-01-10" in invoice_dates
        assert "2026-04-15" in invoice_dates

    def test_filter_date_from_only(self, client, db_session):
        """date_from without date_to filters invoices on or after that date."""
        import uuid as _uuid
        from app.models import Invoice

        for d in [date(2025, 12, 31), date(2026, 6, 1)]:
            inv = Invoice(
                invoice_id=f"INV-DF-{_uuid.uuid4().hex[:8]}",
                invoice_number=f"RE-DF-{d.year}-{d.month}",
                invoice_date=d,
                seller_name="Seller GmbH",
                buyer_name="Buyer AG",
                net_amount=100.0,
                tax_amount=19.0,
                gross_amount=119.0,
                source_type="manual",
                validation_status="pending",
            )
            db_session.add(inv)
        db_session.commit()

        resp = client.get("/api/invoices?date_from=2026-01-01")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["invoice_date"] == "2026-06-01"

    def test_filter_date_to_only(self, client, db_session):
        """date_to without date_from filters invoices on or before that date."""
        import uuid as _uuid
        from app.models import Invoice

        for d in [date(2026, 3, 1), date(2026, 9, 1)]:
            inv = Invoice(
                invoice_id=f"INV-DT-{_uuid.uuid4().hex[:8]}",
                invoice_number=f"RE-DT-{d.month}",
                invoice_date=d,
                seller_name="Seller GmbH",
                buyer_name="Buyer AG",
                net_amount=100.0,
                tax_amount=19.0,
                gross_amount=119.0,
                source_type="manual",
                validation_status="pending",
            )
            db_session.add(inv)
        db_session.commit()

        resp = client.get("/api/invoices?date_to=2026-06-30")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["invoice_date"] == "2026-03-01"


class TestFilterBySearch:
    """GET /api/invoices?search=<term>"""

    def test_search_by_buyer_name(self, client, db_session):
        """Search term matches buyer_name (partial, case-insensitive)."""
        import uuid as _uuid
        from app.models import Invoice

        inv_acme = Invoice(
            invoice_id=f"INV-SRCH-{_uuid.uuid4().hex[:8]}",
            invoice_number="RE-ACME-001",
            invoice_date=date(2026, 2, 1),
            seller_name="Seller GmbH",
            buyer_name="ACME GmbH",
            net_amount=500.0,
            tax_amount=95.0,
            gross_amount=595.0,
            source_type="manual",
            validation_status="pending",
        )
        inv_other = Invoice(
            invoice_id=f"INV-SRCH-{_uuid.uuid4().hex[:8]}",
            invoice_number="RE-OTHER-001",
            invoice_date=date(2026, 2, 1),
            seller_name="Seller GmbH",
            buyer_name="Andere Firma AG",
            net_amount=200.0,
            tax_amount=38.0,
            gross_amount=238.0,
            source_type="manual",
            validation_status="pending",
        )
        db_session.add(inv_acme)
        db_session.add(inv_other)
        db_session.commit()

        resp = client.get("/api/invoices?search=ACME")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["buyer_name"] == "ACME GmbH"

    def test_search_by_invoice_number(self, client, db_session):
        """Search term matches invoice_number."""
        import uuid as _uuid
        from app.models import Invoice

        inv = Invoice(
            invoice_id=f"INV-SRCH-{_uuid.uuid4().hex[:8]}",
            invoice_number="RG-2026-9999",
            invoice_date=date(2026, 2, 15),
            seller_name="Seller GmbH",
            buyer_name="Käufer AG",
            net_amount=300.0,
            tax_amount=57.0,
            gross_amount=357.0,
            source_type="manual",
            validation_status="pending",
        )
        db_session.add(inv)
        db_session.commit()

        resp = client.get("/api/invoices?search=9999")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["invoice_number"] == "RG-2026-9999"

    def test_search_no_match_returns_empty(self, client, db_session):
        """Search term that matches nothing returns empty list."""
        import uuid as _uuid
        from app.models import Invoice

        inv = Invoice(
            invoice_id=f"INV-SRCH-{_uuid.uuid4().hex[:8]}",
            invoice_number="RE-FOUND-001",
            invoice_date=date(2026, 2, 15),
            seller_name="Seller GmbH",
            buyer_name="ACME GmbH",
            net_amount=100.0,
            tax_amount=19.0,
            gross_amount=119.0,
            source_type="manual",
            validation_status="pending",
        )
        db_session.add(inv)
        db_session.commit()

        resp = client.get("/api/invoices?search=XYZnonexistent")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

    def test_search_case_insensitive(self, client, db_session):
        """Search is case-insensitive."""
        import uuid as _uuid
        from app.models import Invoice

        inv = Invoice(
            invoice_id=f"INV-SRCH-{_uuid.uuid4().hex[:8]}",
            invoice_number="RE-CASE-001",
            invoice_date=date(2026, 2, 1),
            seller_name="Seller GmbH",
            buyer_name="MusterKunde GmbH",
            net_amount=100.0,
            tax_amount=19.0,
            gross_amount=119.0,
            source_type="manual",
            validation_status="pending",
        )
        db_session.add(inv)
        db_session.commit()

        # lowercase search should still find it
        resp = client.get("/api/invoices?search=musterkunde")
        assert resp.status_code == 200
        assert resp.json()["total"] == 1
