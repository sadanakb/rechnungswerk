"""Tests for Mahnwesen (dunning) endpoints."""
import uuid
import pytest
from unittest.mock import patch
from datetime import date, timedelta
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import Base, Invoice
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


def _register_and_get_token(client: TestClient) -> dict:
    """Register a user and return dict with access_token and org_id."""
    resp = client.post("/api/auth/register", json={
        "email": f"mahnung-{uuid.uuid4().hex[:6]}@test.de",
        "password": "SecurePass123!",
        "full_name": "Mahnwesen Tester",
        "organization_name": "Mahnung GmbH",
    })
    assert resp.status_code == 201, f"Registration failed: {resp.text}"
    data = resp.json()
    return {
        "access_token": data["access_token"],
        "org_id": data["organization"]["id"],
    }


def _create_overdue_invoice(db_session, org_id: int) -> str:
    """Insert an overdue invoice directly into the DB and return its invoice_id."""
    invoice_id = f"INV-{date.today().strftime('%Y%m%d')}-{uuid.uuid4().hex[:8]}"
    inv = Invoice(
        invoice_id=invoice_id,
        invoice_number="RE-2026-OVERDUE",
        invoice_date=date.today() - timedelta(days=60),
        due_date=date.today() - timedelta(days=30),
        seller_name="Verkäufer GmbH",
        seller_vat_id="DE123456789",
        seller_address="Musterstraße 1, 60311 Frankfurt",
        buyer_name="Käufer AG",
        buyer_vat_id="DE987654321",
        buyer_address="Hauptstraße 5, 10115 Berlin",
        net_amount=Decimal("1000.00"),
        tax_amount=Decimal("190.00"),
        gross_amount=Decimal("1190.00"),
        tax_rate=Decimal("19.00"),
        currency="EUR",
        line_items=[{
            "description": "Beratungsleistung",
            "quantity": 1.0,
            "unit_price": 1000.0,
            "net_amount": 1000.0,
            "tax_rate": 19.0,
        }],
        iban="DE89370400440532013000",
        bic="COBADEFFXXX",
        payment_account_name="Verkäufer GmbH",
        source_type="manual",
        validation_status="pending",
        organization_id=org_id,
    )
    db_session.add(inv)
    db_session.commit()
    return invoice_id


def test_create_mahnung_for_overdue_invoice(client, db_session):
    """POST /{invoice_id}/mahnung should create a level-1 Mahnung."""
    auth = _register_and_get_token(client)
    invoice_id = _create_overdue_invoice(db_session, auth["org_id"])

    resp = client.post(
        f"/api/mahnwesen/{invoice_id}/mahnung",
        headers={"Authorization": f"Bearer {auth['access_token']}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["level"] == 1
    assert data["invoice_id"] == invoice_id
    assert data["status"] == "created"
    assert data["fee"] == 5.0
    assert data["interest"] == 0.0
    assert data["total_due"] > 0


def test_second_mahnung_increments_level(client, db_session):
    """POST twice should yield level=2 on the second call."""
    auth = _register_and_get_token(client)
    invoice_id = _create_overdue_invoice(db_session, auth["org_id"])

    headers = {"Authorization": f"Bearer {auth['access_token']}"}

    resp1 = client.post(f"/api/mahnwesen/{invoice_id}/mahnung", headers=headers)
    assert resp1.status_code == 201
    assert resp1.json()["level"] == 1

    resp2 = client.post(f"/api/mahnwesen/{invoice_id}/mahnung", headers=headers)
    assert resp2.status_code == 201
    data2 = resp2.json()
    assert data2["level"] == 2
    assert data2["fee"] == 10.0
    assert data2["interest"] > 0  # 5% interest on level 2


def test_max_three_levels(client, db_session):
    """POST 4 times: first 3 succeed, 4th returns 400."""
    auth = _register_and_get_token(client)
    invoice_id = _create_overdue_invoice(db_session, auth["org_id"])

    headers = {"Authorization": f"Bearer {auth['access_token']}"}

    for expected_level in [1, 2, 3]:
        resp = client.post(f"/api/mahnwesen/{invoice_id}/mahnung", headers=headers)
        assert resp.status_code == 201, f"Level {expected_level} failed: {resp.text}"
        assert resp.json()["level"] == expected_level

    # 4th attempt should fail
    resp4 = client.post(f"/api/mahnwesen/{invoice_id}/mahnung", headers=headers)
    assert resp4.status_code == 400
    assert "Maximale Mahnstufe" in resp4.json()["detail"]


def test_list_mahnungen_for_invoice(client, db_session):
    """GET /{invoice_id} should return list with 1 Mahnung after creating one."""
    auth = _register_and_get_token(client)
    invoice_id = _create_overdue_invoice(db_session, auth["org_id"])

    headers = {"Authorization": f"Bearer {auth['access_token']}"}

    # Create one Mahnung
    create_resp = client.post(f"/api/mahnwesen/{invoice_id}/mahnung", headers=headers)
    assert create_resp.status_code == 201

    # List Mahnungen
    resp = client.get(f"/api/mahnwesen/{invoice_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["level"] == 1
    assert data[0]["invoice_id"] == invoice_id


def test_list_all_overdue(client, db_session):
    """GET /overdue should return at least 1 overdue invoice."""
    auth = _register_and_get_token(client)
    _create_overdue_invoice(db_session, auth["org_id"])

    headers = {"Authorization": f"Bearer {auth['access_token']}"}

    resp = client.get("/api/mahnwesen/overdue", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert data[0]["days_overdue"] > 0
    assert data[0]["invoice_number"] == "RE-2026-OVERDUE"
