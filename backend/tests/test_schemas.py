"""
Tests for Pydantic schema validation.

Verifies:
- IBAN/BIC format validation
- Line item constraints
- Default values
- Error messages in German
"""
import pytest
from pydantic import ValidationError
from app.schemas import InvoiceCreate, LineItem, OCRResult, BatchJobResponse


class TestLineItem:
    """Line item schema tests."""

    def test_valid_line_item(self):
        item = LineItem(
            description="Dienstleistung",
            quantity=5.0,
            unit_price=100.0,
            net_amount=500.0,
        )
        assert item.tax_rate == 19.0  # Default

    def test_zero_quantity_rejected(self):
        with pytest.raises(ValidationError):
            LineItem(description="X", quantity=0, unit_price=10, net_amount=0)

    def test_negative_quantity_rejected(self):
        with pytest.raises(ValidationError):
            LineItem(description="X", quantity=-1, unit_price=10, net_amount=-10)


class TestInvoiceCreate:
    """Invoice creation schema tests."""

    def test_valid_invoice(self, sample_invoice_data):
        inv = InvoiceCreate(**sample_invoice_data)
        assert inv.invoice_number == "RE-2026-001"
        assert inv.currency == "EUR"

    def test_default_currency(self, sample_invoice_data):
        del sample_invoice_data["currency"]
        inv = InvoiceCreate(**sample_invoice_data)
        assert inv.currency == "EUR"

    def test_custom_currency(self, sample_invoice_data):
        sample_invoice_data["currency"] = "USD"
        inv = InvoiceCreate(**sample_invoice_data)
        assert inv.currency == "USD"

    def test_valid_iban_cleaned(self, sample_invoice_data):
        sample_invoice_data["iban"] = "de89 3704 0044 0532 0130 00"
        inv = InvoiceCreate(**sample_invoice_data)
        assert inv.iban == "DE89370400440532013000"

    def test_invalid_iban_raises(self, sample_invoice_data):
        sample_invoice_data["iban"] = "INVALID"
        with pytest.raises(ValidationError, match="IBAN"):
            InvoiceCreate(**sample_invoice_data)

    def test_empty_iban_becomes_none(self, sample_invoice_data):
        sample_invoice_data["iban"] = "  "
        inv = InvoiceCreate(**sample_invoice_data)
        assert inv.iban is None

    def test_valid_bic(self, sample_invoice_data):
        sample_invoice_data["bic"] = "cobadeffxxx"
        inv = InvoiceCreate(**sample_invoice_data)
        assert inv.bic == "COBADEFFXXX"

    def test_invalid_bic_raises(self, sample_invoice_data):
        sample_invoice_data["bic"] = "123"
        with pytest.raises(ValidationError, match="BIC"):
            InvoiceCreate(**sample_invoice_data)

    def test_empty_bic_becomes_none(self, sample_invoice_data):
        sample_invoice_data["bic"] = ""
        inv = InvoiceCreate(**sample_invoice_data)
        assert inv.bic is None

    def test_missing_required_field_raises(self, sample_invoice_data):
        del sample_invoice_data["invoice_number"]
        with pytest.raises(ValidationError):
            InvoiceCreate(**sample_invoice_data)


class TestOCRResult:
    """OCR result schema tests."""

    def test_minimal_result(self):
        result = OCRResult(
            invoice_id="INV-20260223-abc12345",
            extracted_text="Test text",
            confidence=85.5,
            fields={"invoice_number": "RE-001"},
            suggestions={},
        )
        assert result.field_confidences == {}
        assert result.consistency_checks == []
        assert result.completeness == 0.0

    def test_full_result(self):
        result = OCRResult(
            invoice_id="INV-20260223-abc12345",
            extracted_text="Full text",
            confidence=95.0,
            fields={"invoice_number": "RE-001"},
            suggestions={"invoice_number": "RE-001"},
            field_confidences={"invoice_number": {"score": 0.95, "level": "high"}},
            consistency_checks=[{"check": "net+tax=gross", "passed": True}],
            completeness=85.0,
            source="ollama-text",
            total_pages=3,
            ocr_engine="paddleocr",
        )
        assert result.total_pages == 3
        assert result.ocr_engine == "paddleocr"


class TestBatchJobResponse:
    """Batch processing schema tests."""

    def test_empty_batch(self):
        batch = BatchJobResponse(
            batch_id="batch-abc123",
            total_files=0,
            processed=0,
            succeeded=0,
            failed=0,
            status="pending",
            progress_percent=0.0,
            results=[],
            created_at="2026-02-23T10:00:00",
        )
        assert batch.completed_at is None
