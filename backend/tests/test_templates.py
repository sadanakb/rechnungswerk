"""
Tests for Invoice Template management endpoints.

Endpoints under test:
- GET    /api/templates          — list org's templates
- POST   /api/templates          — create template
- GET    /api/templates/{id}     — get single template
- PUT    /api/templates/{id}     — update template
- DELETE /api/templates/{id}     — delete template

Test patterns follow test_api_keys.py exactly:
  - In-memory SQLite via db_session fixture
  - client fixture overrides get_db and patches require_api_key = True
  - _register_and_get_token helper creates a user + org, returns JWT
"""
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

def _register_and_get_token(
    client: TestClient,
    email: str = "user@test.de",
    org_name: str = "Test GmbH",
) -> str:
    """Register a user+org and return the access token."""
    resp = client.post("/api/auth/register", json={
        "email": email,
        "password": "SecurePass123!",
        "full_name": "Max Mustermann",
        "organization_name": org_name,
    })
    assert resp.status_code == 201, resp.text
    return resp.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


SAMPLE_TEMPLATE = {
    "name": "Standard-Vorlage",
    "primary_color": "#14b8a6",
    "footer_text": "Vielen Dank fuer Ihren Auftrag.",
    "payment_terms_days": 14,
    "bank_iban": "DE89370400440532013000",
    "bank_bic": "COBADEFFXXX",
    "bank_name": "Commerzbank AG",
    "default_vat_rate": "19",
    "notes_template": "Bitte ueberweisen Sie den Betrag innerhalb von {days} Tagen.",
    "is_default": False,
}


# ---------------------------------------------------------------------------
# test_create_template
# ---------------------------------------------------------------------------

def test_create_template(client):
    """POST /api/templates returns 201 with the created template."""
    token = _register_and_get_token(client, email="create@test.de")

    resp = client.post("/api/templates", json=SAMPLE_TEMPLATE, headers=_auth(token))
    assert resp.status_code == 201, resp.text
    data = resp.json()

    assert data["name"] == "Standard-Vorlage"
    assert data["primary_color"] == "#14b8a6"
    assert data["footer_text"] == "Vielen Dank fuer Ihren Auftrag."
    assert data["payment_terms_days"] == 14
    assert data["bank_iban"] == "DE89370400440532013000"
    assert data["bank_bic"] == "COBADEFFXXX"
    assert data["bank_name"] == "Commerzbank AG"
    assert data["default_vat_rate"] == "19"
    assert data["is_default"] is False
    assert "id" in data
    assert isinstance(data["id"], int)
    assert data["id"] >= 1
    assert "org_id" in data
    assert "created_at" in data


def test_create_template_minimal(client):
    """POST /api/templates with only required fields succeeds."""
    token = _register_and_get_token(client, email="minimal@test.de")

    resp = client.post("/api/templates", json={"name": "Minimal"}, headers=_auth(token))
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["name"] == "Minimal"
    assert data["primary_color"] == "#14b8a6"   # default
    assert data["payment_terms_days"] == 14       # default
    assert data["default_vat_rate"] == "19"       # default
    assert data["is_default"] is False
    assert data["bank_iban"] is None
    assert data["footer_text"] is None


def test_create_template_invalid_color_rejected(client):
    """POST /api/templates rejects an invalid hex color."""
    token = _register_and_get_token(client, email="color@test.de")

    resp = client.post(
        "/api/templates",
        json={"name": "Bad Color", "primary_color": "red"},
        headers=_auth(token),
    )
    assert resp.status_code == 422


def test_create_template_missing_name_rejected(client):
    """POST /api/templates without a name returns 422."""
    token = _register_and_get_token(client, email="noname@test.de")
    resp = client.post("/api/templates", json={}, headers=_auth(token))
    assert resp.status_code == 422


def test_create_template_unauthenticated_rejected(client):
    """POST /api/templates without auth returns 401."""
    resp = client.post("/api/templates", json={"name": "X"})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# test_list_templates
# ---------------------------------------------------------------------------

def test_list_templates_empty(client):
    """GET /api/templates returns empty list when no templates exist."""
    token = _register_and_get_token(client, email="list_empty@test.de")

    resp = client.get("/api/templates", headers=_auth(token))
    assert resp.status_code == 200, resp.text
    assert resp.json() == []


def test_list_templates_returns_created(client):
    """GET /api/templates returns templates belonging to the org."""
    token = _register_and_get_token(client, email="list_created@test.de")

    client.post("/api/templates", json={"name": "Vorlage A"}, headers=_auth(token))
    client.post("/api/templates", json={"name": "Vorlage B"}, headers=_auth(token))

    resp = client.get("/api/templates", headers=_auth(token))
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert len(data) == 2
    names = {t["name"] for t in data}
    assert "Vorlage A" in names
    assert "Vorlage B" in names


def test_list_templates_unauthenticated_rejected(client):
    """GET /api/templates without auth returns 401."""
    resp = client.get("/api/templates")
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# test_update_template
# ---------------------------------------------------------------------------

def test_update_template_name(client):
    """PUT /api/templates/{id} updates the name."""
    token = _register_and_get_token(client, email="update_name@test.de")
    create_resp = client.post("/api/templates", json={"name": "Alt"}, headers=_auth(token))
    tmpl_id = create_resp.json()["id"]

    resp = client.put(
        f"/api/templates/{tmpl_id}",
        json={"name": "Neu"},
        headers=_auth(token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["name"] == "Neu"


def test_update_template_color(client):
    """PUT /api/templates/{id} updates primary_color."""
    token = _register_and_get_token(client, email="update_color@test.de")
    create_resp = client.post("/api/templates", json={"name": "Farbe"}, headers=_auth(token))
    tmpl_id = create_resp.json()["id"]

    resp = client.put(
        f"/api/templates/{tmpl_id}",
        json={"primary_color": "#ff6600"},
        headers=_auth(token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["primary_color"] == "#ff6600"


def test_update_template_payment_terms(client):
    """PUT /api/templates/{id} updates payment_terms_days."""
    token = _register_and_get_token(client, email="update_terms@test.de")
    create_resp = client.post("/api/templates", json={"name": "Zahlungsziel"}, headers=_auth(token))
    tmpl_id = create_resp.json()["id"]

    resp = client.put(
        f"/api/templates/{tmpl_id}",
        json={"payment_terms_days": 30},
        headers=_auth(token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["payment_terms_days"] == 30


def test_update_template_nonexistent_returns_404(client):
    """PUT /api/templates/{id} for non-existent template returns 404."""
    token = _register_and_get_token(client, email="update_404@test.de")
    resp = client.put(
        "/api/templates/99999",
        json={"name": "Geist"},
        headers=_auth(token),
    )
    assert resp.status_code == 404


def test_update_template_unauthenticated_rejected(client):
    """PUT /api/templates/{id} without auth returns 401."""
    resp = client.put("/api/templates/1", json={"name": "X"})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# test_delete_template
# ---------------------------------------------------------------------------

def test_delete_template(client):
    """DELETE /api/templates/{id} removes the template."""
    token = _register_and_get_token(client, email="delete@test.de")
    create_resp = client.post("/api/templates", json={"name": "Zu loeschen"}, headers=_auth(token))
    tmpl_id = create_resp.json()["id"]

    del_resp = client.delete(f"/api/templates/{tmpl_id}", headers=_auth(token))
    assert del_resp.status_code == 200, del_resp.text
    data = del_resp.json()
    assert data["message"] == "Vorlage geloescht"
    assert data["template_id"] == tmpl_id


def test_delete_template_no_longer_in_list(client):
    """After DELETE, template no longer appears in list."""
    token = _register_and_get_token(client, email="delete_list@test.de")
    create_resp = client.post("/api/templates", json={"name": "Weg"}, headers=_auth(token))
    tmpl_id = create_resp.json()["id"]

    client.delete(f"/api/templates/{tmpl_id}", headers=_auth(token))
    list_resp = client.get("/api/templates", headers=_auth(token))
    ids = [t["id"] for t in list_resp.json()]
    assert tmpl_id not in ids


def test_delete_template_nonexistent_returns_404(client):
    """DELETE /api/templates/{id} for non-existent template returns 404."""
    token = _register_and_get_token(client, email="delete_404@test.de")
    resp = client.delete("/api/templates/99999", headers=_auth(token))
    assert resp.status_code == 404


def test_delete_sole_default_template_returns_409(client):
    """Cannot delete the only template if it is also the default."""
    token = _register_and_get_token(client, email="delete_default@test.de")
    create_resp = client.post(
        "/api/templates",
        json={"name": "Einzige Standard-Vorlage", "is_default": True},
        headers=_auth(token),
    )
    tmpl_id = create_resp.json()["id"]

    resp = client.delete(f"/api/templates/{tmpl_id}", headers=_auth(token))
    assert resp.status_code == 409


def test_delete_non_default_template_succeeds_even_if_only_template(client):
    """A non-default template can be deleted even if it is the only one."""
    token = _register_and_get_token(client, email="delete_nondefault@test.de")
    create_resp = client.post(
        "/api/templates",
        json={"name": "Nur eine, kein Default", "is_default": False},
        headers=_auth(token),
    )
    tmpl_id = create_resp.json()["id"]

    resp = client.delete(f"/api/templates/{tmpl_id}", headers=_auth(token))
    assert resp.status_code == 200


def test_delete_template_unauthenticated_rejected(client):
    """DELETE /api/templates/{id} without auth returns 401."""
    resp = client.delete("/api/templates/1")
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# test_set_default_unsets_others
# ---------------------------------------------------------------------------

def test_set_default_unsets_others_on_create(client):
    """Creating a template with is_default=True unsets all other defaults."""
    token = _register_and_get_token(client, email="default_create@test.de")

    # Create first template as default
    resp_a = client.post(
        "/api/templates",
        json={"name": "Vorlage A", "is_default": True},
        headers=_auth(token),
    )
    assert resp_a.json()["is_default"] is True
    id_a = resp_a.json()["id"]

    # Create second template as default — should unset A
    resp_b = client.post(
        "/api/templates",
        json={"name": "Vorlage B", "is_default": True},
        headers=_auth(token),
    )
    assert resp_b.json()["is_default"] is True
    id_b = resp_b.json()["id"]

    # Verify A is no longer default
    resp_a_check = client.get(f"/api/templates/{id_a}", headers=_auth(token))
    assert resp_a_check.json()["is_default"] is False

    # Verify B is the only default
    resp_b_check = client.get(f"/api/templates/{id_b}", headers=_auth(token))
    assert resp_b_check.json()["is_default"] is True


def test_set_default_unsets_others_on_update(client):
    """Updating a template with is_default=True unsets all other defaults."""
    token = _register_and_get_token(client, email="default_update@test.de")

    # Create A as default, B as non-default
    id_a = client.post(
        "/api/templates",
        json={"name": "Vorlage A", "is_default": True},
        headers=_auth(token),
    ).json()["id"]
    id_b = client.post(
        "/api/templates",
        json={"name": "Vorlage B", "is_default": False},
        headers=_auth(token),
    ).json()["id"]

    # Update B to become the default
    client.put(
        f"/api/templates/{id_b}",
        json={"is_default": True},
        headers=_auth(token),
    )

    # A should now be non-default
    a_data = client.get(f"/api/templates/{id_a}", headers=_auth(token)).json()
    assert a_data["is_default"] is False

    # B should be default
    b_data = client.get(f"/api/templates/{id_b}", headers=_auth(token)).json()
    assert b_data["is_default"] is True


def test_only_one_default_at_a_time(client):
    """At most one template per org is marked is_default."""
    token = _register_and_get_token(client, email="one_default@test.de")

    # Create three templates, all as default (each creation should unset prior)
    for i in range(3):
        client.post(
            "/api/templates",
            json={"name": f"Vorlage {i}", "is_default": True},
            headers=_auth(token),
        )

    list_resp = client.get("/api/templates", headers=_auth(token))
    templates = list_resp.json()
    defaults = [t for t in templates if t["is_default"]]
    assert len(defaults) == 1


# ---------------------------------------------------------------------------
# Cross-org isolation
# ---------------------------------------------------------------------------

def test_cross_org_isolation_list(client):
    """Org B cannot see templates belonging to Org A."""
    token_a = _register_and_get_token(client, email="org_a@test.de", org_name="Org A GmbH")
    token_b = _register_and_get_token(client, email="org_b@test.de", org_name="Org B GmbH")

    client.post("/api/templates", json={"name": "Vorlage von A"}, headers=_auth(token_a))

    resp_b = client.get("/api/templates", headers=_auth(token_b))
    assert resp_b.status_code == 200
    assert resp_b.json() == []


def test_cross_org_isolation_get(client):
    """Org B cannot retrieve a single template belonging to Org A."""
    token_a = _register_and_get_token(client, email="org_a_get@test.de", org_name="Org A Get")
    token_b = _register_and_get_token(client, email="org_b_get@test.de", org_name="Org B Get")

    tmpl_id = client.post(
        "/api/templates",
        json={"name": "Privat von A"},
        headers=_auth(token_a),
    ).json()["id"]

    resp = client.get(f"/api/templates/{tmpl_id}", headers=_auth(token_b))
    assert resp.status_code == 404


def test_cross_org_isolation_delete(client):
    """Org B cannot delete templates belonging to Org A."""
    token_a = _register_and_get_token(client, email="org_a_del@test.de", org_name="Org A Del")
    token_b = _register_and_get_token(client, email="org_b_del@test.de", org_name="Org B Del")

    tmpl_id = client.post(
        "/api/templates",
        json={"name": "Org A Vorlage"},
        headers=_auth(token_a),
    ).json()["id"]

    resp = client.delete(f"/api/templates/{tmpl_id}", headers=_auth(token_b))
    assert resp.status_code == 404
