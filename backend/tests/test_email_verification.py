"""Tests for email verification endpoints."""
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import Base, User
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


def _register_user(client, email="verify@test.de"):
    """Helper to register a test user."""
    resp = client.post("/api/auth/register", json={
        "email": email,
        "password": "SecurePass123!",
        "full_name": "Test User",
        "organization_name": "Test Org",
    })
    assert resp.status_code == 201
    return resp.json()


class TestRegisterSendsVerification:
    @patch("app.email_service.send_email_verification", return_value=True)
    def test_register_sends_verification_email(self, mock_send, client):
        """Registration should auto-send a verification email."""
        _register_user(client)
        mock_send.assert_called_once()
        # Verify the email and URL were passed correctly
        call_args = mock_send.call_args
        assert call_args[0][0] == "verify@test.de"
        assert "email-verifizieren?token=" in call_args[0][1]


class TestVerifyEmail:
    @patch("app.email_service.send_email_verification", return_value=True)
    def test_verify_email_valid_token(self, mock_send, client, db_session):
        """A valid verification token should set is_verified=True."""
        _register_user(client)

        # Extract the token from the mock call
        call_args = mock_send.call_args
        verification_url = call_args[0][1]
        token = verification_url.split("token=")[1]

        # Verify email
        resp = client.post("/api/auth/verify-email", json={
            "token": token,
        })
        assert resp.status_code == 200
        assert "erfolgreich" in resp.json()["message"]

        # Check that user is now verified in DB
        user = db_session.query(User).filter(User.email == "verify@test.de").first()
        assert user.is_verified is True
        assert user.email_verification_token is None

    def test_verify_email_invalid_token(self, client):
        """An invalid token should return 400."""
        resp = client.post("/api/auth/verify-email", json={
            "token": "completely-invalid-token-value",
        })
        assert resp.status_code == 400
        assert "ungueltig oder abgelaufen" in resp.json()["detail"]

    @patch("app.email_service.send_email_verification", return_value=True)
    def test_resend_verification(self, mock_send, client, db_session):
        """An authenticated user can request a new verification token."""
        reg_data = _register_user(client)
        access_token = reg_data["access_token"]

        # First call was from registration
        assert mock_send.call_count == 1

        # Request resend
        resp = client.post(
            "/api/auth/send-verification-email",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert resp.status_code == 200
        assert "gesendet" in resp.json()["message"]

        # Email service should have been called again
        assert mock_send.call_count == 2

        # Extract the NEW token and verify it works
        call_args = mock_send.call_args
        verification_url = call_args[0][1]
        new_token = verification_url.split("token=")[1]

        verify_resp = client.post("/api/auth/verify-email", json={
            "token": new_token,
        })
        assert verify_resp.status_code == 200

        # User should now be verified
        user = db_session.query(User).filter(User.email == "verify@test.de").first()
        assert user.is_verified is True
