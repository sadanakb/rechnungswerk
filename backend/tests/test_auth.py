"""Tests for auth endpoints: register, login, me."""
import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from fastapi.testclient import TestClient
import httpx
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
    # Ensure JWT auth is active (not dev mode) by patching the settings object
    with patch.object(settings, "require_api_key", True):
        with TestClient(app) as c:
            yield c
    app.dependency_overrides.clear()


class TestRegister:
    def test_register_success(self, client):
        resp = client.post("/api/auth/register", json={
            "email": "test@example.com",
            "password": "SecurePass123!",
            "full_name": "Max Mustermann",
            "organization_name": "Test GmbH",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["user"]["email"] == "test@example.com"
        assert data["user"]["full_name"] == "Max Mustermann"
        assert data["organization"]["name"] == "Test GmbH"
        assert data["organization"]["slug"] == "test-gmbh"
        assert data["organization"]["plan"] == "free"
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    def test_register_duplicate_email(self, client):
        payload = {
            "email": "dup@example.com",
            "password": "SecurePass123!",
            "full_name": "Test",
            "organization_name": "Org",
        }
        resp1 = client.post("/api/auth/register", json=payload)
        assert resp1.status_code == 201
        resp2 = client.post("/api/auth/register", json=payload)
        assert resp2.status_code == 409
        assert "bereits registriert" in resp2.json()["detail"]

    def test_register_weak_password_too_short(self, client):
        resp = client.post("/api/auth/register", json={
            "email": "test@example.com",
            "password": "123",
            "full_name": "Test",
            "organization_name": "Org",
        })
        assert resp.status_code == 422

    def test_register_weak_password_no_uppercase(self, client):
        resp = client.post("/api/auth/register", json={
            "email": "test@example.com",
            "password": "securepass123",
            "full_name": "Test",
            "organization_name": "Org",
        })
        assert resp.status_code == 422

    def test_register_weak_password_no_number(self, client):
        resp = client.post("/api/auth/register", json={
            "email": "test@example.com",
            "password": "SecurePass",
            "full_name": "Test",
            "organization_name": "Org",
        })
        assert resp.status_code == 422


class TestLogin:
    def test_login_success(self, client):
        # Register first
        client.post("/api/auth/register", json={
            "email": "login@test.de",
            "password": "SecurePass123!",
            "full_name": "Test",
            "organization_name": "Org",
        })
        # Login
        resp = client.post("/api/auth/login", json={
            "email": "login@test.de",
            "password": "SecurePass123!",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    def test_login_wrong_password(self, client):
        client.post("/api/auth/register", json={
            "email": "wrong@test.de",
            "password": "SecurePass123!",
            "full_name": "Test",
            "organization_name": "Org",
        })
        resp = client.post("/api/auth/login", json={
            "email": "wrong@test.de",
            "password": "WrongPassword1",
        })
        assert resp.status_code == 401
        assert "Ungueltige" in resp.json()["detail"]

    def test_login_nonexistent_user(self, client):
        resp = client.post("/api/auth/login", json={
            "email": "nobody@test.de",
            "password": "SomePass123!",
        })
        assert resp.status_code == 401


class TestMe:
    def test_get_current_user(self, client):
        # Register
        reg = client.post("/api/auth/register", json={
            "email": "me@test.de",
            "password": "SecurePass123!",
            "full_name": "Max",
            "organization_name": "Org",
        })
        assert reg.status_code == 201
        token = reg.json()["access_token"]

        resp = client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "me@test.de"
        assert data["full_name"] == "Max"
        assert data["organization"]["name"] == "Org"
        assert data["role"] == "owner"

    def test_me_without_token(self, client):
        resp = client.get("/api/auth/me")
        assert resp.status_code == 401


class TestGoogleOAuth:
    def test_google_callback_creates_user(self, client, db_session):
        """Google callback with mocked Google response creates user + JWT."""
        from jose import jwt as jose_jwt
        from app.config import settings as app_settings

        # Create a valid state token
        state_token = jose_jwt.encode(
            {"state": "test-state", "exp": datetime.now(timezone.utc) + timedelta(minutes=10)},
            app_settings.jwt_secret_key or "dev-secret",
            algorithm="HS256",
        )

        # Mock Google's token + userinfo responses
        mock_token_response = httpx.Response(200, json={
            "access_token": "mock-google-access-token",
            "token_type": "Bearer",
        })
        mock_userinfo_response = httpx.Response(200, json={
            "email": "google@test.de",
            "name": "Google User",
            "email_verified": True,
        })

        with patch.object(app_settings, "google_client_id", "test-client-id"), \
             patch.object(app_settings, "google_client_secret", "test-secret"), \
             patch("httpx.Client") as mock_client_class:
            mock_http = mock_client_class.return_value.__enter__.return_value
            mock_http.post.return_value = mock_token_response
            mock_http.get.return_value = mock_userinfo_response

            resp = client.get(
                "/api/auth/google/callback",
                params={"code": "test-auth-code", "state": state_token},
                follow_redirects=False,
            )

        # Should redirect with tokens
        assert resp.status_code == 302
        location = resp.headers["location"]
        assert "access_token=" in location
        assert "refresh_token=" in location

        # User should exist in DB
        from app.models import User
        user = db_session.query(User).filter(User.email == "google@test.de").first()
        assert user is not None
        assert user.full_name == "Google User"
        assert user.is_verified is True

    def test_google_callback_links_existing_account(self, client, db_session):
        """Google login with existing email links to existing account."""
        from jose import jwt as jose_jwt
        from app.config import settings as app_settings

        # First register a user with email/password
        client.post("/api/auth/register", json={
            "email": "existing@test.de",
            "password": "SecurePass123!",
            "full_name": "Existing User",
            "organization_name": "Existing Org",
        })

        state_token = jose_jwt.encode(
            {"state": "test-state", "exp": datetime.now(timezone.utc) + timedelta(minutes=10)},
            app_settings.jwt_secret_key or "dev-secret",
            algorithm="HS256",
        )

        mock_token_response = httpx.Response(200, json={
            "access_token": "mock-google-access-token",
            "token_type": "Bearer",
        })
        mock_userinfo_response = httpx.Response(200, json={
            "email": "existing@test.de",
            "name": "Existing User",
            "email_verified": True,
        })

        with patch.object(app_settings, "google_client_id", "test-client-id"), \
             patch.object(app_settings, "google_client_secret", "test-secret"), \
             patch("httpx.Client") as mock_client_class:
            mock_http = mock_client_class.return_value.__enter__.return_value
            mock_http.post.return_value = mock_token_response
            mock_http.get.return_value = mock_userinfo_response

            resp = client.get(
                "/api/auth/google/callback",
                params={"code": "test-auth-code", "state": state_token},
                follow_redirects=False,
            )

        assert resp.status_code == 302

        # Should still be only 1 user with this email (not duplicated)
        from app.models import User
        users = db_session.query(User).filter(User.email == "existing@test.de").all()
        assert len(users) == 1
        assert users[0].is_verified is True  # Should be verified now

    def test_google_login_not_configured(self, client):
        """GET /api/auth/google returns 404 when not configured."""
        from app.config import settings as app_settings
        with patch.object(app_settings, "google_client_id", ""):
            resp = client.get("/api/auth/google")
        assert resp.status_code == 404
