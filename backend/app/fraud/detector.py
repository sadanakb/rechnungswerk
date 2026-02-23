"""
Invoice fraud and duplicate detection.

Checks:
- Duplicate invoice numbers from same seller
- IBAN change warnings for known suppliers
- Amount anomaly detection (statistical outliers)
- Unusual tax rates
"""
import logging
from typing import Dict, List, Optional
from sqlalchemy.orm import Session
from app.models import Invoice

logger = logging.getLogger(__name__)


class FraudDetector:
    """Detect potential invoice fraud and duplicates."""

    def check(self, invoice_data: Dict, db: Session) -> Dict:
        """
        Run all fraud checks on invoice data.

        Returns:
            {
                "risk_level": "low" | "medium" | "high",
                "alerts": [{"type": str, "severity": str, "message": str}],
            }
        """
        alerts: List[Dict] = []

        alerts.extend(self._check_duplicate(invoice_data, db))
        alerts.extend(self._check_iban_change(invoice_data, db))
        alerts.extend(self._check_amount_anomaly(invoice_data, db))
        alerts.extend(self._check_unusual_tax_rate(invoice_data))

        # Determine overall risk level
        severities = [a["severity"] for a in alerts]
        if "high" in severities:
            risk_level = "high"
        elif "medium" in severities:
            risk_level = "medium"
        else:
            risk_level = "low"

        return {"risk_level": risk_level, "alerts": alerts}

    def _check_duplicate(self, data: Dict, db: Session) -> List[Dict]:
        """Check for duplicate invoice numbers from same seller."""
        alerts = []
        inv_num = data.get("invoice_number")
        seller = data.get("seller_name") or data.get("seller_vat_id")

        if not inv_num or not seller:
            return alerts

        # Check by invoice number + seller
        existing = db.query(Invoice).filter(
            Invoice.invoice_number == inv_num,
        ).first()

        if existing:
            # Check if same seller
            if (existing.seller_name == data.get("seller_name") or
                existing.seller_vat_id == data.get("seller_vat_id")):
                alerts.append({
                    "type": "duplicate",
                    "severity": "high",
                    "message": (
                        f"Duplikat: Rechnungsnummer '{inv_num}' existiert bereits "
                        f"vom selben Verkaeufer (ID: {existing.invoice_id})"
                    ),
                })
            else:
                alerts.append({
                    "type": "duplicate_number",
                    "severity": "medium",
                    "message": (
                        f"Rechnungsnummer '{inv_num}' existiert bereits "
                        f"von anderem Verkaeufer"
                    ),
                })

        return alerts

    def _check_iban_change(self, data: Dict, db: Session) -> List[Dict]:
        """Warn if IBAN differs from previous invoices of same seller."""
        alerts = []
        new_iban = data.get("iban")
        seller_vat = data.get("seller_vat_id")

        if not new_iban or not seller_vat:
            return alerts

        # Find previous invoices from same seller with IBAN
        previous = db.query(Invoice).filter(
            Invoice.seller_vat_id == seller_vat,
            Invoice.iban.isnot(None),
            Invoice.iban != "",
        ).order_by(Invoice.created_at.desc()).first()

        if previous and previous.iban and previous.iban != new_iban:
            alerts.append({
                "type": "iban_change",
                "severity": "high",
                "message": (
                    f"IBAN-Aenderung erkannt fuer {seller_vat}: "
                    f"Bisherige IBAN: {previous.iban}, "
                    f"Neue IBAN: {new_iban}. "
                    f"Bitte manuell pruefen!"
                ),
            })

        return alerts

    def _check_amount_anomaly(self, data: Dict, db: Session) -> List[Dict]:
        """Detect statistical outliers in invoice amounts."""
        alerts = []
        new_gross = float(data.get("gross_amount", 0))
        seller_vat = data.get("seller_vat_id")

        if not new_gross or not seller_vat:
            return alerts

        # Get historical amounts from same seller
        historical = db.query(Invoice.gross_amount).filter(
            Invoice.seller_vat_id == seller_vat,
            Invoice.gross_amount.isnot(None),
        ).all()

        if len(historical) < 3:
            return alerts  # Not enough data

        amounts = [float(h[0]) for h in historical if h[0]]
        if not amounts:
            return alerts

        avg = sum(amounts) / len(amounts)
        if avg == 0:
            return alerts

        # Check if new amount deviates more than 3x from average
        ratio = new_gross / avg
        if ratio > 3.0:
            alerts.append({
                "type": "amount_anomaly",
                "severity": "medium",
                "message": (
                    f"Betrag ({new_gross:.2f} EUR) ist {ratio:.1f}x hoeher "
                    f"als der Durchschnitt ({avg:.2f} EUR) "
                    f"fuer diesen Lieferanten"
                ),
            })
        elif ratio < 0.1:
            alerts.append({
                "type": "amount_anomaly",
                "severity": "medium",
                "message": (
                    f"Betrag ({new_gross:.2f} EUR) ist ungewoehnlich niedrig "
                    f"(Durchschnitt: {avg:.2f} EUR)"
                ),
            })

        return alerts

    def _check_unusual_tax_rate(self, data: Dict) -> List[Dict]:
        """Flag unusual tax rates."""
        alerts = []
        tax_rate = float(data.get("tax_rate", 19))

        valid_rates = {0, 7, 19}
        if tax_rate not in valid_rates:
            alerts.append({
                "type": "unusual_tax_rate",
                "severity": "medium",
                "message": (
                    f"Ungewoehnlicher MwSt-Satz: {tax_rate}%. "
                    f"In Deutschland gelten 0%, 7% oder 19%."
                ),
            })

        return alerts
