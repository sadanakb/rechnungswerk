"""
KoSIT Validator — XRechnung validation against official Schematron rules.

Supports two modes:
  1. Docker-based: KoSIT validator running as Docker container (preferred)
  2. Local fallback: Basic XML schema validation with lxml

The Docker-based validator is the official KoSIT validator:
  docker run -p 8080:8080 itplr-kosit/validator
"""
import logging
import uuid
from typing import Dict, List, Optional
from datetime import datetime, timezone

import httpx
from lxml import etree

from app.config import settings

logger = logging.getLogger(__name__)

# XRechnung Schematron namespace
UBL_NS = "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"


class KoSITValidator:
    """Validate XRechnung XML against KoSIT validator or local rules."""

    def __init__(self):
        self.validator_url = settings.kosit_validator_url

    async def validate(self, xml_content: str) -> Dict:
        """
        Validate XRechnung XML.

        Returns:
            {
                "validation_id": str,
                "is_valid": bool,
                "error_count": int,
                "warning_count": int,
                "errors": [{"code": str, "message": str, "location": str}],
                "warnings": [{"code": str, "message": str, "location": str}],
                "report_html": str | None,
                "validator": "kosit" | "local",
            }
        """
        validation_id = f"val-{uuid.uuid4().hex[:8]}"

        # Try Docker-based KoSIT validator first
        try:
            result = await self._validate_kosit(xml_content)
            result["validation_id"] = validation_id
            return result
        except Exception as e:
            logger.warning("KoSIT validator unavailable (%s), using local validation", e)

        # Fallback: local XML validation
        result = self._validate_local(xml_content)
        result["validation_id"] = validation_id
        return result

    async def _validate_kosit(self, xml_content: str) -> Dict:
        """Validate via Docker-based KoSIT validator REST API."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                self.validator_url,
                content=xml_content.encode("utf-8"),
                headers={"Content-Type": "application/xml"},
            )

        if response.status_code != 200:
            raise ConnectionError(
                f"KoSIT validator returned status {response.status_code}"
            )

        # Parse KoSIT response (XML report)
        report = response.text
        errors, warnings = self._parse_kosit_report(report)

        return {
            "is_valid": len(errors) == 0,
            "error_count": len(errors),
            "warning_count": len(warnings),
            "errors": errors,
            "warnings": warnings,
            "report_html": report if "<html" in report.lower() else None,
            "validator": "kosit",
        }

    def _parse_kosit_report(self, report_xml: str) -> tuple:
        """Parse KoSIT validation report for errors and warnings."""
        errors: List[Dict] = []
        warnings: List[Dict] = []

        try:
            root = etree.fromstring(report_xml.encode("utf-8"))

            # KoSIT report uses svrl namespace for Schematron results
            svrl_ns = "http://purl.oclc.org/dml/svrl"

            for failed in root.iter(f"{{{svrl_ns}}}failed-assert"):
                msg = ""
                for text in failed.iter(f"{{{svrl_ns}}}text"):
                    msg = (text.text or "").strip()

                entry = {
                    "code": failed.get("id", ""),
                    "message": msg,
                    "location": failed.get("location", ""),
                }

                flag = (failed.get("flag") or "error").lower()
                if flag in ("fatal", "error"):
                    errors.append(entry)
                else:
                    warnings.append(entry)

        except Exception as e:
            logger.warning("Could not parse KoSIT report: %s", e)
            # If we can't parse the report, check for simple error indicators
            if "error" in report_xml.lower() or "invalid" in report_xml.lower():
                errors.append({
                    "code": "PARSE_ERROR",
                    "message": "KoSIT-Report konnte nicht geparst werden",
                    "location": "",
                })

        return errors, warnings

    def _validate_local(self, xml_content: str) -> Dict:
        """Local XML validation (basic structure + mandatory field checks)."""
        errors: List[Dict] = []
        warnings: List[Dict] = []

        try:
            root = etree.fromstring(xml_content.encode("utf-8"))
        except etree.XMLSyntaxError as e:
            return {
                "is_valid": False,
                "error_count": 1,
                "warning_count": 0,
                "errors": [{"code": "XML_SYNTAX", "message": str(e), "location": ""}],
                "warnings": [],
                "report_html": None,
                "validator": "local",
            }

        ns = {"cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
              "cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"}

        # Check mandatory elements
        mandatory_checks = [
            ("cbc:ID", "BT-1: Rechnungsnummer fehlt"),
            ("cbc:IssueDate", "BT-2: Rechnungsdatum fehlt"),
            ("cbc:InvoiceTypeCode", "BT-3: Rechnungstyp fehlt"),
            ("cbc:DocumentCurrencyCode", "BT-5: Waehrungscode fehlt"),
            ("cbc:BuyerReference", "BT-10: Kaeuferreferenz fehlt"),
        ]

        for xpath, msg in mandatory_checks:
            elem = root.find(xpath, ns)
            if elem is None or not (elem.text or "").strip():
                errors.append({"code": xpath, "message": msg, "location": xpath})

        # Check parties
        supplier = root.find(".//cac:AccountingSupplierParty", ns)
        if supplier is None:
            errors.append({"code": "BG-4", "message": "Verkaeufer (BG-4) fehlt", "location": "AccountingSupplierParty"})

        customer = root.find(".//cac:AccountingCustomerParty", ns)
        if customer is None:
            errors.append({"code": "BG-7", "message": "Kaeufer (BG-7) fehlt", "location": "AccountingCustomerParty"})

        # Check monetary totals
        lmt = root.find(".//cac:LegalMonetaryTotal", ns)
        if lmt is None:
            errors.append({"code": "BG-22", "message": "Dokumentensummen (BG-22) fehlen", "location": "LegalMonetaryTotal"})

        # Check tax total
        tax_total = root.find(".//cac:TaxTotal", ns)
        if tax_total is None:
            errors.append({"code": "BG-23", "message": "Steuersumme (BG-23) fehlt", "location": "TaxTotal"})

        # Check invoice lines
        lines = root.findall(".//cac:InvoiceLine", ns)
        if not lines:
            errors.append({"code": "BG-25", "message": "Keine Rechnungspositionen (BG-25)", "location": "InvoiceLine"})

        # Check CustomizationID for XRechnung
        cust_id = root.find("cbc:CustomizationID", ns)
        if cust_id is not None and "xrechnung" not in (cust_id.text or "").lower():
            warnings.append({
                "code": "BT-24",
                "message": "CustomizationID enthaelt nicht 'xrechnung'",
                "location": "cbc:CustomizationID",
            })

        return {
            "is_valid": len(errors) == 0,
            "error_count": len(errors),
            "warning_count": len(warnings),
            "errors": errors,
            "warnings": warnings,
            "report_html": None,
            "validator": "local",
        }

    async def is_available(self) -> bool:
        """Check if KoSIT Docker validator is running."""
        try:
            base_url = self.validator_url.rsplit("/validate", 1)[0]
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(base_url)
            return resp.status_code < 500
        except Exception:
            return False
