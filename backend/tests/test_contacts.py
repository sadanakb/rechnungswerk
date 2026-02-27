"""
Tests for the Contact management API.

1. test_create_contact           — create a customer, verify response fields
2. test_list_contacts_by_type    — create customer + supplier, filter by type
3. test_search_contacts          — search by name substring
4. test_update_contact           — update name and email, verify persistence
5. test_soft_delete              — delete a contact, list → not returned
6. test_cross_org_isolation      — org B cannot see org A's contacts
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
from app.models import Base, User, OrganizationMember
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


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _create_contact(client: TestClient, token: str, **overrides) -> dict:
    """Create a contact and return the response JSON."""
    payload = {
        "type": "customer",
        "name": "Test Kunde GmbH",
        "email": "kunde@example.de",
        "phone": "+49 69 12345",
        "address_line1": "Musterstraße 1",
        "city": "Frankfurt",
        "zip": "60311",
        "country": "DE",
        "vat_id": "DE123456789",
        "payment_terms": 30,
        "notes": "Test notes",
    }
    payload.update(overrides)
    resp = client.post("/api/contacts", json=payload, headers=_auth(token))
    assert resp.status_code == 201, f"Create contact failed: {resp.text}"
    return resp.json()


# ---------------------------------------------------------------------------
# Test 1: Create contact — verify all response fields
# ---------------------------------------------------------------------------

def test_create_contact(client, db_session):
    """Creating a customer contact returns 201 with correct fields."""
    token = _register_and_login(client, "create@contacts.de", "Create Contacts GmbH")

    resp = client.post(
        "/api/contacts",
        json={
            "type": "customer",
            "name": "Musterkunde AG",
            "email": "info@musterkunde.de",
            "phone": "+49 30 987654",
            "address_line1": "Berliner Str. 5",
            "city": "Berlin",
            "zip": "10115",
            "country": "DE",
            "vat_id": "DE999888777",
            "payment_terms": 14,
            "notes": "Wichtiger Kunde",
        },
        headers=_auth(token),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["type"] == "customer"
    assert data["name"] == "Musterkunde AG"
    assert data["email"] == "info@musterkunde.de"
    assert data["phone"] == "+49 30 987654"
    assert data["city"] == "Berlin"
    assert data["zip"] == "10115"
    assert data["country"] == "DE"
    assert data["vat_id"] == "DE999888777"
    assert data["payment_terms"] == 14
    assert data["notes"] == "Wichtiger Kunde"
    assert data["is_active"] is True
    assert "id" in data
    assert "org_id" in data
    assert "created_at" in data


# ---------------------------------------------------------------------------
# Test 2: List with type filter — customer vs. supplier
# ---------------------------------------------------------------------------

def test_list_contacts_by_type(client, db_session):
    """
    Create 1 customer and 1 supplier.
    Filter by type=customer → only 1 result.
    Filter by type=supplier → only 1 result.
    No filter → 2 results.
    """
    token = _register_and_login(client, "type@contacts.de", "Type Contacts GmbH")

    _create_contact(client, token, type="customer", name="Alpha Kunde")
    _create_contact(client, token, type="supplier", name="Beta Lieferant")

    # All
    resp_all = client.get("/api/contacts", headers=_auth(token))
    assert resp_all.status_code == 200
    assert len(resp_all.json()) == 2

    # Only customers
    resp_cust = client.get("/api/contacts?type=customer", headers=_auth(token))
    assert resp_cust.status_code == 200
    customers = resp_cust.json()
    assert len(customers) == 1
    assert customers[0]["name"] == "Alpha Kunde"
    assert customers[0]["type"] == "customer"

    # Only suppliers
    resp_supp = client.get("/api/contacts?type=supplier", headers=_auth(token))
    assert resp_supp.status_code == 200
    suppliers = resp_supp.json()
    assert len(suppliers) == 1
    assert suppliers[0]["name"] == "Beta Lieferant"
    assert suppliers[0]["type"] == "supplier"


# ---------------------------------------------------------------------------
# Test 3: Search by name
# ---------------------------------------------------------------------------

def test_search_contacts(client, db_session):
    """
    Create 2 contacts with distinct names.
    Search with a substring that only matches one of them.
    """
    token = _register_and_login(client, "search@contacts.de", "Search Contacts GmbH")

    _create_contact(client, token, name="Zenith Handels GmbH")
    _create_contact(client, token, name="Alpha Services AG")

    # Search for "zenith" (case-insensitive)
    resp = client.get("/api/contacts?search=zenith", headers=_auth(token))
    assert resp.status_code == 200
    results = resp.json()
    assert len(results) == 1
    assert results[0]["name"] == "Zenith Handels GmbH"

    # Search for "alpha"
    resp2 = client.get("/api/contacts?search=alpha", headers=_auth(token))
    assert resp2.status_code == 200
    results2 = resp2.json()
    assert len(results2) == 1
    assert results2[0]["name"] == "Alpha Services AG"

    # Search for a non-existent substring
    resp3 = client.get("/api/contacts?search=nonexistent", headers=_auth(token))
    assert resp3.status_code == 200
    assert resp3.json() == []


# ---------------------------------------------------------------------------
# Test 4: Update contact
# ---------------------------------------------------------------------------

def test_update_contact(client, db_session):
    """
    Create a contact, then PATCH it to change name and email.
    Verify the GET response reflects the update.
    """
    token = _register_and_login(client, "update@contacts.de", "Update Contacts GmbH")

    created = _create_contact(client, token, name="Old Name AG", email="old@example.de")
    contact_id = created["id"]

    resp_patch = client.patch(
        f"/api/contacts/{contact_id}",
        json={
            "type": "customer",
            "name": "New Name GmbH",
            "email": "new@example.de",
            "payment_terms": 45,
        },
        headers=_auth(token),
    )
    assert resp_patch.status_code == 200
    updated = resp_patch.json()
    assert updated["name"] == "New Name GmbH"
    assert updated["email"] == "new@example.de"
    assert updated["payment_terms"] == 45

    # Confirm via GET
    resp_get = client.get(f"/api/contacts/{contact_id}", headers=_auth(token))
    assert resp_get.status_code == 200
    fetched = resp_get.json()
    assert fetched["name"] == "New Name GmbH"
    assert fetched["email"] == "new@example.de"


# ---------------------------------------------------------------------------
# Test 5: Soft delete — deleted contact not in list
# ---------------------------------------------------------------------------

def test_soft_delete(client, db_session):
    """
    Create 2 contacts. Delete one. List returns only 1.
    The deleted contact is also not returned by its own GET.
    """
    token = _register_and_login(client, "delete@contacts.de", "Delete Contacts GmbH")

    c1 = _create_contact(client, token, name="Keep Me GmbH")
    c2 = _create_contact(client, token, name="Delete Me AG")

    resp_del = client.delete(f"/api/contacts/{c2['id']}", headers=_auth(token))
    assert resp_del.status_code == 204

    # List should only return the surviving contact
    resp_list = client.get("/api/contacts", headers=_auth(token))
    assert resp_list.status_code == 200
    names = [c["name"] for c in resp_list.json()]
    assert "Keep Me GmbH" in names
    assert "Delete Me AG" not in names
    assert len(resp_list.json()) == 1


# ---------------------------------------------------------------------------
# Test 6: Cross-org isolation
# ---------------------------------------------------------------------------

def test_cross_org_isolation(client, db_session):
    """
    Org A creates a contact.
    Org B lists contacts → must see 0 (not Org A's contact).
    Org B cannot GET Org A's contact by ID (404).
    """
    token_a = _register_and_login(client, "orga@contacts.de", "Org A Contacts GmbH")
    token_b = _register_and_login(client, "orgb@contacts.de", "Org B Contacts GmbH")

    # Org A creates a contact
    created_a = _create_contact(client, token_a, name="Secret Kunde A")
    contact_id = created_a["id"]

    # Org B lists contacts → should see 0
    resp_b_list = client.get("/api/contacts", headers=_auth(token_b))
    assert resp_b_list.status_code == 200
    assert resp_b_list.json() == []

    # Org B tries to GET Org A's contact by ID → 404
    resp_b_get = client.get(f"/api/contacts/{contact_id}", headers=_auth(token_b))
    assert resp_b_get.status_code == 404

    # Org A can still see its own contact
    resp_a_list = client.get("/api/contacts", headers=_auth(token_a))
    assert resp_a_list.status_code == 200
    assert len(resp_a_list.json()) == 1
    assert resp_a_list.json()[0]["name"] == "Secret Kunde A"
