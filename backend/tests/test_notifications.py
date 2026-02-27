"""Tests for the in-app notification system.

Covers:
1. test_list_notifications_empty              — no notifications → []
2. test_list_notifications_returns_own_org_only — org isolation
3. test_mark_read_by_ids                      — mark specific IDs as read
4. test_mark_read_all                         — mark all as read
5. test_unread_count                          — correct unread count
"""
import os
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("REQUIRE_API_KEY", "false")

from app.main import app
from app.models import Base, Notification, User, Organization, OrganizationMember
from app.database import get_db
from app.config import settings


# ---------------------------------------------------------------------------
# Fixtures
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
    """TestClient with JWT auth enabled and DB dependency overridden."""

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

def _register_and_login(client: TestClient, email: str, org_name: str) -> str:
    """Register a new user+org and return the JWT access token."""
    resp = client.post("/api/auth/register", json={
        "email": email,
        "password": "SecurePass123!",
        "full_name": "Test User",
        "organization_name": org_name,
    })
    assert resp.status_code == 201, f"Register failed: {resp.text}"
    return resp.json()["access_token"]


def _get_org_id(db_session, email: str) -> int:
    """Look up the org_id for a registered user."""
    user = db_session.query(User).filter(User.email == email).first()
    assert user is not None, f"User {email} not found in DB"
    member = db_session.query(OrganizationMember).filter(
        OrganizationMember.user_id == user.id
    ).first()
    assert member is not None, f"No membership for user {email}"
    return member.organization_id


def _seed_notification(
    db_session,
    org_id: int,
    title: str = "Test",
    is_read: bool = False,
) -> Notification:
    """Directly insert a Notification row into the test DB."""
    n = Notification(
        org_id=org_id,
        type="test_event",
        title=title,
        message="Testbenachrichtigung",
        is_read=is_read,
        link="/invoices/1",
    )
    db_session.add(n)
    db_session.commit()
    db_session.refresh(n)
    return n


# ---------------------------------------------------------------------------
# Test 1: Empty list
# ---------------------------------------------------------------------------

def test_list_notifications_empty(client, db_session):
    """A freshly created organisation has no notifications — endpoint returns []."""
    token = _register_and_login(client, "empty@notify.de", "Empty Notify GmbH")

    resp = client.get(
        "/api/notifications",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json() == []


# ---------------------------------------------------------------------------
# Test 2: Org isolation — only own org's notifications are returned
# ---------------------------------------------------------------------------

def test_list_notifications_returns_own_org_only(client, db_session):
    """
    Create 2 notifications for org A and 1 for org B.
    Org A's user must see exactly 2; the notification from org B is hidden.
    """
    token_a = _register_and_login(client, "orga@notify.de", "Org A GmbH")
    token_b = _register_and_login(client, "orgb@notify.de", "Org B GmbH")

    org_id_a = _get_org_id(db_session, "orga@notify.de")
    org_id_b = _get_org_id(db_session, "orgb@notify.de")

    _seed_notification(db_session, org_id_a, title="A-1")
    _seed_notification(db_session, org_id_a, title="A-2")
    _seed_notification(db_session, org_id_b, title="B-1")

    resp_a = client.get(
        "/api/notifications",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert resp_a.status_code == 200
    data_a = resp_a.json()
    assert len(data_a) == 2
    titles_a = {n["title"] for n in data_a}
    assert titles_a == {"A-1", "A-2"}

    resp_b = client.get(
        "/api/notifications",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert resp_b.status_code == 200
    data_b = resp_b.json()
    assert len(data_b) == 1
    assert data_b[0]["title"] == "B-1"


# ---------------------------------------------------------------------------
# Test 3: mark-read by IDs
# ---------------------------------------------------------------------------

def test_mark_read_by_ids(client, db_session):
    """
    Create 3 notifications, mark 2 by ID as read.
    Verify via unread-count that exactly 1 remains unread.
    """
    token = _register_and_login(client, "markbyid@notify.de", "MarkById GmbH")
    org_id = _get_org_id(db_session, "markbyid@notify.de")

    n1 = _seed_notification(db_session, org_id, title="N-1")
    n2 = _seed_notification(db_session, org_id, title="N-2")
    n3 = _seed_notification(db_session, org_id, title="N-3")

    # Mark n1 and n2 as read
    resp = client.post(
        "/api/notifications/mark-read",
        json={"ids": [n1.id, n2.id]},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}

    # Verify directly in DB
    db_session.expire_all()
    assert db_session.get(Notification, n1.id).is_read is True
    assert db_session.get(Notification, n2.id).is_read is True
    assert db_session.get(Notification, n3.id).is_read is False

    # Also verify via unread-count endpoint
    count_resp = client.get(
        "/api/notifications/unread-count",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert count_resp.status_code == 200
    assert count_resp.json()["count"] == 1


# ---------------------------------------------------------------------------
# Test 4: mark-read all
# ---------------------------------------------------------------------------

def test_mark_read_all(client, db_session):
    """
    Create 3 unread notifications, call mark-read with all=true.
    Verify unread count drops to 0.
    """
    token = _register_and_login(client, "markall@notify.de", "MarkAll GmbH")
    org_id = _get_org_id(db_session, "markall@notify.de")

    for i in range(3):
        _seed_notification(db_session, org_id, title=f"N-{i}")

    resp = client.post(
        "/api/notifications/mark-read",
        json={"all": True},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}

    count_resp = client.get(
        "/api/notifications/unread-count",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert count_resp.status_code == 200
    assert count_resp.json()["count"] == 0


# ---------------------------------------------------------------------------
# Test 5: unread-count
# ---------------------------------------------------------------------------

def test_unread_count(client, db_session):
    """
    Create 3 notifications: 2 unread, 1 already read.
    Verify that unread-count returns 2.
    """
    token = _register_and_login(client, "count@notify.de", "Count GmbH")
    org_id = _get_org_id(db_session, "count@notify.de")

    _seed_notification(db_session, org_id, title="Unread-1", is_read=False)
    _seed_notification(db_session, org_id, title="Unread-2", is_read=False)
    _seed_notification(db_session, org_id, title="Already-read", is_read=True)

    resp = client.get(
        "/api/notifications/unread-count",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["count"] == 2
