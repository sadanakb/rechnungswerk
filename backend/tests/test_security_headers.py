"""Tests for security headers middleware."""
from fastapi.testclient import TestClient
from app.main import app


def test_security_headers_present():
    client = TestClient(app)
    resp = client.get("/api/health")
    assert resp.headers.get("X-Content-Type-Options") == "nosniff"
    assert resp.headers.get("X-Frame-Options") == "DENY"
    assert resp.headers.get("X-XSS-Protection") == "1; mode=block"
    assert "strict-transport-security" in {k.lower() for k in resp.headers.keys()}
    assert resp.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
    assert resp.headers.get("Permissions-Policy") == "camera=(), microphone=(), geolocation=()"


def test_headers_on_api_endpoints(client):
    resp = client.get("/api/invoices")
    assert resp.headers.get("X-Content-Type-Options") == "nosniff"
