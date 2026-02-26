"""Tests for newsletter subscription."""
import pytest
from unittest.mock import patch, MagicMock


class TestNewsletterSubscribe:
    @patch("app.brevo_service.add_contact")
    def test_subscribe_success(self, mock_add, client):
        mock_add.return_value = True
        resp = client.post(
            "/api/newsletter/subscribe",
            json={"email": "test@example.com"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "subscribed"
        assert data["email"] == "test@example.com"
        mock_add.assert_called_once_with("test@example.com")

    def test_subscribe_invalid_email(self, client):
        resp = client.post(
            "/api/newsletter/subscribe",
            json={"email": "not-an-email"},
        )
        assert resp.status_code == 422

    @patch("app.brevo_service.add_contact")
    def test_subscribe_brevo_failure(self, mock_add, client):
        mock_add.return_value = False
        resp = client.post(
            "/api/newsletter/subscribe",
            json={"email": "fail@example.com"},
        )
        assert resp.status_code == 500
