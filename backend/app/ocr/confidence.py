"""
Per-field confidence scoring and mathematical consistency checks.

Provides:
- Per-field confidence: green (>90%), yellow (70-90%), red (<70%)
- Mathematical consistency checks (net + tax = gross)
- IBAN/BIC format validation scoring
- Date format validation scoring
"""
import re
import logging
from typing import Dict, Optional, List, Tuple

logger = logging.getLogger(__name__)

# Fields expected from invoice extraction
CORE_FIELDS = [
    "invoice_number", "invoice_date", "seller_name", "seller_vat_id",
    "seller_address", "buyer_name", "buyer_address",
    "net_amount", "tax_amount", "gross_amount", "tax_rate",
]

OPTIONAL_FIELDS = [
    "due_date", "buyer_vat_id", "iban", "bic", "payment_account_name",
    "buyer_reference", "seller_endpoint_id", "buyer_endpoint_id",
    "currency", "line_items",
]

ALL_FIELDS = CORE_FIELDS + OPTIONAL_FIELDS


class ConfidenceScorer:
    """Calculate per-field and overall confidence scores."""

    def score(self, fields: Dict) -> Dict:
        """
        Score each field and compute overall confidence.

        Returns:
            {
                "field_confidences": {"field_name": {"score": 0-100, "level": "high|medium|low", "reason": "..."}},
                "overall_confidence": float,
                "consistency_checks": [{"check": "...", "passed": bool, "detail": "..."}],
                "completeness": float,
            }
        """
        field_confs = {}
        checks = self._run_consistency_checks(fields)

        for f in ALL_FIELDS:
            field_confs[f] = self._score_field(f, fields)

        # Boost/penalize based on consistency
        field_confs = self._apply_consistency_adjustments(field_confs, checks)

        # Overall = weighted average (core fields count more)
        scores = []
        for f in CORE_FIELDS:
            scores.append(field_confs[f]["score"] * 2)  # Double weight
        for f in OPTIONAL_FIELDS:
            if fields.get(f) not in (None, "", 0, 0.0, []):
                scores.append(field_confs[f]["score"])

        overall = sum(scores) / len(scores) if scores else 0.0

        # Completeness: how many core fields are filled
        filled_core = sum(
            1 for f in CORE_FIELDS
            if fields.get(f) not in (None, "", 0, 0.0)
        )
        completeness = round((filled_core / len(CORE_FIELDS)) * 100, 2)

        return {
            "field_confidences": field_confs,
            "overall_confidence": round(overall, 2),
            "consistency_checks": checks,
            "completeness": completeness,
        }

    def _score_field(self, field_name: str, fields: Dict) -> Dict:
        """Score a single field."""
        value = fields.get(field_name)

        # Empty/missing field
        if value is None or value == "" or value == 0 or value == 0.0:
            if field_name in CORE_FIELDS:
                return {"score": 0, "level": "low", "reason": "Pflichtfeld fehlt"}
            return {"score": 50, "level": "medium", "reason": "Optionales Feld fehlt"}

        # Field-specific validation
        validators = {
            "invoice_number": self._score_invoice_number,
            "invoice_date": self._score_date,
            "due_date": self._score_date,
            "seller_vat_id": self._score_vat_id,
            "buyer_vat_id": self._score_vat_id,
            "iban": self._score_iban,
            "bic": self._score_bic,
            "net_amount": self._score_amount,
            "tax_amount": self._score_amount,
            "gross_amount": self._score_amount,
            "tax_rate": self._score_tax_rate,
            "seller_name": self._score_name,
            "buyer_name": self._score_name,
            "seller_address": self._score_address,
            "buyer_address": self._score_address,
            "line_items": self._score_line_items,
        }

        validator = validators.get(field_name, self._score_generic)
        return validator(value)

    def _score_invoice_number(self, value) -> Dict:
        v = str(value).strip()
        if not v:
            return {"score": 0, "level": "low", "reason": "Leer"}
        if len(v) >= 3 and any(c.isdigit() for c in v):
            return {"score": 95, "level": "high", "reason": "Gueltige Rechnungsnummer"}
        return {"score": 70, "level": "medium", "reason": "Format unklar"}

    def _score_date(self, value) -> Dict:
        v = str(value).strip()
        if re.match(r"^\d{4}-\d{2}-\d{2}$", v):
            return {"score": 98, "level": "high", "reason": "ISO-Datum"}
        if re.match(r"^\d{1,2}\.\d{1,2}\.\d{4}$", v):
            return {"score": 90, "level": "high", "reason": "Deutsches Datum"}
        return {"score": 60, "level": "low", "reason": "Unbekanntes Datumsformat"}

    def _score_vat_id(self, value) -> Dict:
        v = str(value).strip().upper()
        if re.match(r"^DE\d{9}$", v):
            return {"score": 98, "level": "high", "reason": "Deutsche USt-IdNr"}
        if re.match(r"^[A-Z]{2}\w+$", v):
            return {"score": 85, "level": "high", "reason": "EU USt-IdNr"}
        return {"score": 50, "level": "medium", "reason": "Format nicht erkannt"}

    def _score_iban(self, value) -> Dict:
        v = re.sub(r"\s+", "", str(value)).upper()
        if re.match(r"^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$", v):
            return {"score": 95, "level": "high", "reason": "Gueltiges IBAN-Format"}
        return {"score": 40, "level": "low", "reason": "Ungueltiges IBAN-Format"}

    def _score_bic(self, value) -> Dict:
        v = str(value).strip().upper()
        if re.match(r"^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$", v):
            return {"score": 95, "level": "high", "reason": "Gueltiges BIC-Format"}
        return {"score": 40, "level": "low", "reason": "Ungueltiges BIC-Format"}

    def _score_amount(self, value) -> Dict:
        try:
            v = float(value)
            if v > 0:
                return {"score": 90, "level": "high", "reason": "Positiver Betrag"}
            if v == 0:
                return {"score": 60, "level": "low", "reason": "Betrag ist 0"}
            return {"score": 50, "level": "medium", "reason": "Negativer Betrag"}
        except (TypeError, ValueError):
            return {"score": 20, "level": "low", "reason": "Keine Zahl"}

    def _score_tax_rate(self, value) -> Dict:
        try:
            v = float(value)
            if v in (19.0, 7.0, 0.0):
                return {"score": 98, "level": "high", "reason": f"Standard-MwSt-Satz {v}%"}
            if 0 <= v <= 25:
                return {"score": 80, "level": "high", "reason": f"Plausibler Steuersatz {v}%"}
            return {"score": 40, "level": "low", "reason": f"Ungewoehnlicher Steuersatz {v}%"}
        except (TypeError, ValueError):
            return {"score": 20, "level": "low", "reason": "Kein gueltiger Steuersatz"}

    def _score_name(self, value) -> Dict:
        v = str(value).strip()
        if len(v) >= 3:
            return {"score": 90, "level": "high", "reason": "Name vorhanden"}
        return {"score": 50, "level": "medium", "reason": "Name zu kurz"}

    def _score_address(self, value) -> Dict:
        v = str(value).strip()
        if len(v) >= 10 and re.search(r"\d{5}", v):
            return {"score": 95, "level": "high", "reason": "Adresse mit PLZ"}
        if len(v) >= 10:
            return {"score": 75, "level": "medium", "reason": "Adresse ohne PLZ"}
        return {"score": 40, "level": "low", "reason": "Adresse unvollstaendig"}

    def _score_line_items(self, value) -> Dict:
        if isinstance(value, list) and len(value) > 0:
            valid_items = sum(
                1 for item in value
                if isinstance(item, dict) and item.get("description")
            )
            if valid_items == len(value):
                return {"score": 95, "level": "high", "reason": f"{valid_items} Positionen"}
            return {"score": 70, "level": "medium", "reason": f"{valid_items}/{len(value)} gueltig"}
        return {"score": 30, "level": "low", "reason": "Keine Positionen"}

    def _score_generic(self, value) -> Dict:
        if value is not None and str(value).strip():
            return {"score": 80, "level": "high", "reason": "Wert vorhanden"}
        return {"score": 0, "level": "low", "reason": "Leer"}

    def _run_consistency_checks(self, fields: Dict) -> List[Dict]:
        """Run mathematical and logical consistency checks."""
        checks = []

        # Check: net + tax = gross
        try:
            net = float(fields.get("net_amount", 0) or 0)
            tax = float(fields.get("tax_amount", 0) or 0)
            gross = float(fields.get("gross_amount", 0) or 0)

            if net > 0 and tax >= 0 and gross > 0:
                expected_gross = round(net + tax, 2)
                diff = abs(gross - expected_gross)
                checks.append({
                    "check": "Netto + MwSt = Brutto",
                    "passed": diff <= 0.02,
                    "detail": f"{net:.2f} + {tax:.2f} = {expected_gross:.2f} (erwartet: {gross:.2f}, Diff: {diff:.2f})",
                })
        except (TypeError, ValueError):
            checks.append({
                "check": "Netto + MwSt = Brutto",
                "passed": False,
                "detail": "Betraege nicht numerisch",
            })

        # Check: tax = net * tax_rate / 100
        try:
            net = float(fields.get("net_amount", 0) or 0)
            tax = float(fields.get("tax_amount", 0) or 0)
            rate = float(fields.get("tax_rate", 19) or 19)

            if net > 0 and rate > 0:
                expected_tax = round(net * rate / 100, 2)
                diff = abs(tax - expected_tax)
                checks.append({
                    "check": "MwSt = Netto * Steuersatz",
                    "passed": diff <= 0.02,
                    "detail": f"{net:.2f} * {rate}% = {expected_tax:.2f} (erwartet: {tax:.2f}, Diff: {diff:.2f})",
                })
        except (TypeError, ValueError):
            pass

        # Check: line items sum = net amount
        line_items = fields.get("line_items")
        if isinstance(line_items, list) and len(line_items) > 0:
            try:
                net = float(fields.get("net_amount", 0) or 0)
                items_sum = sum(
                    float(item.get("net_amount", 0) or item.get("quantity", 1) * item.get("unit_price", 0))
                    for item in line_items
                    if isinstance(item, dict)
                )
                diff = abs(net - round(items_sum, 2))
                checks.append({
                    "check": "Summe Positionen = Nettobetrag",
                    "passed": diff <= 0.05,
                    "detail": f"Positionen: {items_sum:.2f}, Netto: {net:.2f}, Diff: {diff:.2f}",
                })
            except (TypeError, ValueError):
                pass

        return checks

    def _apply_consistency_adjustments(
        self, field_confs: Dict, checks: List[Dict]
    ) -> Dict:
        """Adjust amount confidences based on consistency check results."""
        amount_fields = ["net_amount", "tax_amount", "gross_amount"]
        all_passed = all(c["passed"] for c in checks) if checks else False

        for f in amount_fields:
            if f in field_confs:
                if all_passed:
                    # Boost confidence when everything is consistent
                    field_confs[f]["score"] = min(100, field_confs[f]["score"] + 5)
                    if field_confs[f]["score"] >= 90:
                        field_confs[f]["level"] = "high"
                else:
                    # Penalize when inconsistent
                    field_confs[f]["score"] = max(0, field_confs[f]["score"] - 15)
                    if field_confs[f]["score"] < 70:
                        field_confs[f]["level"] = "low"
                    elif field_confs[f]["score"] < 90:
                        field_confs[f]["level"] = "medium"

        return field_confs
