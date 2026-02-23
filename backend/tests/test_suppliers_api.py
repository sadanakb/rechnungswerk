"""
Integration tests for the suppliers API endpoints.

Tests exercise the full stack: HTTP → FastAPI → SQLAlchemy → in-memory SQLite.
Deckt CRUD-Operationen und Suche für Lieferanten ab.
"""
import pytest


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def sample_supplier_data() -> dict:
    """Minimal valid supplier payload."""
    return {
        "name": "Mustermann GmbH",
        "vat_id": "DE123456789",
        "address": "Musterstraße 1, 60311 Frankfurt am Main",
        "iban": "DE89370400440532013000",
        "bic": "COBADEFFXXX",
        "email": "info@mustermann.de",
        "default_account": "4900",
        "notes": "Stammlieferant",
    }


@pytest.fixture()
def created_supplier(client, sample_supplier_data) -> dict:
    """Lieferant bereits in der Datenbank angelegt."""
    resp = client.post("/api/suppliers", json=sample_supplier_data)
    assert resp.status_code == 201
    return resp.json()


# ---------------------------------------------------------------------------
# GET /api/suppliers — leere Liste
# ---------------------------------------------------------------------------

class TestListSuppliersEmpty:
    """GET /api/suppliers bei leerer Datenbank."""

    def test_empty_list_returns_200(self, client):
        resp = client.get("/api/suppliers")
        assert resp.status_code == 200

    def test_empty_list_structure(self, client):
        data = client.get("/api/suppliers").json()
        assert data["total"] == 0
        assert data["items"] == []
        assert data["skip"] == 0
        assert data["limit"] == 50


# ---------------------------------------------------------------------------
# POST /api/suppliers — Lieferant anlegen
# ---------------------------------------------------------------------------

class TestCreateSupplier:
    """POST /api/suppliers"""

    def test_create_returns_201(self, client, sample_supplier_data):
        resp = client.post("/api/suppliers", json=sample_supplier_data)
        assert resp.status_code == 201

    def test_create_returns_correct_fields(self, client, sample_supplier_data):
        data = client.post("/api/suppliers", json=sample_supplier_data).json()
        assert data["name"] == "Mustermann GmbH"
        assert data["vat_id"] == "DE123456789"
        assert data["address"] == "Musterstraße 1, 60311 Frankfurt am Main"
        assert data["iban"] == "DE89370400440532013000"
        assert data["bic"] == "COBADEFFXXX"
        assert data["email"] == "info@mustermann.de"
        assert data["default_account"] == "4900"
        assert data["notes"] == "Stammlieferant"

    def test_create_assigns_id(self, client, sample_supplier_data):
        data = client.post("/api/suppliers", json=sample_supplier_data).json()
        assert "id" in data
        assert isinstance(data["id"], int)
        assert data["id"] >= 1

    def test_create_sets_timestamps(self, client, sample_supplier_data):
        data = client.post("/api/suppliers", json=sample_supplier_data).json()
        assert "created_at" in data
        assert data["created_at"] is not None

    def test_create_minimal_fields(self, client):
        """Nur Pflichtfelder name und vat_id."""
        resp = client.post("/api/suppliers", json={
            "name": "Minimal AG",
            "vat_id": "DE999888777",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Minimal AG"
        assert data["vat_id"] == "DE999888777"
        assert data["iban"] is None
        assert data["email"] is None

    def test_create_duplicate_vat_id_returns_409(self, client, sample_supplier_data):
        """Doppelte USt-IdNr wird mit 409 abgelehnt."""
        client.post("/api/suppliers", json=sample_supplier_data)
        resp = client.post("/api/suppliers", json=sample_supplier_data)
        assert resp.status_code == 409

    def test_create_missing_name_returns_422(self, client):
        resp = client.post("/api/suppliers", json={"vat_id": "DE111222333"})
        assert resp.status_code == 422

    def test_create_missing_vat_id_returns_422(self, client):
        resp = client.post("/api/suppliers", json={"name": "Kein VAT"})
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# GET /api/suppliers — Liste nach Anlegen
# ---------------------------------------------------------------------------

class TestListSuppliersWithData:
    """GET /api/suppliers nach Anlegen von Lieferanten."""

    def test_list_contains_created_supplier(self, client, sample_supplier_data):
        client.post("/api/suppliers", json=sample_supplier_data)
        data = client.get("/api/suppliers").json()
        assert data["total"] == 1
        assert data["items"][0]["vat_id"] == "DE123456789"

    def test_list_pagination_skip(self, client, sample_supplier_data):
        """Drei Lieferanten anlegen, skip=2 liefert nur einen."""
        vat_ids = ["DE111111111", "DE222222222", "DE333333333"]
        for i, vat in enumerate(vat_ids):
            client.post("/api/suppliers", json={
                "name": f"Firma {i}",
                "vat_id": vat,
            })
        data = client.get("/api/suppliers?skip=2&limit=10").json()
        assert data["total"] == 3
        assert len(data["items"]) == 1
        assert data["skip"] == 2

    def test_list_pagination_limit(self, client, sample_supplier_data):
        """limit=1 liefert genau einen Eintrag zurück."""
        for i, vat in enumerate(["DE444444444", "DE555555555"]):
            client.post("/api/suppliers", json={"name": f"X {i}", "vat_id": vat})
        data = client.get("/api/suppliers?limit=1").json()
        assert data["total"] == 2
        assert len(data["items"]) == 1
        assert data["limit"] == 1


# ---------------------------------------------------------------------------
# GET /api/suppliers/{id} — Einzelabruf
# ---------------------------------------------------------------------------

class TestGetSupplier:
    """GET /api/suppliers/{supplier_id}"""

    def test_get_existing_supplier(self, client, created_supplier):
        supplier_id = created_supplier["id"]
        resp = client.get(f"/api/suppliers/{supplier_id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == supplier_id

    def test_get_nonexistent_returns_404(self, client):
        resp = client.get("/api/suppliers/99999")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# PUT /api/suppliers/{id} — Aktualisieren
# ---------------------------------------------------------------------------

class TestUpdateSupplier:
    """PUT /api/suppliers/{supplier_id}"""

    def test_update_name(self, client, created_supplier):
        supplier_id = created_supplier["id"]
        resp = client.put(f"/api/suppliers/{supplier_id}", json={"name": "Neuer Name GmbH"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "Neuer Name GmbH"

    def test_update_address(self, client, created_supplier):
        supplier_id = created_supplier["id"]
        resp = client.put(
            f"/api/suppliers/{supplier_id}",
            json={"address": "Neue Straße 99, 10115 Berlin"},
        )
        assert resp.status_code == 200
        assert resp.json()["address"] == "Neue Straße 99, 10115 Berlin"

    def test_update_email(self, client, created_supplier):
        supplier_id = created_supplier["id"]
        resp = client.put(
            f"/api/suppliers/{supplier_id}",
            json={"email": "neu@example.com"},
        )
        assert resp.status_code == 200
        assert resp.json()["email"] == "neu@example.com"

    def test_update_notes(self, client, created_supplier):
        supplier_id = created_supplier["id"]
        resp = client.put(
            f"/api/suppliers/{supplier_id}",
            json={"notes": "Wichtiger Lieferant"},
        )
        assert resp.status_code == 200
        assert resp.json()["notes"] == "Wichtiger Lieferant"

    def test_update_nonexistent_returns_404(self, client):
        resp = client.put("/api/suppliers/99999", json={"name": "Geist"})
        assert resp.status_code == 404

    def test_update_vat_id_conflict_returns_409(self, client, sample_supplier_data):
        """USt-IdNr eines anderen Lieferanten kann nicht übernommen werden."""
        # Zweiten Lieferanten anlegen
        other = client.post("/api/suppliers", json={
            "name": "Anderer Lieferant",
            "vat_id": "DE777777777",
        }).json()
        first = client.post("/api/suppliers", json=sample_supplier_data).json()

        # Versuche, die USt-IdNr des zweiten Lieferanten zu übernehmen
        resp = client.put(
            f"/api/suppliers/{first['id']}",
            json={"vat_id": "DE777777777"},
        )
        assert resp.status_code == 409

    def test_update_same_vat_id_is_ok(self, client, created_supplier):
        """Gleiche USt-IdNr beim selben Lieferanten darf nicht als Konflikt gelten."""
        supplier_id = created_supplier["id"]
        resp = client.put(
            f"/api/suppliers/{supplier_id}",
            json={"vat_id": created_supplier["vat_id"]},
        )
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# DELETE /api/suppliers/{id} — Löschen
# ---------------------------------------------------------------------------

class TestDeleteSupplier:
    """DELETE /api/suppliers/{supplier_id}"""

    def test_delete_returns_200(self, client, created_supplier):
        supplier_id = created_supplier["id"]
        resp = client.delete(f"/api/suppliers/{supplier_id}")
        assert resp.status_code == 200

    def test_delete_response_message(self, client, created_supplier):
        supplier_id = created_supplier["id"]
        data = client.delete(f"/api/suppliers/{supplier_id}").json()
        assert data["message"] == "Lieferant geloescht"
        assert data["supplier_id"] == supplier_id

    def test_deleted_supplier_not_in_list(self, client, created_supplier):
        supplier_id = created_supplier["id"]
        client.delete(f"/api/suppliers/{supplier_id}")
        data = client.get("/api/suppliers").json()
        ids = [s["id"] for s in data["items"]]
        assert supplier_id not in ids

    def test_deleted_supplier_get_returns_404(self, client, created_supplier):
        supplier_id = created_supplier["id"]
        client.delete(f"/api/suppliers/{supplier_id}")
        resp = client.get(f"/api/suppliers/{supplier_id}")
        assert resp.status_code == 404

    def test_delete_nonexistent_returns_404(self, client):
        resp = client.delete("/api/suppliers/99999")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /api/suppliers/search?q= — Suche
# ---------------------------------------------------------------------------

class TestSearchSuppliers:
    """GET /api/suppliers/search"""

    @pytest.fixture(autouse=True)
    def _setup_suppliers(self, client):
        """Legt drei Lieferanten an bevor jeder Suchtest läuft."""
        client.post("/api/suppliers", json={"name": "Telekom AG", "vat_id": "DE100000001"})
        client.post("/api/suppliers", json={"name": "Vodafone GmbH", "vat_id": "DE100000002"})
        client.post("/api/suppliers", json={"name": "DHL Express", "vat_id": "DE100000003"})

    def test_search_by_name_partial_match(self, client):
        resp = client.get("/api/suppliers/search?q=Telekom")
        assert resp.status_code == 200
        results = resp.json()
        assert len(results) >= 1
        assert any(s["name"] == "Telekom AG" for s in results)

    def test_search_by_name_case_insensitive(self, client):
        resp = client.get("/api/suppliers/search?q=telekom")
        assert resp.status_code == 200
        results = resp.json()
        assert any(s["name"] == "Telekom AG" for s in results)

    def test_search_by_vat_id(self, client):
        resp = client.get("/api/suppliers/search?q=DE100000002")
        assert resp.status_code == 200
        results = resp.json()
        assert len(results) == 1
        assert results[0]["name"] == "Vodafone GmbH"

    def test_search_partial_vat_id(self, client):
        resp = client.get("/api/suppliers/search?q=DE10000")
        assert resp.status_code == 200
        results = resp.json()
        assert len(results) == 3

    def test_search_no_results(self, client):
        resp = client.get("/api/suppliers/search?q=XYZNOTEXISTENT")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_search_missing_q_returns_422(self, client):
        resp = client.get("/api/suppliers/search")
        assert resp.status_code == 422

    def test_search_respects_limit(self, client):
        resp = client.get("/api/suppliers/search?q=DE10000&limit=2")
        assert resp.status_code == 200
        assert len(resp.json()) <= 2
