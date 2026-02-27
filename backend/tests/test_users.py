"""Tests for user profile endpoints: GET /api/users/me, PATCH /api/users/me."""
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


def _register_and_get_token(client: TestClient, email: str = "user@test.de") -> str:
    """Helper: register a user and return the access token."""
    resp = client.post("/api/auth/register", json={
        "email": email,
        "password": "SecurePass123!",
        "full_name": "Max Mustermann",
        "organization_name": "Profile GmbH",
    })
    assert resp.status_code == 201
    return resp.json()["access_token"]


def test_get_profile_returns_user_data(client):
    """GET /api/users/me returns user profile with organization info."""
    token = _register_and_get_token(client)
    resp = client.get(
        "/api/users/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "user@test.de"
    assert data["full_name"] == "Max Mustermann"
    assert data["is_verified"] is False
    assert "created_at" in data
    assert data["organization"]["name"] == "Profile GmbH"
    assert "id" in data["organization"]


def test_update_full_name(client):
    """PATCH /api/users/me updates full_name."""
    token = _register_and_get_token(client, email="name@test.de")
    resp = client.patch(
        "/api/users/me",
        json={"full_name": "Neuer Name"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["full_name"] == "Neuer Name"
    assert data["email"] == "name@test.de"

    # Verify via GET
    get_resp = client.get(
        "/api/users/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert get_resp.status_code == 200
    assert get_resp.json()["full_name"] == "Neuer Name"


def test_change_password_correct_old(client):
    """PATCH /api/users/me changes password when current_password is correct."""
    token = _register_and_get_token(client, email="pwchange@test.de")
    resp = client.patch(
        "/api/users/me",
        json={
            "current_password": "SecurePass123!",
            "new_password": "NewSecure456!",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200

    # Verify old password no longer works
    login_old = client.post("/api/auth/login", json={
        "email": "pwchange@test.de",
        "password": "SecurePass123!",
    })
    assert login_old.status_code == 401

    # Verify new password works
    login_new = client.post("/api/auth/login", json={
        "email": "pwchange@test.de",
        "password": "NewSecure456!",
    })
    assert login_new.status_code == 200
    assert "access_token" in login_new.json()


def test_change_password_wrong_old_rejected(client):
    """PATCH /api/users/me rejects password change when current_password is wrong."""
    token = _register_and_get_token(client, email="pwwrong@test.de")
    resp = client.patch(
        "/api/users/me",
        json={
            "current_password": "WrongPassword1!",
            "new_password": "NewSecure456!",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400
    assert "falsch" in resp.json()["detail"]

    # Verify original password still works
    login_resp = client.post("/api/auth/login", json={
        "email": "pwwrong@test.de",
        "password": "SecurePass123!",
    })
    assert login_resp.status_code == 200


def test_unauthenticated_rejected(client):
    """GET and PATCH /api/users/me reject requests without a token."""
    get_resp = client.get("/api/users/me")
    assert get_resp.status_code == 401

    patch_resp = client.patch(
        "/api/users/me",
        json={"full_name": "Hacker"},
    )
    assert patch_resp.status_code == 401
