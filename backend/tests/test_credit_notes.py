"""
Tests for Credit Notes (Gutschriften) — XRechnung XML, API endpoints, DATEV.
"""
import re
import uuid
from datetime import date
from unittest.mock import patch, MagicMock

import pytest
from lxml import etree

from app.xrechnung_generator import XRechnungGenerator
from app.models import Invoice, CreditNote, Organization, OrganizationMember, User


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def sample_credit_note_data(sample_invoice_dict) -> dict:
    """Credit note data dict for XRechnung generator."""
    return {
        "credit_note_number": "GS-2026-0001",
        "credit_note_date": "2026-03-08",
        "original_invoice_number": sample_invoice_dict["invoice_number"],
        "seller_name": sample_invoice_dict["seller_name"],
        "seller_vat_id": sample_invoice_dict["seller_vat_id"],
        "seller_address": sample_invoice_dict["seller_address"],
        "buyer_name": sample_invoice_dict["buyer_name"],
        "buyer_vat_id": sample_invoice_dict["buyer_vat_id"],
        "buyer_address": sample_invoice_dict["buyer_address"],
        "net_amount": sample_invoice_dict["net_amount"],
        "tax_amount": sample_invoice_dict["tax_amount"],
        "gross_amount": sample_invoice_dict["gross_amount"],
        "tax_rate": sample_invoice_dict["tax_rate"],
        "line_items": sample_invoice_dict["line_items"],
        "iban": sample_invoice_dict["iban"],
        "bic": sample_invoice_dict["bic"],
        "payment_account_name": sample_invoice_dict["payment_account_name"],
        "currency": "EUR",
        "reason": "Fehllieferung",
    }


@pytest.fixture()
def auth_headers(db_session) -> dict:
    """Create org + user + member, return JWT auth headers."""
    org = Organization(name="Test GmbH", slug="test-gmbh", plan="professional")
    db_session.add(org)
    db_session.flush()

    from app.auth_jwt import create_access_token
    user = User(
        email="test@example.com",
        hashed_password="$2b$12$dummy",
        full_name="Test User",
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    db_session.flush()

    member = OrganizationMember(
        user_id=user.id,
        organization_id=org.id,
        role="owner",
    )
    db_session.add(member)
    db_session.commit()

    token = create_access_token({"sub": str(user.id), "org_id": org.id})
    return {"Authorization": f"Bearer {token}", "_org_id": org.id, "_user_id": user.id}


@pytest.fixture()
def test_invoice_for_cn(db_session, auth_headers) -> Invoice:
    """Create an invoice in the test org for credit note creation."""
    inv = Invoice(
        invoice_id=f"INV-20260308-{uuid.uuid4().hex[:8]}",
        invoice_number="RE-2026-001",
        invoice_date=date(2026, 3, 1),
        due_date=date(2026, 3, 31),
        seller_name="Musterfirma GmbH",
        seller_vat_id="DE123456789",
        seller_address="Musterstra\u00dfe 1, 60311 Frankfurt am Main",
        buyer_name="K\u00e4ufer AG",
        buyer_vat_id="DE987654321",
        buyer_address="Hauptstra\u00dfe 5, 10115 Berlin",
        net_amount=1500.0,
        tax_amount=285.0,
        gross_amount=1785.0,
        tax_rate=19.0,
        currency="EUR",
        line_items=[
            {"description": "Beratungsleistung", "quantity": 10.0, "unit_price": 150.0, "net_amount": 1500.0, "tax_rate": 19.0}
        ],
        iban="DE89370400440532013000",
        bic="COBADEFFXXX",
        payment_account_name="Musterfirma GmbH",
        buyer_reference="04011000-12345-67",
        source_type="manual",
        validation_status="pending",
        organization_id=auth_headers["_org_id"],
    )
    db_session.add(inv)
    db_session.commit()
    db_session.refresh(inv)
    return inv


# ---------------------------------------------------------------------------
# Step 3: XRechnung CreditNote XML Tests (TEST-FIRST)
# ---------------------------------------------------------------------------

class TestCreditNoteXML:
    """XRechnung CreditNote XML generation tests."""

    def test_root_element_is_credit_note(self, sample_credit_note_data):
        """Root element must be CreditNote with correct namespace."""
        gen = XRechnungGenerator()
        xml = gen.generate_credit_note_xml(sample_credit_note_data)
        root = etree.fromstring(xml.encode("utf-8"))
        assert root.tag == "{urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2}CreditNote"

    def test_root_namespace(self, sample_credit_note_data):
        """Default namespace must be CreditNote-2."""
        gen = XRechnungGenerator()
        xml = gen.generate_credit_note_xml(sample_credit_note_data)
        root = etree.fromstring(xml.encode("utf-8"))
        assert root.nsmap[None] == "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"

    def test_credit_note_type_code_381(self, sample_credit_note_data):
        """CreditNoteTypeCode must be 381."""
        gen = XRechnungGenerator()
        xml = gen.generate_credit_note_xml(sample_credit_note_data)
        root = etree.fromstring(xml.encode("utf-8"))
        ns = {"cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"}
        type_code = root.find(".//cbc:CreditNoteTypeCode", ns)
        assert type_code is not None
        assert type_code.text == "381"

    def test_billing_reference_contains_original_invoice(self, sample_credit_note_data):
        """BillingReference must contain the original invoice number."""
        gen = XRechnungGenerator()
        xml = gen.generate_credit_note_xml(sample_credit_note_data)
        root = etree.fromstring(xml.encode("utf-8"))
        ns = {
            "cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
            "cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
        }
        ref_id = root.find(".//cac:BillingReference/cac:InvoiceDocumentReference/cbc:ID", ns)
        assert ref_id is not None
        assert ref_id.text == sample_credit_note_data["original_invoice_number"]

    def test_no_due_date_element(self, sample_credit_note_data):
        """CreditNote XML must NOT contain a DueDate element."""
        gen = XRechnungGenerator()
        xml = gen.generate_credit_note_xml(sample_credit_note_data)
        root = etree.fromstring(xml.encode("utf-8"))
        ns = {"cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"}
        due_date = root.find(".//cbc:DueDate", ns)
        assert due_date is None

    def test_credit_note_line_with_credited_quantity(self, sample_credit_note_data):
        """Lines must be CreditNoteLine with CreditedQuantity (unitCode=C62)."""
        gen = XRechnungGenerator()
        xml = gen.generate_credit_note_xml(sample_credit_note_data)
        root = etree.fromstring(xml.encode("utf-8"))
        ns = {
            "cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
            "cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
        }
        lines = root.findall(".//cac:CreditNoteLine", ns)
        assert len(lines) > 0

        qty = lines[0].find("cbc:CreditedQuantity", ns)
        assert qty is not None
        assert qty.get("unitCode") == "C62"

    def test_header_element_order(self, sample_credit_note_data):
        """Header elements must be in exact UBL schema order."""
        gen = XRechnungGenerator()
        xml = gen.generate_credit_note_xml(sample_credit_note_data)
        root = etree.fromstring(xml.encode("utf-8"))

        cbc = "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
        expected_order = [
            f"{{{cbc}}}UBLVersionID",
            f"{{{cbc}}}CustomizationID",
            f"{{{cbc}}}ProfileID",
            f"{{{cbc}}}ID",
            f"{{{cbc}}}IssueDate",
            f"{{{cbc}}}CreditNoteTypeCode",
            f"{{{cbc}}}DocumentCurrencyCode",
            f"{{{cbc}}}BuyerReference",
        ]

        # Get actual cbc children in order
        actual_cbc = [child.tag for child in root if child.tag.startswith(f"{{{cbc}}}")]

        # Verify order matches (first N elements should match expected_order)
        for i, expected_tag in enumerate(expected_order):
            assert actual_cbc[i] == expected_tag, (
                f"Position {i}: expected {expected_tag}, got {actual_cbc[i]}"
            )

        # Verify NO DueDate between IssueDate and CreditNoteTypeCode
        assert f"{{{cbc}}}DueDate" not in actual_cbc

    def test_no_invoice_type_code(self, sample_credit_note_data):
        """CreditNote must NOT have InvoiceTypeCode (only CreditNoteTypeCode)."""
        gen = XRechnungGenerator()
        xml = gen.generate_credit_note_xml(sample_credit_note_data)
        root = etree.fromstring(xml.encode("utf-8"))
        ns = {"cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"}
        invoice_type = root.find(".//cbc:InvoiceTypeCode", ns)
        assert invoice_type is None

    def test_validation_rejects_missing_fields(self):
        """Generator must reject data with missing mandatory fields."""
        gen = XRechnungGenerator()
        with pytest.raises(ValueError, match="Validierungsfehler"):
            gen.generate_credit_note_xml({})


# ---------------------------------------------------------------------------
# Step 8: API + DATEV Tests
# ---------------------------------------------------------------------------

class TestCreditNoteAPI:
    """Credit Note API endpoint tests."""

    @patch("app.routers.credit_notes.zugferd_gen")
    @patch("app.routers.credit_notes.xrechnung_gen")
    def test_create_credit_note(self, mock_xr, mock_zf, client, db_session, auth_headers, test_invoice_for_cn):
        """POST /api/credit-notes creates a Vollgutschrift."""
        mock_xr.generate_credit_note_xml.return_value = "<xml>test</xml>"
        mock_zf.generate_credit_note.return_value = "/tmp/test.pdf"

        resp = client.post(
            "/api/credit-notes/",
            json={"original_invoice_id": test_invoice_for_cn.id, "reason": "Fehllieferung"},
            headers={"Authorization": auth_headers["Authorization"]},
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["credit_note_id"].startswith("GS-")
        assert data["buyer_name"] == "K\u00e4ufer AG"
        assert float(data["gross_amount"]) == 1785.0
        assert data["reason"] == "Fehllieferung"

    @patch("app.routers.credit_notes.zugferd_gen")
    @patch("app.routers.credit_notes.xrechnung_gen")
    def test_list_credit_notes(self, mock_xr, mock_zf, client, db_session, auth_headers, test_invoice_for_cn):
        """GET /api/credit-notes lists credit notes with org scoping."""
        mock_xr.generate_credit_note_xml.return_value = "<xml>test</xml>"
        mock_zf.generate_credit_note.return_value = "/tmp/test.pdf"

        # Create a credit note first
        client.post(
            "/api/credit-notes/",
            json={"original_invoice_id": test_invoice_for_cn.id, "reason": "Test"},
            headers={"Authorization": auth_headers["Authorization"]},
        )

        resp = client.get(
            "/api/credit-notes/",
            headers={"Authorization": auth_headers["Authorization"]},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert len(data["items"]) >= 1

    def test_tenant_isolation(self, client, db_session, auth_headers, test_invoice_for_cn):
        """Cannot access credit notes from a different organization."""
        # Create a credit note in org 2
        cn = CreditNote(
            credit_note_id=f"GS-20260308-{uuid.uuid4().hex[:8]}",
            credit_note_number="GS-2026-9999",
            original_invoice_id=test_invoice_for_cn.id,
            credit_note_date=date(2026, 3, 8),
            seller_name="Other GmbH",
            buyer_name="Other AG",
            net_amount=100, tax_amount=19, gross_amount=119, tax_rate=19,
            reason="Test",
            organization_id=99999,  # different org
        )
        db_session.add(cn)
        db_session.commit()

        resp = client.get(
            f"/api/credit-notes/{cn.credit_note_id}",
            headers={"Authorization": auth_headers["Authorization"]},
        )
        assert resp.status_code == 404

    def test_cannot_create_for_other_org_invoice(self, client, db_session, auth_headers):
        """Cannot create credit note for an invoice from a different org."""
        # Create invoice in different org
        inv = Invoice(
            invoice_id=f"INV-20260308-{uuid.uuid4().hex[:8]}",
            invoice_number="RE-OTHER-001",
            invoice_date=date(2026, 3, 1),
            seller_name="Other",
            buyer_name="Other",
            net_amount=100, tax_amount=19, gross_amount=119, tax_rate=19,
            source_type="manual", validation_status="pending",
            organization_id=99999,
        )
        db_session.add(inv)
        db_session.commit()

        resp = client.post(
            "/api/credit-notes/",
            json={"original_invoice_id": inv.id, "reason": "Test"},
            headers={"Authorization": auth_headers["Authorization"]},
        )
        assert resp.status_code in (403, 404)


class TestCreditNoteDATEV:
    """DATEV export with credit notes."""

    def test_credit_note_haben_kennzeichen(self):
        """Credit notes must use 'H' (Haben) instead of 'S' (Soll)."""
        from app.export.datev_export import DATEVExporter

        exporter = DATEVExporter(kontenrahmen="SKR03")
        invoice_dict = {
            "invoice_number": "GS-2026-0001",
            "invoice_date": "2026-03-08",
            "seller_name": "Test GmbH",
            "buyer_name": "K\u00e4ufer AG",
            "net_amount": 1500.0,
            "tax_rate": 19.0,
            "tax_amount": 285.0,
            "gross_amount": 1785.0,
            "currency": "EUR",
            "is_credit_note": True,
            "original_invoice_number": "RE-2026-001",
        }
        rows = exporter._invoice_to_rows(invoice_dict)
        assert len(rows) == 1
        assert rows[0][1] == "H"  # Haben
        assert "Gutschrift" in rows[0][13]  # Buchungstext
