"""
Tests for the OCR pipeline components.

External dependencies (PaddleOCR, Ollama) are mocked — these tests verify
the pipeline orchestration, confidence scoring, and batch processing logic.
"""
import pytest
from unittest.mock import patch, MagicMock
from app.ocr.confidence import ConfidenceScorer
from app.ocr.batch_processor import BatchProcessor


class TestConfidenceScorer:
    """Tests for per-field confidence scoring."""

    @pytest.fixture()
    def scorer(self):
        return ConfidenceScorer()

    def test_complete_fields_high_score(self, scorer):
        fields = {
            "invoice_number": "RE-2026-001",
            "invoice_date": "2026-02-23",
            "seller_name": "Musterfirma GmbH",
            "seller_vat_id": "DE123456789",
            "seller_address": "Musterstraße 1, 60311 Frankfurt",
            "buyer_name": "Käufer AG",
            "buyer_address": "Hauptstraße 5, 10115 Berlin",
            "net_amount": 1500.0,
            "tax_amount": 285.0,
            "gross_amount": 1785.0,
            "tax_rate": 19.0,
            "iban": "DE89370400440532013000",
        }
        result = scorer.score(fields)
        assert result["completeness"] > 70.0
        assert "field_confidences" in result

    def test_empty_fields_low_score(self, scorer):
        result = scorer.score({})
        assert result["completeness"] == 0.0

    def test_consistency_check_net_tax_gross(self, scorer):
        fields = {
            "net_amount": 1000.0,
            "tax_amount": 190.0,
            "gross_amount": 1190.0,
            "tax_rate": 19.0,
        }
        result = scorer.score(fields)
        # All consistency checks should pass
        checks = result.get("consistency_checks", [])
        passed = [c for c in checks if c.get("passed")]
        assert len(passed) > 0

    def test_inconsistent_amounts_detected(self, scorer):
        fields = {
            "net_amount": 1000.0,
            "tax_amount": 190.0,
            "gross_amount": 5000.0,  # Wrong!
            "tax_rate": 19.0,
        }
        result = scorer.score(fields)
        checks = result.get("consistency_checks", [])
        failed = [c for c in checks if not c.get("passed")]
        assert len(failed) > 0

    def test_iban_format_validation(self, scorer):
        # Valid DE IBAN
        fields = {"iban": "DE89370400440532013000"}
        result = scorer.score(fields)
        iban_score = result["field_confidences"].get("iban", {})
        assert iban_score.get("level") in ("high", "medium")

    def test_vat_id_format_validation(self, scorer):
        fields = {"seller_vat_id": "DE123456789"}
        result = scorer.score(fields)
        vat_score = result["field_confidences"].get("seller_vat_id", {})
        assert vat_score.get("level") in ("high", "medium")


class TestBatchProcessor:
    """Tests for batch processing orchestration."""

    def test_create_batch_job(self):
        processor = BatchProcessor()
        job = processor.create_batch(["invoice1.pdf", "invoice2.pdf"])
        assert job.total_files == 2
        assert job.status == "pending"
        assert len(job.results) == 2

    def test_batch_id_format(self):
        processor = BatchProcessor()
        job = processor.create_batch(["test.pdf"])
        assert job.batch_id.startswith("batch-")

    def test_progress_percent_calculation(self):
        processor = BatchProcessor()
        job = processor.create_batch(["a.pdf", "b.pdf", "c.pdf", "d.pdf"])
        assert job.progress_percent() == 0.0

    @patch("app.ocr.batch_processor.OCRPipelineV2")
    def test_process_batch_tracks_results(self, mock_pipeline_cls):
        """Batch processor should track per-file success/failure."""
        mock_pipeline = MagicMock()
        mock_pipeline.process.return_value = {
            "fields": {"invoice_number": "RE-001"},
            "confidence": 90.0,
            "raw_text": "Sample text",
            "source": "ollama-text",
            "field_confidences": {},
        }
        mock_pipeline_cls.return_value = mock_pipeline

        processor = BatchProcessor()
        processor.pipeline = mock_pipeline
        job = processor.create_batch(["test.pdf"])

        # Create a temp file to simulate
        import tempfile, os
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(b"%PDF-1.4 fake content")
            tmp_path = f.name

        try:
            result_job = processor.process_batch(job.batch_id, [tmp_path])
            assert result_job.processed == 1
            assert result_job.status in ("completed", "partial")
        finally:
            os.unlink(tmp_path)
