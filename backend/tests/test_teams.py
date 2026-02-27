"""Tests for team management endpoints: GET/POST/DELETE/PATCH /api/teams/*."""
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import Base, User, Organization, OrganizationMember
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


def _register_and_get_token(
    client: TestClient,
    email: str = "owner@test.de",
    org_name: str = "Team GmbH",
) -> str:
    """Helper: register a user and return the access token."""
    resp = client.post("/api/auth/register", json={
        "email": email,
        "password": "SecurePass123!",
        "full_name": "Max Mustermann",
        "organization_name": org_name,
    })
    assert resp.status_code == 201
    return resp.json()["access_token"]


def _add_member_to_org(
    db_session,
    email: str,
    org_id: int,
    role: str = "member",
) -> tuple[int, str]:
    """Helper: create a user and add them to the given org. Returns (user_id, token)."""
    from app.auth_jwt import hash_password, create_access_token

    user = User(
        email=email,
        hashed_password=hash_password("SecurePass123!"),
        full_name="Test User",
    )
    db_session.add(user)
    db_session.flush()

    member = OrganizationMember(
        user_id=user.id,
        organization_id=org_id,
        role=role,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(user)

    token = create_access_token(
        data={"sub": str(user.id), "org_id": org_id, "role": role}
    )
    return user.id, token


def _get_org_id(db_session) -> int:
    """Get the first organization's ID."""
    org = db_session.query(Organization).first()
    return org.id


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_list_members(client, db_session):
    """GET /api/teams/members — owner sees all members."""
    # Register owner (creates org + owner membership)
    token = _register_and_get_token(client)
    org_id = _get_org_id(db_session)

    # Add a second member
    _add_member_to_org(db_session, "member@test.de", org_id, "member")

    # Patch cloud_mode so feature gate is active, and set plan to professional
    org = db_session.query(Organization).filter(Organization.id == org_id).first()
    org.plan = "professional"
    db_session.commit()

    with patch.object(settings, "cloud_mode", True):
        resp = client.get(
            "/api/teams/members",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2

    emails = {m["email"] for m in data}
    assert "owner@test.de" in emails
    assert "member@test.de" in emails

    # Owner should have role "owner"
    owner_member = [m for m in data if m["email"] == "owner@test.de"][0]
    assert owner_member["role"] == "owner"


def test_invite_member_sends_email(client, db_session):
    """POST /api/teams/invite — sends invitation email."""
    token = _register_and_get_token(client, email="inviter@test.de")
    org_id = _get_org_id(db_session)

    # Set plan to professional
    org = db_session.query(Organization).filter(Organization.id == org_id).first()
    org.plan = "professional"
    db_session.commit()

    with patch.object(settings, "cloud_mode", True), \
         patch("app.routers.teams.email_service.send_team_invite", return_value=True) as mock_email:
        resp = client.post(
            "/api/teams/invite",
            json={"email": "newmember@test.de", "role": "member"},
            headers={"Authorization": f"Bearer {token}"},
        )

    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == "newmember@test.de"
    assert data["role"] == "member"
    assert "Einladung" in data["message"]

    # Verify email was called
    mock_email.assert_called_once()
    call_kwargs = mock_email.call_args
    assert call_kwargs[1]["to_email"] == "newmember@test.de" or call_kwargs[0][0] == "newmember@test.de"


def test_remove_member_owner_only(client, db_session):
    """DELETE /api/teams/members/{id} — admin and member get 403."""
    # Register owner
    owner_token = _register_and_get_token(client, email="rmowner@test.de")
    org_id = _get_org_id(db_session)

    # Set plan to professional
    org = db_session.query(Organization).filter(Organization.id == org_id).first()
    org.plan = "professional"
    db_session.commit()

    # Add admin and regular member
    admin_id, admin_token = _add_member_to_org(db_session, "rmadmin@test.de", org_id, "admin")
    member_id, member_token = _add_member_to_org(db_session, "rmmember@test.de", org_id, "member")

    with patch.object(settings, "cloud_mode", True):
        # Admin tries to remove member -> 403
        resp_admin = client.delete(
            f"/api/teams/members/{member_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp_admin.status_code == 403

        # Member tries to remove admin -> 403
        resp_member = client.delete(
            f"/api/teams/members/{admin_id}",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp_member.status_code == 403

        # Owner removes member -> 200
        resp_owner = client.delete(
            f"/api/teams/members/{member_id}",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert resp_owner.status_code == 200
        assert "entfernt" in resp_owner.json()["message"]


def test_free_plan_blocked(client, db_session):
    """Feature gate rejects free plan in cloud mode."""
    token = _register_and_get_token(client, email="free@test.de", org_name="Free GmbH")
    org_id = _get_org_id(db_session)

    # Plan is already "free" by default
    with patch.object(settings, "cloud_mode", True):
        resp = client.get(
            "/api/teams/members",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert resp.status_code == 403
    assert "Upgrade" in resp.json()["detail"]
