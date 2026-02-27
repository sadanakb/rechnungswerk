"""
Tests for global rate limiting (slowapi).

These tests verify that:
1. Normal requests pass through (not blocked with 429)
2. The health endpoint remains accessible
3. The rate-limited login endpoint accepts valid requests
   (does not 429 on the first request)
"""
import os
import pytest

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("REQUIRE_API_KEY", "false")

from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


def test_health_endpoint_accessible(client):
    """GET /api/health must return 200, never 429."""
    response = client.get("/api/health")
    assert response.status_code == 200, (
        f"Expected 200 from /api/health, got {response.status_code}"
    )


def test_normal_login_request_not_rate_limited(client):
    """A single POST to /api/auth/login must not be blocked by rate limiting.

    Sending invalid credentials returns 401 (wrong creds) or 422 (validation
    error), but never 429 (rate limit exceeded) on the very first request.
    """
    response = client.post(
        "/api/auth/login",
        json={"email": "test@example.com", "password": "wrongpassword"},
    )
    assert response.status_code != 429, (
        "Rate limiter blocked the very first login request — this is wrong."
    )
    # 401 = wrong creds, 422 = validation error, 500 = no DB in module-scope test env
    assert response.status_code in (401, 422, 500), (
        f"Unexpected status {response.status_code} on first login attempt"
    )


def test_normal_register_request_not_rate_limited(client):
    """A single POST to /api/auth/register must not be blocked by rate limiting.

    Returns 409 (dup email), 422 (validation), or 201 — never 429 on first hit.
    """
    response = client.post(
        "/api/auth/register",
        json={
            "email": "ratelimit_test@example.com",
            "password": "SecurePass123!",
            "full_name": "Rate Limit Tester",
            "organization_name": "Rate Limit Org",
        },
    )
    assert response.status_code != 429, (
        "Rate limiter blocked the very first register request — this is wrong."
    )
    assert response.status_code in (201, 409, 422, 500), (
        f"Unexpected status {response.status_code} on first register attempt"
    )


def test_normal_forgot_password_not_rate_limited(client):
    """A single POST to /api/auth/forgot-password must not return 429."""
    response = client.post(
        "/api/auth/forgot-password",
        json={"email": "nobody@example.com"},
    )
    assert response.status_code != 429, (
        "Rate limiter blocked the very first forgot-password request."
    )
    # 200 = expected (anti-enumeration design), 500 = no DB in module-scope test env
    assert response.status_code in (200, 500), (
        f"Unexpected status {response.status_code} from forgot-password"
    )
