"""
Tests for the ZUGFeRD PDF download endpoint.

GET /api/invoices/{invoice_id}/download-zugferd

Tests cover:
1. Successful PDF download (on-the-fly generation)
2. Cross-org access rejection (404)
"""
import os
import uuid
import pytest
from datetime import date
from unittest.mock import patch, MagicMock

# Override env BEFORE importing any app modules
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["REQUIRE_API_KEY"] = "false"

from app.models import Base, Invoice, Organization, User, OrganizationMember
from app.database import get_db
from app.main import app

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Minimal fake PDF bytes — avoids requiring weasyprint / factur-x at test time
# ---------------------------------------------------------------------------
_FAKE_PDF = b"%PDF-1.4 fake-zugferd-content"


def _make_invoice_id() -> str:
    return f"INV-20260227-{uuid.uuid4().hex[:8]}"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="function")
def db_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture(scope="function")
def db_session(db_engine):
    Session = sessionmaker(bind=db_engine)
    session = Session()
    yield session
    session.rollback()
    session.close()


@pytest.fixture(scope="function")
def client(db_session):
    def _override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def invoice(db_session) -> Invoice:
    """An Invoice row already persisted in the test DB (no org)."""
    inv = Invoice(
        invoice_id=_make_invoice_id(),
        invoice_number="RE-TEST-001",
        invoice_date=date(2026, 2, 27),
        due_date=date(2026, 3, 27),
        seller_name="Test GmbH",
        seller_vat_id="DE123456789",
        seller_address="Musterstr. 1, 60311 Frankfurt",
        buyer_name="Kaeufer AG",
        buyer_vat_id="DE987654321",
        buyer_address="Hauptstr. 5, 10115 Berlin",
        net_amount=1000.0,
        tax_amount=190.0,
        gross_amount=1190.0,
        tax_rate=19.0,
        currency="EUR",
        line_items=[
            {
                "description": "Beratung",
                "quantity": 10,
                "unit_price": 100.0,
                "net_amount": 1000.0,
                "tax_rate": 19.0,
            }
        ],
        source_type="manual",
        validation_status="pending",
    )
    db_session.add(inv)
    db_session.commit()
    db_session.refresh(inv)
    return inv


# ---------------------------------------------------------------------------
# Test 1: GET /api/invoices/{invoice_id}/download-zugferd returns PDF
# ---------------------------------------------------------------------------

class TestDownloadZugferdReturnsPdf:
    """On-the-fly ZUGFeRD generation and download."""

    def test_download_zugferd_returns_pdf(self, client, invoice):
        """
        Calling the download endpoint without a pre-generated PDF should
        trigger on-the-fly generation and return application/pdf content.
        """
        # Mock ZUGFeRDGenerator.generate to write fake PDF bytes to the temp path
        def _fake_generate(invoice_data, xml_content, output_path):
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            with open(output_path, "wb") as f:
                f.write(_FAKE_PDF)
            return output_path

        # Mock XRechnungGenerator.generate_xml to return minimal XML
        _fake_xml = '<?xml version="1.0"?><Invoice>test</Invoice>'

        with patch(
            "app.routers.invoices.zugferd_gen.generate",
            side_effect=_fake_generate,
        ), patch(
            "app.routers.invoices.xrechnung_gen.generate_xml",
            return_value=_fake_xml,
        ):
            resp = client.get(
                f"/api/invoices/{invoice.invoice_id}/download-zugferd"
            )

        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        assert resp.headers["content-type"] == "application/pdf"
        assert resp.content == _FAKE_PDF

    def test_download_zugferd_content_disposition_filename(self, client, invoice):
        """Content-Disposition header must reference the invoice number."""
        _fake_xml = '<?xml version="1.0"?><Invoice>test</Invoice>'

        def _fake_generate(invoice_data, xml_content, output_path):
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            with open(output_path, "wb") as f:
                f.write(_FAKE_PDF)
            return output_path

        with patch(
            "app.routers.invoices.zugferd_gen.generate",
            side_effect=_fake_generate,
        ), patch(
            "app.routers.invoices.xrechnung_gen.generate_xml",
            return_value=_fake_xml,
        ):
            resp = client.get(
                f"/api/invoices/{invoice.invoice_id}/download-zugferd"
            )

        assert resp.status_code == 200
        cd = resp.headers.get("content-disposition", "")
        assert "ZUGFeRD.pdf" in cd, f"Expected ZUGFeRD.pdf in Content-Disposition, got: {cd}"


# ---------------------------------------------------------------------------
# Test 2: Cross-org access rejected
# ---------------------------------------------------------------------------

class TestDownloadZugferdCrossOrgRejected:
    """Org-isolated access: users may not download invoices from other orgs."""

    @pytest.fixture()
    def two_org_setup(self, db_session):
        """Create two organizations, one invoice belonging to org_a."""
        org_a = Organization(name="Org A", slug="org-a-zugferd")
        org_b = Organization(name="Org B", slug="org-b-zugferd")
        db_session.add_all([org_a, org_b])
        db_session.flush()

        inv = Invoice(
            invoice_id=_make_invoice_id(),
            invoice_number="RE-ORGA-001",
            invoice_date=date(2026, 2, 27),
            seller_name="Org A GmbH",
            seller_vat_id="DE111111111",
            buyer_name="Buyer GmbH",
            buyer_vat_id="DE222222222",
            net_amount=500.0,
            tax_amount=95.0,
            gross_amount=595.0,
            tax_rate=19.0,
            currency="EUR",
            line_items=[],
            source_type="manual",
            validation_status="pending",
            organization_id=org_a.id,
        )
        db_session.add(inv)
        db_session.commit()
        db_session.refresh(inv)

        return {"invoice": inv, "org_a_id": org_a.id, "org_b_id": org_b.id}

    def test_download_zugferd_cross_org_rejected(self, client, db_session, two_org_setup):
        """
        A user authenticated as org_b must receive 404 when accessing
        an invoice that belongs to org_a.
        """
        invoice = two_org_setup["invoice"]
        org_b_id = two_org_setup["org_b_id"]

        # Simulate org_b being the authenticated user by overriding get_current_user_optional
        from app.routers.invoices import get_current_user_optional

        async def _org_b_user():
            return {"user_id": "999", "org_id": org_b_id, "role": "member"}

        app.dependency_overrides[get_current_user_optional] = _org_b_user
        try:
            resp = client.get(
                f"/api/invoices/{invoice.invoice_id}/download-zugferd"
            )
        finally:
            # Remove only the specific override we added; preserve the DB override
            app.dependency_overrides.pop(get_current_user_optional, None)

        assert resp.status_code == 404, (
            f"Cross-org access should return 404, got {resp.status_code}"
        )
