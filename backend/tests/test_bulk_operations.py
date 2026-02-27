"""
Tests for bulk invoice operations.

POST /api/invoices/bulk-delete
POST /api/invoices/bulk-validate

Patterns follow test_invoices_api.py and test_tenant_isolation.py:
- Uses the shared conftest.py fixtures (client, sample_invoice_data, db_session)
- For cross-org isolation tests: registers two orgs and mocks JWT auth
"""
import os
import pytest
from unittest.mock import patch

# Override settings BEFORE importing app modules (same as other test files)
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["REQUIRE_API_KEY"] = "false"

from app.auth import verify_api_key


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _create_invoice(client, sample_invoice_data, number_suffix="001", token=None):
    """Create one invoice via the API and return the response JSON."""
    data = {**sample_invoice_data, "invoice_number": f"RE-BULK-{number_suffix}"}
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    resp = client.post("/api/invoices", json=data, headers=headers)
    assert resp.status_code == 200, f"Invoice creation failed: {resp.text}"
    return resp.json()


def _register_and_get_token(client, email, org_name):
    resp = client.post("/api/auth/register", json={
        "email": email,
        "password": "SecurePass123!",
        "full_name": "Test User",
        "organization_name": org_name,
    })
    assert resp.status_code == 201, f"Registration failed: {resp.text}"
    return resp.json()["access_token"]


# ---------------------------------------------------------------------------
# bulk-delete tests
# ---------------------------------------------------------------------------

class TestBulkDelete:
    """POST /api/invoices/bulk-delete"""

    def test_bulk_delete_own_invoices(self, client, sample_invoice_data):
        """Deleting own invoices returns correct deleted count and removes them."""
        inv1 = _create_invoice(client, sample_invoice_data, "D01")
        inv2 = _create_invoice(client, sample_invoice_data, "D02")
        inv3 = _create_invoice(client, sample_invoice_data, "D03")

        ids = [inv1["id"], inv2["id"], inv3["id"]]
        resp = client.post("/api/invoices/bulk-delete", json={"ids": ids})
        assert resp.status_code == 200

        data = resp.json()
        assert data["deleted"] == 3
        assert data["skipped"] == 0

        # Confirm they are gone
        for inv in [inv1, inv2, inv3]:
            r = client.get(f"/api/invoices/{inv['invoice_id']}")
            assert r.status_code == 404

    def test_bulk_delete_nonexistent_ids_skipped(self, client):
        """IDs that do not exist in the DB count as skipped."""
        resp = client.post("/api/invoices/bulk-delete", json={"ids": [999999, 888888]})
        assert resp.status_code == 200

        data = resp.json()
        assert data["deleted"] == 0
        assert data["skipped"] == 2

    def test_bulk_delete_mixed_existing_and_missing(self, client, sample_invoice_data):
        """Existing invoices are deleted; missing IDs are skipped."""
        inv = _create_invoice(client, sample_invoice_data, "MIX01")

        resp = client.post(
            "/api/invoices/bulk-delete",
            json={"ids": [inv["id"], 999999]},
        )
        assert resp.status_code == 200

        data = resp.json()
        assert data["deleted"] == 1
        assert data["skipped"] == 1

    def test_bulk_delete_empty_ids_returns_422(self, client):
        """Sending an empty ids list should be rejected."""
        resp = client.post("/api/invoices/bulk-delete", json={"ids": []})
        assert resp.status_code == 422

    def test_bulk_delete_cross_org_skipped(self, db_session, sample_invoice_data):
        """Invoices from a different organisation must NOT be deleted."""
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from sqlalchemy.pool import StaticPool
        from app.models import Base
        from app.database import get_db
        from app.main import app
        from fastapi.testclient import TestClient

        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=engine)
        Session = sessionmaker(bind=engine)
        session = Session()

        async def _bypass_api_key():
            return "test-bypass"

        def _override_get_db():
            try:
                yield session
            finally:
                pass

        app.dependency_overrides[get_db] = _override_get_db
        app.dependency_overrides[verify_api_key] = _bypass_api_key

        with patch("app.routers.invoices.settings") as mock_settings:
            mock_settings.require_api_key = True
            mock_settings.max_upload_size_mb = 10

            with TestClient(app) as c:
                token_a = _register_and_get_token(c, "orgA_del@test.de", "Org-A-Delete")
                token_b = _register_and_get_token(c, "orgB_del@test.de", "Org-B-Delete")

                # Org A creates an invoice
                inv_a = _create_invoice(
                    c, sample_invoice_data, "CROSS01",
                    token=token_a,
                )

                # Org B tries to bulk-delete Org A's invoice
                resp = c.post(
                    "/api/invoices/bulk-delete",
                    json={"ids": [inv_a["id"]]},
                    headers={"Authorization": f"Bearer {token_b}"},
                )
                assert resp.status_code == 200

                result = resp.json()
                # Must be skipped, not deleted
                assert result["deleted"] == 0
                assert result["skipped"] == 1

                # Invoice must still exist
                r = c.get(
                    f"/api/invoices/{inv_a['invoice_id']}",
                    headers={"Authorization": f"Bearer {token_a}"},
                )
                assert r.status_code == 200

        app.dependency_overrides.clear()
        session.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


# ---------------------------------------------------------------------------
# bulk-validate tests
# ---------------------------------------------------------------------------

class TestBulkValidate:
    """POST /api/invoices/bulk-validate"""

    def test_bulk_validate_returns_results(self, client, sample_invoice_data):
        """Every requested ID appears in the results list."""
        inv1 = _create_invoice(client, sample_invoice_data, "V01")
        inv2 = _create_invoice(client, sample_invoice_data, "V02")

        resp = client.post(
            "/api/invoices/bulk-validate",
            json={"ids": [inv1["id"], inv2["id"]]},
        )
        assert resp.status_code == 200

        data = resp.json()
        assert "results" in data
        assert len(data["results"]) == 2

        result_ids = {r["id"] for r in data["results"]}
        assert inv1["id"] in result_ids
        assert inv2["id"] in result_ids

    def test_bulk_validate_no_xml_is_invalid(self, client, sample_invoice_data):
        """A freshly created invoice without XRechnung XML is not valid."""
        inv = _create_invoice(client, sample_invoice_data, "NOXML01")

        resp = client.post(
            "/api/invoices/bulk-validate",
            json={"ids": [inv["id"]]},
        )
        assert resp.status_code == 200

        result = resp.json()["results"][0]
        assert result["id"] == inv["id"]
        assert result["valid"] is False
        # Must contain an error about missing XML
        assert any("XML" in e for e in result["errors"])

    def test_bulk_validate_nonexistent_id_returns_error(self, client):
        """Non-existent IDs appear in results with valid=False."""
        resp = client.post(
            "/api/invoices/bulk-validate",
            json={"ids": [999999]},
        )
        assert resp.status_code == 200

        data = resp.json()
        assert len(data["results"]) == 1
        result = data["results"][0]
        assert result["id"] == 999999
        assert result["valid"] is False
        assert len(result["errors"]) > 0

    def test_bulk_validate_empty_ids_returns_422(self, client):
        """Sending an empty ids list should be rejected."""
        resp = client.post("/api/invoices/bulk-validate", json={"ids": []})
        assert resp.status_code == 422

    def test_bulk_validate_with_xml_is_valid(self, client, sample_invoice_data):
        """After generating XRechnung XML the invoice passes basic validation."""
        inv = _create_invoice(client, sample_invoice_data, "WITHXML01")
        invoice_id = inv["invoice_id"]

        # Generate the XML
        gen_resp = client.post(f"/api/invoices/{invoice_id}/generate-xrechnung")
        assert gen_resp.status_code == 200

        resp = client.post(
            "/api/invoices/bulk-validate",
            json={"ids": [inv["id"]]},
        )
        assert resp.status_code == 200

        result = resp.json()["results"][0]
        assert result["id"] == inv["id"]
        assert result["valid"] is True
        assert result["errors"] == []
