"""Tests for forgot-password and reset-password endpoints."""
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import Base
from app.database import get_db
from app.config import settings


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture
def client(db_session):
    def _override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    with patch.object(settings, "require_api_key", True):
        with TestClient(app) as c:
            yield c
    app.dependency_overrides.clear()


def _register_user(client, email="reset@test.de"):
    """Helper to register a test user."""
    resp = client.post("/api/auth/register", json={
        "email": email,
        "password": "SecurePass123!",
        "full_name": "Test User",
        "organization_name": "Test Org",
    })
    assert resp.status_code == 201
    return resp.json()


class TestForgotPassword:
    @patch("app.email_service.send_password_reset_email", return_value=True)
    def test_forgot_password_returns_200(self, mock_send, client):
        _register_user(client)
        resp = client.post("/api/auth/forgot-password", json={
            "email": "reset@test.de",
        })
        assert resp.status_code == 200
        assert "Link gesendet" in resp.json()["message"]
        mock_send.assert_called_once()
        # Verify the email and URL were passed correctly
        call_args = mock_send.call_args
        assert call_args[0][0] == "reset@test.de"
        assert "passwort-zuruecksetzen?token=" in call_args[0][1]

    @patch("app.email_service.send_password_reset_email", return_value=True)
    def test_forgot_password_unknown_email_returns_200(self, mock_send, client):
        """Must return 200 even for unknown email — prevents email enumeration."""
        resp = client.post("/api/auth/forgot-password", json={
            "email": "nobody@example.com",
        })
        assert resp.status_code == 200
        assert "Link gesendet" in resp.json()["message"]
        # Email service should NOT have been called
        mock_send.assert_not_called()


class TestResetPassword:
    @patch("app.email_service.send_password_reset_email", return_value=True)
    def test_reset_password_valid_token(self, mock_send, client):
        _register_user(client)

        # Request password reset
        client.post("/api/auth/forgot-password", json={
            "email": "reset@test.de",
        })

        # Extract the token from the mock call
        call_args = mock_send.call_args
        reset_url = call_args[0][1]
        token = reset_url.split("token=")[1]

        # Reset the password
        resp = client.post("/api/auth/reset-password", json={
            "token": token,
            "new_password": "NewSecurePass456!",
        })
        assert resp.status_code == 200
        assert "erfolgreich" in resp.json()["message"]

        # Verify login works with new password
        login_resp = client.post("/api/auth/login", json={
            "email": "reset@test.de",
            "password": "NewSecurePass456!",
        })
        assert login_resp.status_code == 200
        assert "access_token" in login_resp.json()

        # Verify old password no longer works
        old_login = client.post("/api/auth/login", json={
            "email": "reset@test.de",
            "password": "SecurePass123!",
        })
        assert old_login.status_code == 401

    @patch("app.email_service.send_password_reset_email", return_value=True)
    def test_reset_password_expired_token_rejected(self, mock_send, client, db_session):
        from datetime import datetime, timedelta, timezone
        from app.models import User

        _register_user(client)

        # Request password reset
        client.post("/api/auth/forgot-password", json={
            "email": "reset@test.de",
        })

        # Extract token
        call_args = mock_send.call_args
        reset_url = call_args[0][1]
        token = reset_url.split("token=")[1]

        # Manually expire the token
        user = db_session.query(User).filter(User.email == "reset@test.de").first()
        user.password_reset_expires = datetime.now(timezone.utc) - timedelta(hours=2)
        db_session.commit()

        # Try to reset — should fail
        resp = client.post("/api/auth/reset-password", json={
            "token": token,
            "new_password": "NewSecurePass456!",
        })
        assert resp.status_code == 400
        assert "ungueltig oder abgelaufen" in resp.json()["detail"]

    def test_reset_password_invalid_token_rejected(self, client):
        resp = client.post("/api/auth/reset-password", json={
            "token": "completely-invalid-token-value",
            "new_password": "NewSecurePass456!",
        })
        assert resp.status_code == 400
        assert "ungueltig oder abgelaufen" in resp.json()["detail"]
