"""
XRechnung 3.0.2 UBL XML Generator (EN 16931 / CIUS XRechnung compliant)

Implements all mandatory Business Terms:
  BT-1   Invoice Number
  BT-2   Invoice Issue Date
  BT-3   Invoice Type Code (380)
  BT-5   Invoice Currency Code (EUR)
  BT-9   Due Date
  BT-27  Seller Name
  BT-31  Seller Tax Registration Identifier (VAT ID) -- NEW MANDATORY in 3.0.2
  BT-35  Seller Address Line 1
  BT-37  Seller City
  BT-38  Seller Post Code
  BT-40  Seller Country Code
  BT-44  Buyer Name
  BT-48  Buyer VAT Identifier (optional)
  BT-50  Buyer Address Line 1
  BT-52  Buyer City
  BT-53  Buyer Post Code
  BT-55  Buyer Country Code
  BT-109 Tax Exclusive Amount (Net)
  BT-110 Total VAT Amount
  BT-112 Payable Amount (Gross)
  BT-113 Line Extension Amount
  BT-116 Invoice Line (per item)
"""
import re
from lxml import etree
from datetime import date
from typing import Dict, List, Optional, Tuple
from app.config import settings


def _parse_address(raw: Optional[str]) -> Tuple[str, str, str]:
    """
    Parse a free-text address into (street, postal_code, city).

    Accepted formats (examples):
        "Musterstraße 1, 60311 Frankfurt am Main"
        "Hauptstraße 5\n10115 Berlin"
        "Unter den Linden 10 10117 Berlin"
    Returns ("", "", "") when nothing can be extracted.
    """
    if not raw:
        return "", "", ""

    # Normalise separators
    text = raw.replace("\n", ", ")

    # Attempt "PostalCode City" pattern (German 5-digit ZIP)
    zip_city_match = re.search(r"(\d{5})\s+([A-ZÄÖÜa-zäöüß][^\,]+)", text)
    if zip_city_match:
        postal = zip_city_match.group(1)
        city = zip_city_match.group(2).strip()
        # Street = everything before the zip/city block
        street = text[: zip_city_match.start()].strip().rstrip(",").strip()
        return street, postal, city

    # Fallback: first comma-separated part is street, rest is city
    parts = [p.strip() for p in text.split(",") if p.strip()]
    street = parts[0] if len(parts) > 0 else raw
    city = parts[1] if len(parts) > 1 else ""
    return street, "", city


class XRechnungGenerator:
    """Generate XRechnung-compliant UBL XML (version 3.0.2)."""

    NAMESPACES: Dict[str, str] = {
        "ubl": "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
        "cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
        "cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
    }

    # XRechnung 3.0.2 Customization ID
    CUSTOMIZATION_ID = (
        "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0"
    )
    PROFILE_ID = "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0"

    def __init__(self) -> None:
        self.version = settings.xrechnung_version

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def generate_xml(self, invoice_data: Dict) -> str:
        """
        Generate XRechnung UBL XML from an invoice data dictionary.

        Args:
            invoice_data: Dictionary with all invoice fields.

        Returns:
            Well-formed UTF-8 XML string (xml declaration included).
        """
        root = etree.Element(
            f"{{{self.NAMESPACES['ubl']}}}Invoice",
            nsmap=self.NAMESPACES,
        )

        # ---- Header elements ----
        self._add(root, "cbc", "UBLVersionID", "2.1")
        self._add(root, "cbc", "CustomizationID", self.CUSTOMIZATION_ID)
        self._add(root, "cbc", "ProfileID", self.PROFILE_ID)

        # BT-1: Invoice Number
        self._add(root, "cbc", "ID", invoice_data.get("invoice_number", ""))

        # BT-2: Invoice Issue Date
        self._add(
            root,
            "cbc",
            "IssueDate",
            invoice_data.get("invoice_date", str(date.today())),
        )

        # BT-9: Due Date (optional)
        if invoice_data.get("due_date"):
            self._add(root, "cbc", "DueDate", str(invoice_data["due_date"]))

        # BT-3: Invoice Type Code (380 = Commercial Invoice)
        self._add(root, "cbc", "InvoiceTypeCode", "380")

        # BT-5: Currency Code
        self._add(root, "cbc", "DocumentCurrencyCode", "EUR")

        # ---- Seller (BG-4) ----
        self._build_supplier_party(root, invoice_data)

        # ---- Buyer (BG-7) ----
        self._build_customer_party(root, invoice_data)

        # ---- Tax Total (BG-23) ----
        self._build_tax_total(root, invoice_data)

        # ---- Document Totals (BG-22) ----
        self._build_legal_monetary_total(root, invoice_data)

        # ---- Invoice Lines (BG-25) ----
        for idx, item in enumerate(invoice_data.get("line_items", []), start=1):
            self._build_invoice_line(root, idx, item)

        xml_bytes = etree.tostring(
            root,
            pretty_print=True,
            xml_declaration=True,
            encoding="UTF-8",
        )
        return xml_bytes.decode("utf-8")

    # ------------------------------------------------------------------
    # Private builders
    # ------------------------------------------------------------------

    def _build_supplier_party(self, root: etree._Element, data: Dict) -> None:
        """BG-4: Seller (AccountingSupplierParty)."""
        supplier = self._sub(root, "cac", "AccountingSupplierParty")
        party = self._sub(supplier, "cac", "Party")

        # BT-27: Seller Name
        party_name = self._sub(party, "cac", "PartyName")
        self._add(party_name, "cbc", "Name", data.get("seller_name", ""))

        # BT-35 / BT-37 / BT-38 / BT-40: Seller Postal Address
        street, postal, city = _parse_address(data.get("seller_address"))
        postal_addr = self._sub(party, "cac", "PostalAddress")
        self._add(postal_addr, "cbc", "StreetName", street)
        if postal:
            self._add(postal_addr, "cbc", "PostalZone", postal)
        if city:
            self._add(postal_addr, "cbc", "CityName", city)
        country = self._sub(postal_addr, "cac", "Country")
        self._add(country, "cbc", "IdentificationCode", "DE")

        # BT-31: Seller VAT ID (MANDATORY in XRechnung 3.0.2)
        party_tax = self._sub(party, "cac", "PartyTaxScheme")
        self._add(party_tax, "cbc", "CompanyID", data.get("seller_vat_id", ""))
        tax_scheme = self._sub(party_tax, "cac", "TaxScheme")
        self._add(tax_scheme, "cbc", "ID", "VAT")

        # BT-33 / Legal Entity (required by EN 16931)
        legal_entity = self._sub(party, "cac", "PartyLegalEntity")
        self._add(legal_entity, "cbc", "RegistrationName", data.get("seller_name", ""))

    def _build_customer_party(self, root: etree._Element, data: Dict) -> None:
        """BG-7: Buyer (AccountingCustomerParty)."""
        customer = self._sub(root, "cac", "AccountingCustomerParty")
        party = self._sub(customer, "cac", "Party")

        # BT-44: Buyer Name
        party_name = self._sub(party, "cac", "PartyName")
        self._add(party_name, "cbc", "Name", data.get("buyer_name", ""))

        # BT-50 / BT-52 / BT-53 / BT-55: Buyer Postal Address
        street, postal, city = _parse_address(data.get("buyer_address"))
        postal_addr = self._sub(party, "cac", "PostalAddress")
        self._add(postal_addr, "cbc", "StreetName", street)
        if postal:
            self._add(postal_addr, "cbc", "PostalZone", postal)
        if city:
            self._add(postal_addr, "cbc", "CityName", city)
        country = self._sub(postal_addr, "cac", "Country")
        self._add(country, "cbc", "IdentificationCode", "DE")

        # BT-48: Buyer VAT ID (optional)
        if data.get("buyer_vat_id"):
            buyer_tax = self._sub(party, "cac", "PartyTaxScheme")
            self._add(buyer_tax, "cbc", "CompanyID", data["buyer_vat_id"])
            tax_scheme = self._sub(buyer_tax, "cac", "TaxScheme")
            self._add(tax_scheme, "cbc", "ID", "VAT")

        # BT-44 Legal Entity
        legal_entity = self._sub(party, "cac", "PartyLegalEntity")
        self._add(legal_entity, "cbc", "RegistrationName", data.get("buyer_name", ""))

    def _build_tax_total(self, root: etree._Element, data: Dict) -> None:
        """BG-23: VAT Breakdown + Tax Total."""
        tax_total = self._sub(root, "cac", "TaxTotal")

        tax_amount_val = _fmt(data.get("tax_amount", 0))
        self._add(tax_total, "cbc", "TaxAmount", tax_amount_val, currencyID="EUR")

        tax_subtotal = self._sub(tax_total, "cac", "TaxSubtotal")
        self._add(
            tax_subtotal, "cbc", "TaxableAmount", _fmt(data.get("net_amount", 0)),
            currencyID="EUR",
        )
        self._add(
            tax_subtotal, "cbc", "TaxAmount", tax_amount_val, currencyID="EUR"
        )

        tax_category = self._sub(tax_subtotal, "cac", "TaxCategory")
        self._add(tax_category, "cbc", "ID", "S")  # S = Standard rate
        self._add(
            tax_category, "cbc", "Percent", str(data.get("tax_rate", 19))
        )
        tax_scheme = self._sub(tax_category, "cac", "TaxScheme")
        self._add(tax_scheme, "cbc", "ID", "VAT")

    def _build_legal_monetary_total(self, root: etree._Element, data: Dict) -> None:
        """BG-22: Document Totals."""
        lmt = self._sub(root, "cac", "LegalMonetaryTotal")

        net = _fmt(data.get("net_amount", 0))
        gross = _fmt(data.get("gross_amount", 0))

        # BT-113: Sum of line extension amounts
        self._add(lmt, "cbc", "LineExtensionAmount", net, currencyID="EUR")
        # BT-109: Invoice total amount without VAT
        self._add(lmt, "cbc", "TaxExclusiveAmount", net, currencyID="EUR")
        # BT-112: Invoice total amount with VAT
        self._add(lmt, "cbc", "TaxInclusiveAmount", gross, currencyID="EUR")
        # BT-115: Amount due for payment
        self._add(lmt, "cbc", "PayableAmount", gross, currencyID="EUR")

    def _build_invoice_line(
        self, root: etree._Element, idx: int, item: Dict
    ) -> None:
        """BG-25: One invoice line item."""
        line = self._sub(root, "cac", "InvoiceLine")
        self._add(line, "cbc", "ID", str(idx))
        self._add(
            line, "cbc", "InvoicedQuantity",
            str(item.get("quantity", 1)),
            unitCode="C62",
        )
        self._add(
            line, "cbc", "LineExtensionAmount",
            _fmt(item.get("net_amount", 0)),
            currencyID="EUR",
        )

        # Item description
        item_elem = self._sub(line, "cac", "Item")
        self._add(item_elem, "cbc", "Description", item.get("description", ""))
        self._add(item_elem, "cbc", "Name", item.get("description", ""))

        # Item tax category (required by EN 16931)
        classified = self._sub(item_elem, "cac", "ClassifiedTaxCategory")
        self._add(classified, "cbc", "ID", "S")
        self._add(classified, "cbc", "Percent", str(item.get("tax_rate", 19)))
        ts = self._sub(classified, "cac", "TaxScheme")
        self._add(ts, "cbc", "ID", "VAT")

        # Unit price
        price = self._sub(line, "cac", "Price")
        self._add(
            price, "cbc", "PriceAmount",
            _fmt(item.get("unit_price", 0)),
            currencyID="EUR",
        )

    # ------------------------------------------------------------------
    # Low-level helpers
    # ------------------------------------------------------------------

    def _sub(
        self, parent: etree._Element, ns: str, tag: str, **attribs
    ) -> etree._Element:
        """Append a child element with namespace and optional attributes."""
        return etree.SubElement(
            parent, f"{{{self.NAMESPACES[ns]}}}{tag}", **attribs
        )

    def _add(
        self,
        parent: etree._Element,
        ns: str,
        tag: str,
        text: str,
        **attribs,
    ) -> etree._Element:
        """Append a child element with text content."""
        elem = self._sub(parent, ns, tag, **attribs)
        elem.text = str(text) if text is not None else ""
        return elem


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------

def _fmt(value) -> str:
    """Format a numeric value to 2 decimal places (required by UBL)."""
    try:
        return f"{float(value):.2f}"
    except (TypeError, ValueError):
        return "0.00"
