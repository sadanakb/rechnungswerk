"""Tests for recurring invoice ARQ cron job (Task 4)."""
import pytest
from unittest.mock import MagicMock, patch
from datetime import date


class TestRecurringCron:

    @pytest.mark.asyncio
    async def test_due_template_generates_invoice(self):
        """A template with next_date <= today should generate an invoice."""
        from app.tasks.worker import daily_recurring_check

        mock_template = MagicMock()
        mock_template.template_id = "tmpl-001"
        mock_template.active = True
        mock_template.frequency = "monthly"
        mock_template.next_date = date(2026, 1, 1)  # Past date — due
        mock_template.number_prefix = "RE"
        mock_template.payment_days = 14
        mock_template.seller_name = "ACME GmbH"
        mock_template.seller_vat_id = "DE123456789"
        mock_template.seller_address = "Musterstr. 1, 12345 Berlin"
        mock_template.buyer_name = "Kunde GmbH"
        mock_template.buyer_vat_id = None
        mock_template.buyer_address = "Kundenstr. 2"
        mock_template.line_items = [{"description": "Service", "quantity": 1, "unit_price": 100.0}]
        mock_template.tax_rate = 19.0
        mock_template.iban = None
        mock_template.bic = None
        mock_template.payment_account_name = None

        ctx = {}
        with patch("app.database.SessionLocal") as mock_session_cls:
            mock_db = MagicMock()
            mock_session_cls.return_value = mock_db
            mock_db.query.return_value.filter.return_value.all.return_value = [mock_template]

            result = await daily_recurring_check(ctx)

        assert result["generated"] == 1
        mock_db.add.assert_called_once()  # Invoice was added
        mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_future_template_not_generated(self):
        """A template with next_date in the future should NOT generate an invoice."""
        from app.tasks.worker import daily_recurring_check

        future_date = date(2099, 12, 31)
        mock_template = MagicMock()
        mock_template.template_id = "tmpl-future"
        mock_template.active = True
        mock_template.frequency = "monthly"
        mock_template.next_date = future_date
        mock_template.number_prefix = "RE"
        mock_template.payment_days = 14
        mock_template.seller_name = "Future Corp"
        mock_template.seller_vat_id = None
        mock_template.seller_address = None
        mock_template.buyer_name = "Buyer"
        mock_template.buyer_vat_id = None
        mock_template.buyer_address = None
        mock_template.line_items = []
        mock_template.tax_rate = 19.0
        mock_template.iban = None
        mock_template.bic = None
        mock_template.payment_account_name = None

        ctx = {}
        with patch("app.database.SessionLocal") as mock_session_cls:
            mock_db = MagicMock()
            mock_session_cls.return_value = mock_db
            mock_db.query.return_value.filter.return_value.all.return_value = [mock_template]

            result = await daily_recurring_check(ctx)

        assert result["generated"] == 0
        mock_db.add.assert_not_called()

    @pytest.mark.asyncio
    async def test_last_generated_updated_after_generation(self):
        """After generating an invoice, last_generated and next_date should be updated."""
        from app.tasks.worker import daily_recurring_check

        mock_template = MagicMock()
        mock_template.template_id = "tmpl-update"
        mock_template.active = True
        mock_template.frequency = "monthly"
        mock_template.next_date = date(2026, 1, 1)
        mock_template.number_prefix = "RE"
        mock_template.payment_days = 14
        mock_template.seller_name = "Test GmbH"
        mock_template.seller_vat_id = None
        mock_template.seller_address = None
        mock_template.buyer_name = "Kunde"
        mock_template.buyer_vat_id = None
        mock_template.buyer_address = None
        mock_template.line_items = [{"description": "X", "quantity": 1, "unit_price": 50.0}]
        mock_template.tax_rate = 19.0
        mock_template.iban = None
        mock_template.bic = None
        mock_template.payment_account_name = None

        ctx = {}
        with patch("app.database.SessionLocal") as mock_session_cls:
            mock_db = MagicMock()
            mock_session_cls.return_value = mock_db
            mock_db.query.return_value.filter.return_value.all.return_value = [mock_template]

            await daily_recurring_check(ctx)

        # last_generated should be set to today
        assert mock_template.last_generated == date.today()
        # next_date should be updated (not still 2026-01-01)
        assert mock_template.next_date != date(2026, 1, 1)
