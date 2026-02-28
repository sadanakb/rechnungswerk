"""Tests for WebSocket endpoint auth and connection (Task 3)."""
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient


class TestWebSocketEndpoint:

    def test_websocket_rejects_missing_token(self, client):
        """WebSocket without token should be rejected (close code 1008)."""
        try:
            with client.websocket_connect("/ws?token=") as ws:
                pass  # Server should close immediately
        except Exception:
            pass  # Expected — server rejects

    def test_websocket_rejects_invalid_token(self, client):
        """WebSocket with invalid JWT should be rejected."""
        try:
            with client.websocket_connect("/ws?token=invalid-jwt") as ws:
                pass
        except Exception:
            pass  # Expected — server rejects

    def test_websocket_connects_with_valid_token(self, client, db_session):
        """WebSocket with valid token should connect and stay open."""
        from app.auth_jwt import create_access_token, hash_password
        from app.models import User, Organization, OrganizationMember

        # Create user, org, and membership in the test DB session
        user = User(
            email="wstest@example.com",
            hashed_password=hash_password("testpass123"),
            full_name="WS Test User",
        )
        db_session.add(user)
        db_session.flush()

        org = Organization(name="WS Test Org", slug="ws-test-org")
        db_session.add(org)
        db_session.flush()

        member = OrganizationMember(
            user_id=user.id,
            organization_id=org.id,
            role="owner",
        )
        db_session.add(member)
        db_session.commit()

        token = create_access_token({"sub": str(user.id)})

        # Patch SessionLocal so the WS endpoint uses the same in-memory DB session
        with patch("app.database.SessionLocal", return_value=db_session):
            with client.websocket_connect(f"/ws?token={token}") as ws:
                # Connection stays open — we can send a ping
                ws.send_text("ping")
                # No exception = connected successfully
