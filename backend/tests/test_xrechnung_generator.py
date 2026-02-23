"""
Tests for XRechnung 3.0.2 UBL XML generation.

Verifies:
- Valid XML output with correct namespaces
- All mandatory Business Terms present (BT-1 through BT-116)
- Mathematical consistency check (BR-CO-15)
- Multi-currency support
- Address parsing
- Pre-generation validation
"""
import pytest
from lxml import etree
from app.xrechnung_generator import XRechnungGenerator, _parse_address, _fmt


NS = {
    "ubl": "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
    "cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    "cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
}


@pytest.fixture()
def gen():
    return XRechnungGenerator()


class TestParseAddress:
    """Tests for the _parse_address helper."""

    def test_standard_german_format(self):
        street, plz, city = _parse_address("Musterstraße 1, 60311 Frankfurt am Main")
        assert plz == "60311"
        assert city == "Frankfurt am Main"
        assert "Musterstraße" in street

    def test_newline_format(self):
        street, plz, city = _parse_address("Hauptstraße 5\n10115 Berlin")
        assert plz == "10115"
        assert city == "Berlin"

    def test_empty_string(self):
        assert _parse_address("") == ("", "", "")

    def test_none(self):
        assert _parse_address(None) == ("", "", "")

    def test_only_city(self):
        street, plz, city = _parse_address("Berlin")
        assert street == "Berlin"


class TestFmt:
    """Tests for the _fmt numeric formatter."""

    def test_integer(self):
        assert _fmt(100) == "100.00"

    def test_float(self):
        assert _fmt(99.9) == "99.90"

    def test_string_number(self):
        assert _fmt("1500.50") == "1500.50"

    def test_none(self):
        assert _fmt(None) == "0.00"

    def test_invalid(self):
        assert _fmt("abc") == "0.00"


class TestXRechnungGenerator:
    """Core generator tests."""

    def test_generates_valid_xml(self, gen, sample_invoice_dict):
        xml = gen.generate_xml(sample_invoice_dict)
        assert xml.startswith("<?xml")
        # Should parse without errors
        root = etree.fromstring(xml.encode("utf-8"))
        assert root.tag == f"{{{NS['ubl']}}}Invoice"

    def test_mandatory_header_fields(self, gen, sample_invoice_dict):
        xml = gen.generate_xml(sample_invoice_dict)
        root = etree.fromstring(xml.encode("utf-8"))

        # BT-1: Invoice Number
        assert root.findtext("cbc:ID", namespaces=NS) == "RE-2026-001"

        # BT-2: Issue Date
        assert root.findtext("cbc:IssueDate", namespaces=NS) == "2026-02-23"

        # BT-3: Invoice Type Code
        assert root.findtext("cbc:InvoiceTypeCode", namespaces=NS) == "380"

        # BT-5: Currency
        assert root.findtext("cbc:DocumentCurrencyCode", namespaces=NS) == "EUR"

        # Customization ID (XRechnung 3.0)
        cust_id = root.findtext("cbc:CustomizationID", namespaces=NS)
        assert "xrechnung" in cust_id.lower()

    def test_seller_party(self, gen, sample_invoice_dict):
        xml = gen.generate_xml(sample_invoice_dict)
        root = etree.fromstring(xml.encode("utf-8"))

        supplier = root.find("cac:AccountingSupplierParty/cac:Party", namespaces=NS)
        assert supplier is not None

        # BT-27: Seller Name
        name = supplier.findtext("cac:PartyName/cbc:Name", namespaces=NS)
        assert name == "Musterfirma GmbH"

        # BT-31: VAT ID
        vat = supplier.findtext("cac:PartyTaxScheme/cbc:CompanyID", namespaces=NS)
        assert vat == "DE123456789"

        # BT-34: EndpointID
        endpoint = supplier.findtext("cbc:EndpointID", namespaces=NS)
        assert endpoint is not None

    def test_buyer_party(self, gen, sample_invoice_dict):
        xml = gen.generate_xml(sample_invoice_dict)
        root = etree.fromstring(xml.encode("utf-8"))

        customer = root.find("cac:AccountingCustomerParty/cac:Party", namespaces=NS)
        assert customer is not None

        # BT-44: Buyer Name
        name = customer.findtext("cac:PartyName/cbc:Name", namespaces=NS)
        assert name == "Käufer AG"

    def test_tax_total(self, gen, sample_invoice_dict):
        xml = gen.generate_xml(sample_invoice_dict)
        root = etree.fromstring(xml.encode("utf-8"))

        tax_total = root.find("cac:TaxTotal", namespaces=NS)
        assert tax_total is not None

        tax_amount = tax_total.findtext("cbc:TaxAmount", namespaces=NS)
        assert tax_amount == "285.00"  # 1500 * 0.19

    def test_monetary_total(self, gen, sample_invoice_dict):
        xml = gen.generate_xml(sample_invoice_dict)
        root = etree.fromstring(xml.encode("utf-8"))

        lmt = root.find("cac:LegalMonetaryTotal", namespaces=NS)
        assert lmt is not None

        assert lmt.findtext("cbc:LineExtensionAmount", namespaces=NS) == "1500.00"
        assert lmt.findtext("cbc:TaxExclusiveAmount", namespaces=NS) == "1500.00"
        assert lmt.findtext("cbc:PayableAmount", namespaces=NS) == "1785.00"

    def test_invoice_lines(self, gen, sample_invoice_dict):
        xml = gen.generate_xml(sample_invoice_dict)
        root = etree.fromstring(xml.encode("utf-8"))

        lines = root.findall("cac:InvoiceLine", namespaces=NS)
        assert len(lines) == 1

        line = lines[0]
        assert line.findtext("cbc:ID", namespaces=NS) == "1"
        name = line.findtext("cac:Item/cbc:Name", namespaces=NS)
        assert name == "Beratungsleistung"

    def test_payment_means_with_iban(self, gen, sample_invoice_dict):
        xml = gen.generate_xml(sample_invoice_dict)
        root = etree.fromstring(xml.encode("utf-8"))

        pm = root.find("cac:PaymentMeans", namespaces=NS)
        assert pm is not None

        # SEPA transfer
        code = pm.findtext("cbc:PaymentMeansCode", namespaces=NS)
        assert code == "58"

        # IBAN
        iban = pm.findtext(
            "cac:PayeeFinancialAccount/cbc:ID", namespaces=NS
        )
        assert iban == "DE89370400440532013000"

    def test_multi_currency_usd(self, gen, sample_invoice_dict):
        """Currency codes must appear in all currencyID attributes."""
        sample_invoice_dict["currency"] = "USD"
        xml = gen.generate_xml(sample_invoice_dict)

        # All currencyID attributes should be USD
        root = etree.fromstring(xml.encode("utf-8"))
        for elem in root.iter():
            if "currencyID" in elem.attrib:
                assert elem.attrib["currencyID"] == "USD"

        assert root.findtext("cbc:DocumentCurrencyCode", namespaces=NS) == "USD"

    def test_multiple_line_items(self, gen, sample_invoice_dict):
        sample_invoice_dict["line_items"] = [
            {"description": "Posten A", "quantity": 2, "unit_price": 500, "net_amount": 1000, "tax_rate": 19},
            {"description": "Posten B", "quantity": 1, "unit_price": 500, "net_amount": 500, "tax_rate": 19},
        ]
        xml = gen.generate_xml(sample_invoice_dict)
        root = etree.fromstring(xml.encode("utf-8"))
        lines = root.findall("cac:InvoiceLine", namespaces=NS)
        assert len(lines) == 2


class TestPreGenerationValidation:
    """Tests for input validation before XML generation."""

    def test_missing_invoice_number_raises(self, gen, sample_invoice_dict):
        sample_invoice_dict["invoice_number"] = ""
        with pytest.raises(ValueError, match="BT-1"):
            gen.generate_xml(sample_invoice_dict)

    def test_missing_seller_name_raises(self, gen, sample_invoice_dict):
        sample_invoice_dict["seller_name"] = ""
        with pytest.raises(ValueError, match="BT-27"):
            gen.generate_xml(sample_invoice_dict)

    def test_inconsistent_amounts_raises(self, gen, sample_invoice_dict):
        sample_invoice_dict["gross_amount"] = 9999.99  # Wrong total
        with pytest.raises(ValueError, match="BR-CO-15"):
            gen.generate_xml(sample_invoice_dict)

    def test_reduced_vat_rate(self, gen, sample_invoice_dict):
        """7% VAT rate (ermäßigter Steuersatz) should work."""
        sample_invoice_dict["tax_rate"] = 7.0
        sample_invoice_dict["tax_amount"] = 105.0  # 1500 * 0.07
        sample_invoice_dict["gross_amount"] = 1605.0
        sample_invoice_dict["line_items"][0]["tax_rate"] = 7.0

        xml = gen.generate_xml(sample_invoice_dict)
        root = etree.fromstring(xml.encode("utf-8"))
        percent = root.findtext(
            "cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cbc:Percent",
            namespaces=NS,
        )
        assert percent == "7"
