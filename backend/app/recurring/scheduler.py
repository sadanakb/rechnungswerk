"""
Recurring invoice scheduler.

Manages recurring invoice templates and generates invoices
on schedule (monthly, quarterly, yearly).
"""
import logging
import uuid
from datetime import datetime, date, timedelta, timezone
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


class RecurringScheduler:
    """Manage recurring invoice templates and scheduling."""

    FREQUENCIES = {"monthly", "quarterly", "half-yearly", "yearly"}

    @staticmethod
    def calculate_next_date(
        last_date: date,
        frequency: str,
    ) -> date:
        """Calculate next invoice date based on frequency."""
        if frequency == "monthly":
            month = last_date.month + 1
            year = last_date.year
            if month > 12:
                month = 1
                year += 1
            day = min(last_date.day, 28)  # Safe for all months
            return date(year, month, day)

        elif frequency == "quarterly":
            month = last_date.month + 3
            year = last_date.year
            while month > 12:
                month -= 12
                year += 1
            day = min(last_date.day, 28)
            return date(year, month, day)

        elif frequency == "half-yearly":
            month = last_date.month + 6
            year = last_date.year
            while month > 12:
                month -= 12
                year += 1
            day = min(last_date.day, 28)
            return date(year, month, day)

        elif frequency == "yearly":
            return date(last_date.year + 1, last_date.month, min(last_date.day, 28))

        raise ValueError(f"Unbekannte Frequenz: {frequency}")

    @staticmethod
    def generate_invoice_data(
        template: Dict,
        invoice_date: date,
    ) -> Dict:
        """
        Generate invoice data from a recurring template.

        Args:
            template: Recurring invoice template with all fields
            invoice_date: Date for the new invoice

        Returns:
            Invoice data dictionary ready for creation
        """
        invoice_number = (
            f"{template.get('number_prefix', 'RE')}-"
            f"{invoice_date.strftime('%Y%m')}-"
            f"{uuid.uuid4().hex[:4].upper()}"
        )

        # Calculate due date
        payment_days = int(template.get("payment_days", 14))
        due_date = invoice_date + timedelta(days=payment_days)

        return {
            "invoice_number": invoice_number,
            "invoice_date": invoice_date.isoformat(),
            "due_date": due_date.isoformat(),
            "seller_name": template.get("seller_name", ""),
            "seller_vat_id": template.get("seller_vat_id", ""),
            "seller_address": template.get("seller_address", ""),
            "buyer_name": template.get("buyer_name", ""),
            "buyer_vat_id": template.get("buyer_vat_id", ""),
            "buyer_address": template.get("buyer_address", ""),
            "line_items": template.get("line_items", []),
            "tax_rate": template.get("tax_rate", 19),
            "iban": template.get("iban"),
            "bic": template.get("bic"),
            "payment_account_name": template.get("payment_account_name"),
            "buyer_reference": template.get("buyer_reference"),
            "seller_endpoint_id": template.get("seller_endpoint_id"),
            "buyer_endpoint_id": template.get("buyer_endpoint_id"),
            "currency": template.get("currency", "EUR"),
        }

    @staticmethod
    def get_due_templates(
        templates: List[Dict],
        check_date: Optional[date] = None,
    ) -> List[Dict]:
        """
        Find templates that are due for invoice generation.

        Args:
            templates: List of recurring invoice templates
            check_date: Date to check against (defaults to today)

        Returns:
            List of templates that need invoice generation
        """
        if check_date is None:
            check_date = date.today()

        due = []
        for tmpl in templates:
            if not tmpl.get("active", True):
                continue

            next_date_str = tmpl.get("next_date")
            if not next_date_str:
                continue

            try:
                next_date = date.fromisoformat(str(next_date_str))
            except (ValueError, TypeError):
                continue

            if next_date <= check_date:
                due.append(tmpl)

        return due
