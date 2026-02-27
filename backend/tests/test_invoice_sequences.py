"""
Tests for the configurable invoice number sequence API.

1. test_create_sequence      — POST config, GET to verify fields and preview
2. test_generate_sequential_numbers — create sequence, create 3 invoices via the
                               service directly, check RE-2026-0001 through 0003
3. test_update_sequence      — POST new config, verify preview changes
4. test_preview_endpoint     — GET /api/invoice-sequences/preview?prefix=RG returns
                               correct format
"""
import os
import pytest
from datetime import datetime
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("REQUIRE_API_KEY", "false")

from app.main import app
from app.models import Base, InvoiceNumberSequence
from app.database import get_db
from app.config import settings
from app.invoice_number_service import generate_next_invoice_number, preview_format


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


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Test 1: Create sequence config and verify GET returns correct fields
# ---------------------------------------------------------------------------

def test_create_sequence(client, db_session):
    """POST a sequence config and GET should return the saved fields plus a preview."""
    token = _register_and_login(client, "seq1@test.de", "SeqOrg GmbH")

    config = {
        "prefix": "RE",
        "separator": "-",
        "year_format": "YYYY",
        "padding": 4,
        "reset_yearly": True,
    }

    # Create
    resp = client.post("/api/invoice-sequences", json=config, headers=_auth(token))
    assert resp.status_code == 200, f"POST failed: {resp.text}"
    data = resp.json()
    assert data["ok"] is True
    assert "preview" in data
    assert "RE" in data["preview"]

    # GET and verify persisted fields
    resp = client.get("/api/invoice-sequences", headers=_auth(token))
    assert resp.status_code == 200, f"GET failed: {resp.text}"
    seq = resp.json()
    assert seq["configured"] is True
    assert seq["prefix"] == "RE"
    assert seq["separator"] == "-"
    assert seq["year_format"] == "YYYY"
    assert seq["padding"] == 4
    assert seq["reset_yearly"] is True
    assert seq["current_counter"] == 0
    # Preview should look like RE-2026-0001
    assert seq["preview"] == "RE-2026-0001"


# ---------------------------------------------------------------------------
# Test 2: Sequential number generation via the service
# ---------------------------------------------------------------------------

def test_generate_sequential_numbers(db_session):
    """Directly calling generate_next_invoice_number three times yields sequential numbers."""
    current_year = datetime.now().year
    org_id = 99

    # Insert a sequence for org 99
    seq = InvoiceNumberSequence(
        org_id=org_id,
        prefix="RE",
        separator="-",
        year_format="YYYY",
        padding=4,
        reset_yearly=True,
        last_reset_year=current_year,
    )
    db_session.add(seq)
    db_session.commit()

    num1 = generate_next_invoice_number(db_session, org_id)
    db_session.commit()

    num2 = generate_next_invoice_number(db_session, org_id)
    db_session.commit()

    num3 = generate_next_invoice_number(db_session, org_id)
    db_session.commit()

    expected1 = f"RE-{current_year}-0001"
    expected2 = f"RE-{current_year}-0002"
    expected3 = f"RE-{current_year}-0003"

    assert num1 == expected1, f"Expected {expected1}, got {num1}"
    assert num2 == expected2, f"Expected {expected2}, got {num2}"
    assert num3 == expected3, f"Expected {expected3}, got {num3}"


# ---------------------------------------------------------------------------
# Test 3: Updating sequence config changes the preview
# ---------------------------------------------------------------------------

def test_update_sequence(client, db_session):
    """POST a new config should overwrite the previous one and update the preview."""
    token = _register_and_login(client, "seq3@test.de", "UpdateSeq GmbH")

    # Create initial config
    client.post("/api/invoice-sequences", json={
        "prefix": "RE",
        "separator": "-",
        "year_format": "YYYY",
        "padding": 4,
        "reset_yearly": True,
    }, headers=_auth(token))

    # Update to different config
    resp = client.post("/api/invoice-sequences", json={
        "prefix": "RG",
        "separator": "/",
        "year_format": "YY",
        "padding": 5,
        "reset_yearly": False,
    }, headers=_auth(token))
    assert resp.status_code == 200, f"Update failed: {resp.text}"
    assert resp.json()["preview"] == "RG/26/00001"

    # GET confirms persistence
    resp = client.get("/api/invoice-sequences", headers=_auth(token))
    seq = resp.json()
    assert seq["prefix"] == "RG"
    assert seq["separator"] == "/"
    assert seq["year_format"] == "YY"
    assert seq["padding"] == 5
    assert seq["reset_yearly"] is False
    assert seq["preview"] == "RG/26/00001"


# ---------------------------------------------------------------------------
# Test 4: Preview endpoint returns correct format without saving
# ---------------------------------------------------------------------------

def test_preview_endpoint(client, db_session):
    """GET /api/invoice-sequences/preview with prefix=RG returns correct format."""
    token = _register_and_login(client, "seq4@test.de", "PreviewSeq GmbH")

    resp = client.get(
        "/api/invoice-sequences/preview",
        params={"prefix": "RG", "separator": "-", "year_format": "YYYY", "padding": 4},
        headers=_auth(token),
    )
    assert resp.status_code == 200, f"Preview failed: {resp.text}"
    data = resp.json()
    assert "preview" in data
    assert data["preview"] == "RG-2026-0001"

    # Also test the preview_format helper directly for coverage
    assert preview_format("INV", "/", "YY", 3) == "INV/26/001"
    assert preview_format("RE", "-", "YYYY", 4) == "RE-2026-0001"
