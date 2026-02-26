"""Tests for auth endpoints: register, login, me."""
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
