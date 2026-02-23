"""
Integration tests for the recurring invoices API endpoints.

Tests exercise the full stack: HTTP → FastAPI → SQLAlchemy → in-memory SQLite.
Deckt CRUD-Operationen für wiederkehrende Rechnungsvorlagen sowie die
manuelle Auslösung (trigger) ab.
"""
import pytest


# ---------------------------------------------------------------------------
# Shared test data
# ---------------------------------------------------------------------------

LINE_ITEMS = [
    {
        "description": "Monatliche Servicepauschale",
        "quantity": 1.0,
        "unit_price": 500.0,
        "net_amount": 500.0,
        "tax_rate": 19.0,
    }
]


@pytest.fixture()
def sample_recurring_data() -> dict:
    """Minimale gültige Payload für eine Rechnungsvorlage."""
    return {
        "name": "Monatliche Beratung",
        "frequency": "monthly",
        "next_date": "2026-03-01",
        "number_prefix": "RE",
        "payment_days": 14,
        "seller_name": "Musterfirma GmbH",
        "seller_vat_id": "DE123456789",
        "seller_address": "Musterstraße 1, 60311 Frankfurt",
        "buyer_name": "Käufer AG",
        "buyer_vat_id": "DE987654321",
        "buyer_address": "Hauptstraße 5, 10115 Berlin",
        "line_items": LINE_ITEMS,
        "tax_rate": 19.0,
        "currency": "EUR",
        "iban": "DE89370400440532013000",
        "bic": "COBADEFFXXX",
        "payment_account_name": "Musterfirma GmbH",
    }


@pytest.fixture()
def created_template(client, sample_recurring_data) -> dict:
    """Vorlage bereits in der Datenbank angelegt."""
    resp = client.post("/api/recurring", json=sample_recurring_data)
    assert resp.status_code == 201
    return resp.json()


# ---------------------------------------------------------------------------
# GET /api/recurring — leere Liste
# ---------------------------------------------------------------------------

class TestListRecurringEmpty:
    """GET /api/recurring bei leerer Datenbank."""

    def test_empty_list_returns_200(self, client):
        resp = client.get("/api/recurring")
        assert resp.status_code == 200

    def test_empty_list_structure(self, client):
        data = client.get("/api/recurring").json()
        assert data["total"] == 0
        assert data["items"] == []
        assert data["skip"] == 0
        assert data["limit"] == 50


# ---------------------------------------------------------------------------
# POST /api/recurring — Vorlage anlegen
# ---------------------------------------------------------------------------

class TestCreateRecurring:
    """POST /api/recurring"""

    def test_create_returns_201(self, client, sample_recurring_data):
        resp = client.post("/api/recurring", json=sample_recurring_data)
        assert resp.status_code == 201

    def test_create_returns_correct_fields(self, client, sample_recurring_data):
        data = client.post("/api/recurring", json=sample_recurring_data).json()
        assert data["name"] == "Monatliche Beratung"
        assert data["frequency"] == "monthly"
        assert data["next_date"] == "2026-03-01"
        assert data["seller_name"] == "Musterfirma GmbH"
        assert data["buyer_name"] == "Käufer AG"
        assert data["currency"] == "EUR"
        assert data["tax_rate"] == 19.0
        assert data["active"] is True

    def test_create_assigns_template_id(self, client, sample_recurring_data):
        data = client.post("/api/recurring", json=sample_recurring_data).json()
        assert "template_id" in data
        assert data["template_id"].startswith("tmpl-")

    def test_create_assigns_integer_id(self, client, sample_recurring_data):
        data = client.post("/api/recurring", json=sample_recurring_data).json()
        assert isinstance(data["id"], int)
        assert data["id"] >= 1

    def test_create_computes_net_amount(self, client, sample_recurring_data):
        data = client.post("/api/recurring", json=sample_recurring_data).json()
        assert data["net_amount"] == 500.0

    def test_create_multi_line_items(self, client, sample_recurring_data):
        sample_recurring_data["line_items"] = [
            {"description": "A", "quantity": 2, "unit_price": 100.0, "net_amount": 200.0, "tax_rate": 19},
            {"description": "B", "quantity": 1, "unit_price": 300.0, "net_amount": 300.0, "tax_rate": 19},
        ]
        data = client.post("/api/recurring", json=sample_recurring_data).json()
        assert data["net_amount"] == 500.0

    def test_create_all_frequencies(self, client, sample_recurring_data):
        """Alle gültigen Frequenzwerte werden akzeptiert."""
        for freq in ("monthly", "quarterly", "half-yearly", "yearly"):
            payload = {**sample_recurring_data, "frequency": freq}
            # vat_id bleibt gleich — kein Unique-Constraint auf recurring_invoices
            resp = client.post("/api/recurring", json=payload)
            assert resp.status_code == 201, f"Frequenz {freq!r} wurde abgelehnt"

    def test_create_invalid_frequency_returns_422(self, client, sample_recurring_data):
        sample_recurring_data["frequency"] = "weekly"
        resp = client.post("/api/recurring", json=sample_recurring_data)
        assert resp.status_code == 422

    def test_create_empty_line_items_returns_422(self, client, sample_recurring_data):
        sample_recurring_data["line_items"] = []
        resp = client.post("/api/recurring", json=sample_recurring_data)
        assert resp.status_code == 422

    def test_create_invalid_currency_returns_422(self, client, sample_recurring_data):
        sample_recurring_data["currency"] = "euro"
        resp = client.post("/api/recurring", json=sample_recurring_data)
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# GET /api/recurring — Liste nach Anlegen
# ---------------------------------------------------------------------------

class TestListRecurringWithData:
    """GET /api/recurring nach Anlegen von Vorlagen."""

    def test_list_contains_created_template(self, client, created_template):
        data = client.get("/api/recurring").json()
        assert data["total"] == 1
        assert data["items"][0]["template_id"] == created_template["template_id"]

    def test_list_pagination(self, client, sample_recurring_data):
        for i in range(3):
            payload = {**sample_recurring_data, "name": f"Vorlage {i}"}
            client.post("/api/recurring", json=payload)
        data = client.get("/api/recurring?skip=1&limit=1").json()
        assert data["total"] == 3
        assert len(data["items"]) == 1
        assert data["skip"] == 1
        assert data["limit"] == 1


# ---------------------------------------------------------------------------
# GET /api/recurring/{template_id} — Einzelabruf
# ---------------------------------------------------------------------------

class TestGetRecurring:
    """GET /api/recurring/{template_id}"""

    def test_get_existing_template(self, client, created_template):
        template_id = created_template["template_id"]
        resp = client.get(f"/api/recurring/{template_id}")
        assert resp.status_code == 200
        assert resp.json()["template_id"] == template_id

    def test_get_returns_line_items(self, client, created_template):
        template_id = created_template["template_id"]
        data = client.get(f"/api/recurring/{template_id}").json()
        assert isinstance(data["line_items"], list)
        assert len(data["line_items"]) == 1
        assert data["line_items"][0]["description"] == "Monatliche Servicepauschale"

    def test_get_nonexistent_returns_404(self, client):
        resp = client.get("/api/recurring/tmpl-doesnotexist")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# PUT /api/recurring/{template_id} — Aktualisieren
# ---------------------------------------------------------------------------

class TestUpdateRecurring:
    """PUT /api/recurring/{template_id}"""

    def test_update_name(self, client, created_template):
        template_id = created_template["template_id"]
        resp = client.put(f"/api/recurring/{template_id}", json={"name": "Neuer Name"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "Neuer Name"

    def test_update_frequency(self, client, created_template):
        template_id = created_template["template_id"]
        resp = client.put(f"/api/recurring/{template_id}", json={"frequency": "quarterly"})
        assert resp.status_code == 200
        assert resp.json()["frequency"] == "quarterly"

    def test_update_payment_days(self, client, created_template):
        template_id = created_template["template_id"]
        resp = client.put(f"/api/recurring/{template_id}", json={"payment_days": 30})
        assert resp.status_code == 200
        assert resp.json()["payment_days"] == 30

    def test_update_line_items(self, client, created_template):
        template_id = created_template["template_id"]
        new_items = [
            {"description": "Neue Leistung", "quantity": 2, "unit_price": 250.0, "net_amount": 500.0, "tax_rate": 19}
        ]
        resp = client.put(f"/api/recurring/{template_id}", json={"line_items": new_items})
        assert resp.status_code == 200
        data = resp.json()
        assert data["line_items"][0]["description"] == "Neue Leistung"
        assert data["net_amount"] == 500.0

    def test_update_nonexistent_returns_404(self, client):
        resp = client.put("/api/recurring/tmpl-doesnotexist", json={"name": "Geist"})
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/recurring/{template_id}/toggle — Aktiv/Inaktiv wechseln
# ---------------------------------------------------------------------------

class TestToggleRecurring:
    """POST /api/recurring/{template_id}/toggle"""

    def test_toggle_deactivates_active_template(self, client, created_template):
        template_id = created_template["template_id"]
        assert created_template["active"] is True

        resp = client.post(f"/api/recurring/{template_id}/toggle")
        assert resp.status_code == 200
        assert resp.json()["active"] is False

    def test_toggle_twice_reactivates(self, client, created_template):
        template_id = created_template["template_id"]

        client.post(f"/api/recurring/{template_id}/toggle")  # → False
        resp = client.post(f"/api/recurring/{template_id}/toggle")  # → True
        assert resp.status_code == 200
        assert resp.json()["active"] is True

    def test_toggle_nonexistent_returns_404(self, client):
        resp = client.post("/api/recurring/tmpl-doesnotexist/toggle")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/recurring/{template_id}/trigger — Rechnung generieren
# ---------------------------------------------------------------------------

class TestTriggerRecurring:
    """POST /api/recurring/{template_id}/trigger"""

    def test_trigger_returns_200(self, client, created_template):
        template_id = created_template["template_id"]
        resp = client.post(f"/api/recurring/{template_id}/trigger")
        assert resp.status_code == 200

    def test_trigger_returns_invoice_id(self, client, created_template):
        template_id = created_template["template_id"]
        data = client.post(f"/api/recurring/{template_id}/trigger").json()
        assert "invoice_id" in data
        assert data["invoice_id"].startswith("INV-")

    def test_trigger_returns_invoice_number(self, client, created_template):
        template_id = created_template["template_id"]
        data = client.post(f"/api/recurring/{template_id}/trigger").json()
        assert "invoice_number" in data
        assert isinstance(data["invoice_number"], str)

    def test_trigger_returns_gross_amount(self, client, created_template):
        template_id = created_template["template_id"]
        data = client.post(f"/api/recurring/{template_id}/trigger").json()
        # net=500, tax=19%, gross=595
        assert "gross_amount" in data
        assert data["gross_amount"] == pytest.approx(595.0)

    def test_trigger_returns_next_date(self, client, created_template):
        template_id = created_template["template_id"]
        data = client.post(f"/api/recurring/{template_id}/trigger").json()
        assert "next_date" in data
        assert isinstance(data["next_date"], str)

    def test_trigger_creates_invoice_in_db(self, client, created_template):
        """Die generierte Rechnung muss über /api/invoices abrufbar sein."""
        template_id = created_template["template_id"]
        trigger_data = client.post(f"/api/recurring/{template_id}/trigger").json()
        invoice_id = trigger_data["invoice_id"]

        resp = client.get(f"/api/invoices/{invoice_id}")
        assert resp.status_code == 200
        inv = resp.json()
        assert inv["source_type"] == "recurring"
        assert inv["invoice_id"] == invoice_id

    def test_trigger_updates_last_generated(self, client, created_template):
        """last_generated der Vorlage wird nach dem Trigger gesetzt."""
        template_id = created_template["template_id"]
        assert created_template["last_generated"] is None

        client.post(f"/api/recurring/{template_id}/trigger")

        updated = client.get(f"/api/recurring/{template_id}").json()
        assert updated["last_generated"] is not None

    def test_trigger_advances_next_date(self, client, created_template):
        """next_date wird nach dem Trigger weitergeschoben."""
        template_id = created_template["template_id"]
        original_next = created_template["next_date"]

        client.post(f"/api/recurring/{template_id}/trigger")

        updated = client.get(f"/api/recurring/{template_id}").json()
        assert updated["next_date"] != original_next

    def test_trigger_nonexistent_returns_404(self, client):
        resp = client.post("/api/recurring/tmpl-doesnotexist/trigger")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /api/recurring/{template_id} — Löschen
# ---------------------------------------------------------------------------

class TestDeleteRecurring:
    """DELETE /api/recurring/{template_id}"""

    def test_delete_returns_200(self, client, created_template):
        template_id = created_template["template_id"]
        resp = client.delete(f"/api/recurring/{template_id}")
        assert resp.status_code == 200

    def test_delete_response_message(self, client, created_template):
        template_id = created_template["template_id"]
        data = client.delete(f"/api/recurring/{template_id}").json()
        assert data["message"] == "Vorlage gelöscht"
        assert data["template_id"] == template_id

    def test_deleted_template_not_in_list(self, client, created_template):
        template_id = created_template["template_id"]
        client.delete(f"/api/recurring/{template_id}")
        data = client.get("/api/recurring").json()
        ids = [t["template_id"] for t in data["items"]]
        assert template_id not in ids

    def test_deleted_template_get_returns_404(self, client, created_template):
        template_id = created_template["template_id"]
        client.delete(f"/api/recurring/{template_id}")
        resp = client.get(f"/api/recurring/{template_id}")
        assert resp.status_code == 404

    def test_delete_nonexistent_returns_404(self, client):
        resp = client.delete("/api/recurring/tmpl-doesnotexist")
        assert resp.status_code == 404
