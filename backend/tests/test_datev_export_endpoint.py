"""Tests for DATEV export endpoint (Phase 10)."""
import io
import uuid
import zipfile
import pytest
from datetime import date
from decimal import Decimal
from unittest.mock import patch
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.main import app
from app.models import Base, Invoice
from app.database import get_db
from app.config import settings


@pytest.fixture(scope="function")
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.rollback()
    session.close()
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture(scope="function")
def client(db_session):
    def _override():
        try:
            yield db_session
        finally:
            pass
    app.dependency_overrides[get_db] = _override
    with patch.object(settings, "require_api_key", True):
        with TestClient(app) as c:
            yield c
    app.dependency_overrides.clear()


def _register_and_get_token(client):
    email = f"datev-export-{uuid.uuid4().hex[:8]}@example.com"
    resp = client.post("/api/auth/register", json={
        "email": email,
        "password": "SecurePass123!",
        "full_name": "Export Test",
        "organization_name": f"ExportOrg {uuid.uuid4().hex[:6]}",
    })
    assert resp.status_code == 201, f"Registration failed: {resp.text}"
    data = resp.json()
    return {"token": data["access_token"], "org_id": data["organization"]["id"]}


def _make_invoice(db_session, org_id, skr03_account=None, invoice_date=None):
    """Insert a test invoice into the DB."""
    inv = Invoice(
        invoice_id=f"INV-{uuid.uuid4().hex[:12]}",
        invoice_number=f"RE-{uuid.uuid4().hex[:6]}",
        invoice_date=invoice_date or date(2024, 3, 15),
        due_date=date(2024, 4, 15),
        seller_name="Lieferant GmbH",
        seller_vat_id="DE100000001",
        seller_address="Lieferantenstr. 1, 60311 Frankfurt",
        buyer_name="Käufer AG",
        buyer_vat_id="DE200000002",
        buyer_address="Käuferstr. 2, 10115 Berlin",
        net_amount=Decimal("1000.00"),
        tax_amount=Decimal("190.00"),
        gross_amount=Decimal("1190.00"),
        tax_rate=Decimal("19.00"),
        currency="EUR",
        line_items=[{"description": "Büromaterial", "quantity": 1, "unit_price": 1190.0}],
        payment_status="unpaid",
        source_type="manual",
        validation_status="pending",
        organization_id=org_id,
        skr03_account=skr03_account,
    )
    db_session.add(inv)
    db_session.commit()
    return inv


class TestDATEVExportEndpoint:

    def test_export_returns_zip(self, client, db_session):
        """GET /api/datev/export should return application/zip."""
        user = _register_and_get_token(client)
        _make_invoice(db_session, user["org_id"], skr03_account="4930")

        resp = client.get(
            "/api/datev/export?from_month=2024-01&to_month=2024-12",
            headers={"Authorization": f"Bearer {user['token']}"},
        )
        assert resp.status_code == 200
        assert "zip" in resp.headers["content-type"]
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            assert len(zf.namelist()) == 2

    def test_export_excludes_uncategorized(self, client, db_session):
        """Invoices without skr03_account must not appear in the export."""
        user = _register_and_get_token(client)
        _make_invoice(db_session, user["org_id"], skr03_account="4930")   # included
        _make_invoice(db_session, user["org_id"], skr03_account=None)      # excluded

        resp = client.get(
            "/api/datev/export?from_month=2024-01&to_month=2024-12",
            headers={"Authorization": f"Bearer {user['token']}"},
        )
        assert resp.status_code == 200
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            buchungsstapel = zf.read([n for n in zf.namelist() if "Buchungsstapel" in n][0]).decode()
        # Only 1 booking line (besides 2 header rows)
        lines = [l for l in buchungsstapel.strip().split("\n") if l]
        assert len(lines) == 3  # EXTF header + column header + 1 booking

    def test_export_empty_period_returns_400(self, client, db_session):
        """If no categorized invoices in period, return 400."""
        user = _register_and_get_token(client)
        # No invoices at all
        resp = client.get(
            "/api/datev/export?from_month=2024-01&to_month=2024-12",
            headers={"Authorization": f"Bearer {user['token']}"},
        )
        assert resp.status_code == 400

    def test_export_uses_berater_nr_from_org(self, client, db_session):
        """EXTF header in ZIP should contain org's datev_berater_nr."""
        user = _register_and_get_token(client)
        # Set DATEV settings
        client.post(
            "/api/onboarding/datev-settings",
            json={"datev_berater_nr": "12345", "datev_mandant_nr": "00001"},
            headers={"Authorization": f"Bearer {user['token']}"},
        )
        _make_invoice(db_session, user["org_id"], skr03_account="4930")

        resp = client.get(
            "/api/datev/export?from_month=2024-01&to_month=2024-12",
            headers={"Authorization": f"Bearer {user['token']}"},
        )
        assert resp.status_code == 200
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            buchungsstapel = zf.read([n for n in zf.namelist() if "Buchungsstapel" in n][0]).decode()
        assert "12345" in buchungsstapel  # berater_nr in EXTF header
