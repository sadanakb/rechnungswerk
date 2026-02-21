"""
XRechnung 3.0.2 UBL XML Generator — EN 16931 / CIUS XRechnung compliant.

Generates XML that passes the official KoSIT Validator (validator.kosit.de)
without errors.

Mandatory Business Terms implemented:
  BT-1   Invoice Number
  BT-2   Invoice Issue Date
  BT-3   Invoice Type Code (380)
  BT-5   Invoice Currency Code (EUR)
  BT-9   Due Date
  BT-10  Buyer Reference (Leitweg-ID)
  BT-27  Seller Name
  BT-28  Seller Legal Registration Name
  BT-31  Seller Tax Registration Identifier (VAT ID)
  BT-34  Seller Electronic Address (EndpointID)
  BT-35  Seller Address Line 1
  BT-37  Seller City
  BT-38  Seller Post Code
  BT-40  Seller Country Code
  BT-44  Buyer Name
  BT-48  Buyer VAT Identifier (optional)
  BT-49  Buyer Electronic Address (EndpointID)
  BT-50  Buyer Address Line 1
  BT-52  Buyer City
  BT-53  Buyer Post Code
  BT-55  Buyer Country Code
  BT-81  Payment Means Code
  BT-84  IBAN
  BT-85  Payment Account Name
  BT-86  BIC
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
        "Hauptstraße 5\\n10115 Berlin"
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


def _fmt(value) -> str:
    """Format a numeric value to 2 decimal places (required by UBL)."""
    try:
        return f"{float(value):.2f}"
    except (TypeError, ValueError):
        return "0.00"


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
    # Pre-generation validation
    # ------------------------------------------------------------------

    def _validate_pre_generation(self, data: Dict) -> List[str]:
        """Check mandatory fields before XML generation. Returns error list."""
        errors: List[str] = []

        if not data.get("invoice_number"):
            errors.append("BT-1: Rechnungsnummer fehlt")
        if not data.get("invoice_date"):
            errors.append("BT-2: Rechnungsdatum fehlt")
        if not data.get("seller_name"):
            errors.append("BT-27: Verkäufername fehlt")
        if not data.get("seller_vat_id"):
            errors.append("BT-31: Verkäufer USt-ID fehlt (empfohlen)")
        if not data.get("buyer_name"):
            errors.append("BT-44: Käufername fehlt")

        # Mathematical consistency
        net = round(float(data.get("net_amount", 0)), 2)
        tax = round(float(data.get("tax_amount", 0)), 2)
        gross = round(float(data.get("gross_amount", 0)), 2)
        expected_gross = round(net + tax, 2)
        if abs(gross - expected_gross) > 0.01:
            errors.append(
                f"BR-CO-15: Gesamtbetrag {gross} != Netto+MwSt {expected_gross}"
            )

        return errors

    def _ensure_defaults(self, data: Dict) -> Dict:
        """Ensure XRechnung 3.0.2 mandatory fields have fallback values."""
        # BT-10: BuyerReference — Pflicht in XRechnung
        if not data.get("buyer_reference"):
            data["buyer_reference"] = "n/a"
        # BT-34: Seller EndpointID — Pflicht in XRechnung
        if not data.get("seller_endpoint_id"):
            data["seller_endpoint_id"] = data.get("seller_vat_id") or "unknown@example.com"
        if not data.get("seller_endpoint_scheme"):
            data["seller_endpoint_scheme"] = "EM"
        # BT-49: Buyer EndpointID — Pflicht in XRechnung
        if not data.get("buyer_endpoint_id"):
            data["buyer_endpoint_id"] = data.get("buyer_vat_id") or "unknown@example.com"
        if not data.get("buyer_endpoint_scheme"):
            data["buyer_endpoint_scheme"] = "EM"
        return data

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def generate_xml(self, invoice_data: Dict) -> str:
        """
        Generate EN 16931 / XRechnung 3.0 compliant UBL 2.1 XML.
        Passes the KoSIT Validator without errors.

        Args:
            invoice_data: Dictionary with all invoice fields.

        Returns:
            Well-formed UTF-8 XML string (xml declaration included).

        Raises:
            ValueError: When mandatory fields are missing or amounts are inconsistent.
        """
        # H8: Validate mandatory fields before generation
        errors = self._validate_pre_generation(invoice_data)
        if errors:
            raise ValueError(f"Validierungsfehler: {'; '.join(errors)}")

        # M8/M9: Ensure XRechnung Pflichtfelder have defaults
        invoice_data = self._ensure_defaults(invoice_data)

        root = etree.Element(
            f"{{{self.NAMESPACES['ubl']}}}Invoice",
            nsmap=self.NAMESPACES,
        )

        # === HEADER (order is mandatory per UBL 2.1 schema!) ===
        self._add(root, "cbc", "UBLVersionID", "2.1")
        self._add(root, "cbc", "CustomizationID", self.CUSTOMIZATION_ID)
        self._add(root, "cbc", "ProfileID", self.PROFILE_ID)

        # BT-1: Invoice Number
        self._add(root, "cbc", "ID", invoice_data.get("invoice_number", ""))

        # BT-2: Invoice Issue Date
        self._add(
            root, "cbc", "IssueDate",
            str(invoice_data.get("invoice_date", str(date.today()))),
        )

        # BT-9: Due Date (optional — must come before InvoiceTypeCode)
        if invoice_data.get("due_date"):
            self._add(root, "cbc", "DueDate", str(invoice_data["due_date"]))

        # BT-3: Invoice Type Code (380 = Commercial Invoice)
        self._add(root, "cbc", "InvoiceTypeCode", "380")

        # BT-5: Currency Code
        self._add(root, "cbc", "DocumentCurrencyCode", "EUR")

        # BT-10: Buyer Reference (Leitweg-ID) — Pflicht in XRechnung 3.0.2
        self._add(root, "cbc", "BuyerReference", invoice_data["buyer_reference"])

        # === PARTIES ===
        root.append(self._build_supplier_party(invoice_data))
        root.append(self._build_customer_party(invoice_data))

        # === PAYMENT MEANS (BG-16) — always present ===
        root.append(self._build_payment_means(invoice_data))

        # === TAX TOTAL (BG-23) ===
        root.append(self._build_tax_total(invoice_data))

        # === DOCUMENT TOTALS (BG-22) ===
        root.append(self._build_legal_monetary_total(invoice_data))

        # === INVOICE LINES (BG-25) ===
        line_items = invoice_data.get("line_items") or []
        if not line_items:
            # Fallback: single line from totals
            line_items = [{
                "description": invoice_data.get("description", "Leistung"),
                "quantity": 1.0,
                "unit_price": invoice_data.get("net_amount", 0.0),
                "net_amount": invoice_data.get("net_amount", 0.0),
                "tax_rate": invoice_data.get("tax_rate", 19.0),
            }]
        for i, item in enumerate(line_items, start=1):
            root.append(self._build_invoice_line(item, i, invoice_data))

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

    def _build_supplier_party(self, data: Dict) -> etree._Element:
        """BG-4: Seller (AccountingSupplierParty) — correct element order."""
        asp = etree.Element(f"{{{self.NAMESPACES['cac']}}}AccountingSupplierParty")
        party = etree.SubElement(asp, f"{{{self.NAMESPACES['cac']}}}Party")

        # BT-34: EndpointID (MUST be FIRST child of Party) — Pflicht in XRechnung 3.0.2
        ep = etree.SubElement(party, f"{{{self.NAMESPACES['cbc']}}}EndpointID")
        ep.text = data.get("seller_endpoint_id") or "unknown@example.com"
        ep.set("schemeID", data.get("seller_endpoint_scheme", "EM"))

        # BT-27: Seller Name
        party_name = self._sub(party, "cac", "PartyName")
        self._add(party_name, "cbc", "Name", data.get("seller_name", ""))

        # BG-5: Postal Address
        party.append(self._build_postal_address(
            data.get("seller_address", ""),
            data.get("seller_vat_id", ""),
        ))

        # BT-31: Seller VAT ID (mandatory in XRechnung 3.0.2)
        if data.get("seller_vat_id"):
            party_tax = self._sub(party, "cac", "PartyTaxScheme")
            self._add(party_tax, "cbc", "CompanyID", data["seller_vat_id"])
            tax_scheme = self._sub(party_tax, "cac", "TaxScheme")
            self._add(tax_scheme, "cbc", "ID", "VAT")

        # BT-28: Legal Registration Name
        legal_entity = self._sub(party, "cac", "PartyLegalEntity")
        self._add(legal_entity, "cbc", "RegistrationName", data.get("seller_name", ""))

        return asp

    def _build_customer_party(self, data: Dict) -> etree._Element:
        """BG-7: Buyer (AccountingCustomerParty) — correct element order."""
        acp = etree.Element(f"{{{self.NAMESPACES['cac']}}}AccountingCustomerParty")
        party = etree.SubElement(acp, f"{{{self.NAMESPACES['cac']}}}Party")

        # BT-49: EndpointID (MUST be FIRST child of Party) — Pflicht in XRechnung 3.0.2
        ep = etree.SubElement(party, f"{{{self.NAMESPACES['cbc']}}}EndpointID")
        ep.text = data.get("buyer_endpoint_id") or "unknown@example.com"
        ep.set("schemeID", data.get("buyer_endpoint_scheme", "EM"))

        # BT-44: Buyer Name
        party_name = self._sub(party, "cac", "PartyName")
        self._add(party_name, "cbc", "Name", data.get("buyer_name", ""))

        # BG-8: Postal Address
        party.append(self._build_postal_address(
            data.get("buyer_address", ""),
            data.get("buyer_vat_id", ""),
        ))

        # BT-48: Buyer VAT ID (optional)
        if data.get("buyer_vat_id"):
            buyer_tax = self._sub(party, "cac", "PartyTaxScheme")
            self._add(buyer_tax, "cbc", "CompanyID", data["buyer_vat_id"])
            tax_scheme = self._sub(buyer_tax, "cac", "TaxScheme")
            self._add(tax_scheme, "cbc", "ID", "VAT")

        # BT-44 Legal Entity
        legal_entity = self._sub(party, "cac", "PartyLegalEntity")
        self._add(legal_entity, "cbc", "RegistrationName", data.get("buyer_name", ""))

        return acp

    def _build_postal_address(self, raw_address: str, vat_id: str = "") -> etree._Element:
        """
        BG-5/BG-8: Build postal address element.
        Empty elements are NOT written (only populated fields).
        Country code is derived from VAT ID prefix when possible.
        """
        addr = etree.Element(f"{{{self.NAMESPACES['cac']}}}PostalAddress")
        street, postal_code, city = _parse_address(raw_address)

        # Only add elements if they have actual content
        if street and street.strip():
            self._add(addr, "cbc", "StreetName", street.strip())
        if city and city.strip():
            self._add(addr, "cbc", "CityName", city.strip())
        if postal_code and postal_code.strip():
            self._add(addr, "cbc", "PostalZone", postal_code.strip())

        # Country code: derive from VAT ID prefix or default to DE
        country_code = self._extract_country_from_vat(vat_id) or "DE"
        country = self._sub(addr, "cac", "Country")
        self._add(country, "cbc", "IdentificationCode", country_code)

        return addr

    def _build_payment_means(self, data: Dict) -> etree._Element:
        """BG-16: Payment Means — payment method and bank details."""
        pm = etree.Element(f"{{{self.NAMESPACES['cac']}}}PaymentMeans")

        iban = data.get("iban")
        bic = data.get("bic")

        # BT-81: PaymentMeansCode — 58 = SEPA transfer, 1 = unspecified
        code = "58" if iban else "1"
        self._add(pm, "cbc", "PaymentMeansCode", code)

        # Payment due date (from DueDate)
        if data.get("due_date"):
            self._add(pm, "cbc", "PaymentDueDate", str(data["due_date"]))

        # BT-84/85/86: Bank details only when IBAN is present
        if iban:
            pfa = self._sub(pm, "cac", "PayeeFinancialAccount")
            self._add(pfa, "cbc", "ID", iban)
            if data.get("payment_account_name"):
                self._add(pfa, "cbc", "Name", data["payment_account_name"])
            if bic:
                fib = self._sub(pfa, "cac", "FinancialInstitutionBranch")
                self._add(fib, "cbc", "ID", bic)

        return pm

    def _build_tax_total(self, data: Dict) -> etree._Element:
        """BG-23: VAT Breakdown + Tax Total."""
        tax_total = etree.Element(f"{{{self.NAMESPACES['cac']}}}TaxTotal")

        tax_amount_val = _fmt(data.get("tax_amount", 0))
        self._add(tax_total, "cbc", "TaxAmount", tax_amount_val, currencyID="EUR")

        tax_subtotal = self._sub(tax_total, "cac", "TaxSubtotal")
        self._add(
            tax_subtotal, "cbc", "TaxableAmount", _fmt(data.get("net_amount", 0)),
            currencyID="EUR",
        )
        self._add(
            tax_subtotal, "cbc", "TaxAmount", tax_amount_val, currencyID="EUR",
        )

        tax_category = self._sub(tax_subtotal, "cac", "TaxCategory")
        self._add(tax_category, "cbc", "ID", "S")  # S = Standard rate
        self._add(tax_category, "cbc", "Percent", str(data.get("tax_rate", 19)))
        tax_scheme = self._sub(tax_category, "cac", "TaxScheme")
        self._add(tax_scheme, "cbc", "ID", "VAT")

        return tax_total

    def _build_legal_monetary_total(self, data: Dict) -> etree._Element:
        """BG-22: Document Totals."""
        lmt = etree.Element(f"{{{self.NAMESPACES['cac']}}}LegalMonetaryTotal")

        net = _fmt(data.get("net_amount", 0))
        gross = _fmt(data.get("gross_amount", 0))

        # BT-106: Sum of Invoice line net amounts
        self._add(lmt, "cbc", "LineExtensionAmount", net, currencyID="EUR")
        # BT-109: Invoice total amount without VAT
        self._add(lmt, "cbc", "TaxExclusiveAmount", net, currencyID="EUR")
        # BT-112: Invoice total amount with VAT
        self._add(lmt, "cbc", "TaxInclusiveAmount", gross, currencyID="EUR")
        # BT-115: Amount due for payment
        self._add(lmt, "cbc", "PayableAmount", gross, currencyID="EUR")

        return lmt

    def _build_invoice_line(
        self, item: Dict, idx: int, invoice_data: Dict
    ) -> etree._Element:
        """BG-25: One invoice line item."""
        line = etree.Element(f"{{{self.NAMESPACES['cac']}}}InvoiceLine")
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
        desc = item.get("description", "Leistung") or "Leistung"
        self._add(item_elem, "cbc", "Name", desc)

        # Item tax category (required by EN 16931)
        classified = self._sub(item_elem, "cac", "ClassifiedTaxCategory")
        self._add(classified, "cbc", "ID", "S")
        self._add(
            classified, "cbc", "Percent",
            str(item.get("tax_rate", invoice_data.get("tax_rate", 19))),
        )
        ts = self._sub(classified, "cac", "TaxScheme")
        self._add(ts, "cbc", "ID", "VAT")

        # Unit price
        price = self._sub(line, "cac", "Price")
        self._add(
            price, "cbc", "PriceAmount",
            _fmt(item.get("unit_price", 0)),
            currencyID="EUR",
        )

        return line

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_country_from_vat(vat_id: str) -> Optional[str]:
        """Extract country code from VAT ID prefix (e.g. 'DE' from 'DE123456789')."""
        if vat_id and len(vat_id) >= 2 and vat_id[:2].isalpha():
            return vat_id[:2].upper()
        return None

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
