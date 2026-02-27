"""Tests for the audit log system.

Covers:
- test_audit_log_created_on_invoice_creation
- test_get_audit_log_paginated
- test_audit_log_filters_by_action
- test_member_role_required (non-admin cannot see audit log)
"""
import os
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Must be set before app imports to disable API key guard for invoice endpoints
os.environ.setdefault("REQUIRE_API_KEY", "false")

from app.main import app
from app.models import Base, AuditLog, User, Organization, OrganizationMember
from app.database import get_db
from app.config import settings
from app.auth_jwt import hash_password, create_access_token


# ---------------------------------------------------------------------------
# Fixtures — same pattern as test_users.py, but we leave require_api_key=True
# so that JWT protection on /api/audit is active, while the invoice router
# uses X-API-Key which is also checked via the same flag.
# We patch require_api_key=True for the *audit* endpoint tests and use the
# ACTIVE_API_KEY for invoice calls.
# ---------------------------------------------------------------------------

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
    """TestClient with JWT auth required (require_api_key=True) for audit endpoints,
    but we bypass the API key check for invoice endpoints by sending the correct key."""

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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_api_key() -> str:
    """Return the active API key for invoice endpoint calls."""
    from app.auth import ACTIVE_API_KEY
    return ACTIVE_API_KEY


def _register_and_get_token(
    client: TestClient,
    email: str = "owner@audit.de",
    org_name: str = "Audit GmbH",
) -> str:
    """Register a user as org owner and return the access token."""
    resp = client.post("/api/auth/register", json={
        "email": email,
        "password": "SecurePass123!",
        "full_name": "Audit User",
        "organization_name": org_name,
    })
    assert resp.status_code == 201
    return resp.json()["access_token"]


def _create_invoice(client: TestClient, token: str, api_key: str) -> dict:
    """Create a minimal invoice and return the response JSON."""
    resp = client.post(
        "/api/invoices",
        json={
            "invoice_number": "RE-2026-001",
            "invoice_date": "2026-02-27",
            "due_date": "2026-03-13",
            "seller_name": "Testfirma GmbH",
            "seller_vat_id": "DE123456789",
            "seller_address": "Musterstrasse 1, 12345 Berlin",
            "buyer_name": "Kaeuferfirma AG",
            "buyer_vat_id": "DE987654321",
            "buyer_address": "Kauferstrasse 2, 54321 Hamburg",
            "line_items": [
                {
                    "description": "Beratungsleistung",
                    "quantity": 1,
                    "unit_price": 1000.0,
                    "net_amount": 1000.0,
                    "tax_rate": 19.0,
                }
            ],
            "tax_rate": 19.0,
        },
        headers={
            "Authorization": f"Bearer {token}",
            "X-API-Key": api_key,
        },
    )
    assert resp.status_code == 200, f"Invoice creation failed: {resp.text}"
    return resp.json()


def _seed_audit_entry(db_session, org_id: int, action: str, resource_type: str = "invoice") -> AuditLog:
    """Directly insert an AuditLog entry into the test DB."""
    entry = AuditLog(
        org_id=org_id,
        user_id=None,
        action=action,
        resource_type=resource_type,
        resource_id="INV-20260227-abc12345",
        details={"note": "seeded for test"},
        ip_address="127.0.0.1",
    )
    db_session.add(entry)
    db_session.commit()
    db_session.refresh(entry)
    return entry


def _get_org_id_for_user(db_session, email: str) -> int:
    """Resolve an organization ID for a registered user by email."""
    user = db_session.query(User).filter(User.email == email).first()
    assert user is not None, f"User {email} not found"
    member = db_session.query(OrganizationMember).filter(
        OrganizationMember.user_id == user.id
    ).first()
    assert member is not None
    return member.organization_id


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_audit_log_created_on_invoice_creation(client, db_session):
    """Creating an invoice must produce an audit log entry with action='invoice_created'."""
    token = _register_and_get_token(client, email="inv_audit@test.de", org_name="InvAudit GmbH")
    api_key = _get_api_key()

    invoice = _create_invoice(client, token, api_key)
    invoice_id = invoice["invoice_id"]

    # Directly check the DB
    entry = db_session.query(AuditLog).filter(AuditLog.action == "invoice_created").first()
    assert entry is not None, "AuditLog entry for invoice_created was not created"
    assert entry.resource_type == "invoice"
    assert entry.resource_id == invoice_id
    assert entry.details is not None
    assert entry.details.get("invoice_number") == "RE-2026-001"
    assert entry.org_id is not None


def test_get_audit_log_paginated(client, db_session):
    """GET /api/audit returns paginated list with correct structure."""
    token = _register_and_get_token(client, email="paginated@test.de", org_name="Paginated GmbH")

    org_id = _get_org_id_for_user(db_session, "paginated@test.de")

    # Seed two audit entries directly
    _seed_audit_entry(db_session, org_id, "invoice_created")
    _seed_audit_entry(db_session, org_id, "invoice_deleted")

    resp = client.get(
        "/api/audit",
        headers={"Authorization": f"Bearer {token}"},
        params={"page": 1, "page_size": 10},
    )
    assert resp.status_code == 200
    data = resp.json()

    assert "items" in data
    assert "total" in data
    assert "page" in data
    assert "page_size" in data
    assert data["page"] == 1
    assert data["page_size"] == 10
    assert data["total"] >= 2

    # Each item must have required fields
    for item in data["items"]:
        assert "id" in item
        assert "action" in item
        assert "created_at" in item
        assert "org_id" in item


def test_audit_log_filters_by_action(client, db_session):
    """GET /api/audit?action=invoice_created must return only invoice_created entries."""
    token = _register_and_get_token(client, email="filter@test.de", org_name="Filter GmbH")
    org_id = _get_org_id_for_user(db_session, "filter@test.de")

    # Seed entries with two different actions
    _seed_audit_entry(db_session, org_id, "invoice_created")
    _seed_audit_entry(db_session, org_id, "invoice_deleted")
    _seed_audit_entry(db_session, org_id, "user_profile_updated", resource_type="user")

    # Filter by invoice_created
    resp = client.get(
        "/api/audit",
        headers={"Authorization": f"Bearer {token}"},
        params={"action": "invoice_created"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    for item in data["items"]:
        assert item["action"] == "invoice_created"

    # Filter by user_profile_updated — must exclude invoice entries
    resp2 = client.get(
        "/api/audit",
        headers={"Authorization": f"Bearer {token}"},
        params={"action": "user_profile_updated"},
    )
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["total"] >= 1
    for item in data2["items"]:
        assert item["action"] == "user_profile_updated"


def test_member_role_required(client, db_session):
    """
    A user with 'member' role (not owner/admin) must receive 403 when accessing /api/audit.

    We register a user (gets 'owner' role), then downgrade their membership role to
    'member' directly in the DB, and verify the audit endpoint rejects them with 403.
    """
    token = _register_and_get_token(
        client, email="plainmember@test.de", org_name="Member Only GmbH"
    )

    # Downgrade the user's role to 'member' directly in DB
    user = db_session.query(User).filter(User.email == "plainmember@test.de").first()
    assert user is not None
    membership = db_session.query(OrganizationMember).filter(
        OrganizationMember.user_id == user.id
    ).first()
    assert membership is not None
    membership.role = "member"
    db_session.commit()

    # Now attempt to access audit log — must be rejected with 403
    resp = client.get(
        "/api/audit",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403
    detail = resp.json()["detail"].lower()
    assert "owner" in detail or "admin" in detail


def test_audit_log_unauthenticated_rejected(client):
    """GET /api/audit without a token must return 401."""
    resp = client.get("/api/audit")
    assert resp.status_code == 401


def test_audit_log_password_change_logged(client, db_session):
    """Changing password via PATCH /api/users/me must create a password_changed audit entry."""
    token = _register_and_get_token(client, email="pwaudit@test.de", org_name="PW Audit GmbH")

    resp = client.patch(
        "/api/users/me",
        json={
            "current_password": "SecurePass123!",
            "new_password": "NewSecure456!",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200

    entry = db_session.query(AuditLog).filter(AuditLog.action == "password_changed").first()
    assert entry is not None, "AuditLog entry for password_changed was not created"
    assert entry.resource_type == "user"
