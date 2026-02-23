"""
Tests for the email inbox router.

IMAP connections are mocked — tests verify API behavior,
request validation, and error handling.
"""
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

VALID_CONFIG = {
    "imap_host": "imap.example.com",
    "imap_port": 993,
    "username": "rechnungen@example.com",
    "password": "secret",
    "folder": "INBOX",
    "use_ssl": True,
    "max_emails": 10,
    "run_ocr": False,  # skip OCR in unit tests
}


class TestEmailRouter:
    def test_status_empty(self):
        """Status endpoint returns friendly message when no scan has run."""
        response = client.get("/api/email/status")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data or "processed" in data

    @patch("app.routers.email.InboxProcessor")
    def test_process_inbox_no_attachments(self, mock_cls):
        """Empty inbox returns zero processed."""
        mock_cls.return_value.fetch_pdf_attachments.return_value = []

        response = client.post("/api/email/process-inbox", json=VALID_CONFIG)
        assert response.status_code == 200
        data = response.json()
        assert data["processed"] == 0
        assert data["attachments_found"] == 0
        assert data["results"] == []

    @patch("app.routers.email.InboxProcessor")
    def test_process_inbox_with_attachment(self, mock_cls):
        """Inbox with one PDF attachment returns correct result."""
        mock_cls.return_value.fetch_pdf_attachments.return_value = [
            {
                "filename": "rechnung_2026.pdf",
                "file_path": "/tmp/rechnung_2026.pdf",
                "sender": "lieferant@beispiel.de",
                "subject": "Rechnung Februar 2026",
                "date": "Mon, 23 Feb 2026 10:00:00 +0100",
                "file_size": 52400,
            }
        ]

        response = client.post("/api/email/process-inbox", json=VALID_CONFIG)
        assert response.status_code == 200
        data = response.json()
        assert data["processed"] == 1
        assert data["attachments_found"] == 1
        assert len(data["results"]) == 1
        assert data["results"][0]["filename"] == "rechnung_2026.pdf"
        assert data["results"][0]["sender"] == "lieferant@beispiel.de"

    @patch("app.routers.email.InboxProcessor")
    def test_process_inbox_imap_error_returns_502(self, mock_cls):
        """IMAP connection failure returns 502."""
        mock_cls.return_value.fetch_pdf_attachments.side_effect = ConnectionError(
            "IMAP-Verbindung fehlgeschlagen"
        )

        response = client.post("/api/email/process-inbox", json=VALID_CONFIG)
        assert response.status_code == 502
        assert "IMAP" in response.json()["detail"]

    def test_process_inbox_missing_host_returns_422(self):
        """Missing required imap_host returns 422 validation error."""
        bad_config = {**VALID_CONFIG}
        del bad_config["imap_host"]
        response = client.post("/api/email/process-inbox", json=bad_config)
        assert response.status_code == 422

    def test_process_inbox_max_emails_too_high_returns_422(self):
        """max_emails > 200 should fail validation."""
        bad_config = {**VALID_CONFIG, "max_emails": 999}
        response = client.post("/api/email/process-inbox", json=bad_config)
        assert response.status_code == 422

    @patch("app.routers.email.InboxProcessor")
    @patch("app.routers.email._run_ocr")
    def test_process_inbox_with_ocr(self, mock_ocr, mock_cls):
        """When run_ocr=True, _run_ocr is called for each attachment."""
        mock_cls.return_value.fetch_pdf_attachments.return_value = [
            {
                "filename": "inv.pdf",
                "file_path": "/tmp/inv.pdf",
                "sender": "s@s.de",
                "subject": "Rechnung",
                "date": "Mon, 23 Feb 2026 10:00:00 +0100",
                "file_size": 10000,
            }
        ]
        mock_ocr.return_value = {"invoice_id": "test-001", "confidence": 87.5}

        config_with_ocr = {**VALID_CONFIG, "run_ocr": True}
        response = client.post("/api/email/process-inbox", json=config_with_ocr)
        assert response.status_code == 200
        data = response.json()
        assert data["ocr_triggered"] == 1
        assert data["results"][0]["ocr_confidence"] == 87.5

    @patch("app.routers.email.InboxProcessor")
    def test_status_after_scan(self, mock_cls):
        """Status endpoint reflects the last scan result."""
        mock_cls.return_value.fetch_pdf_attachments.return_value = []
        client.post("/api/email/process-inbox", json=VALID_CONFIG)

        response = client.get("/api/email/status")
        assert response.status_code == 200
        data = response.json()
        assert "processed" in data
