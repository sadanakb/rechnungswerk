"""Tests for AI service — hybrid API routing."""
import pytest
from unittest.mock import patch, MagicMock

from app.ai_service import categorize_invoice, AiProvider


class TestCategorizeInvoice:
    @patch("app.ai_service._call_anthropic")
    def test_categorize_with_claude(self, mock_claude):
        mock_claude.return_value = {"skr03_account": "4400", "category": "Buerokosten"}
        result = categorize_invoice(
            seller_name="Staples",
            description="Bueroartikel",
            amount=59.99,
            provider=AiProvider.ANTHROPIC,
        )
        assert result["skr03_account"] == "4400"

    @patch("app.ai_service._call_ollama")
    def test_fallback_to_ollama(self, mock_ollama):
        mock_ollama.return_value = {"skr03_account": "4400", "category": "Buerokosten"}
        result = categorize_invoice(
            seller_name="Staples",
            description="Bueroartikel",
            amount=59.99,
            provider=AiProvider.OLLAMA,
        )
        assert "skr03_account" in result
