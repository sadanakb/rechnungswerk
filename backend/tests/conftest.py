"""
Shared test fixtures for RechnungsWerk backend tests.

Uses an in-memory SQLite database so tests run fast and independently.
"""
import os
import pytest
from datetime import date
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

# Override settings BEFORE importing app modules
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["REQUIRE_API_KEY"] = "false"

from app.models import Base, Invoice
from app.database import get_db
from app.main import app


@pytest.fixture(scope="function")
def db_engine():
    """Create a fresh in-memory SQLite engine for each test."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture(scope="function")
def db_session(db_engine):
    """Provide a transactional database session that rolls back after test."""
    Session = sessionmaker(bind=db_engine)
    session = Session()
    yield session
    session.rollback()
    session.close()


@pytest.fixture(scope="function")
def client(db_session):
    """FastAPI TestClient with overridden DB dependency."""

    def _override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def sample_invoice_data() -> dict:
    """Minimal valid invoice data for creating invoices."""
    return {
        "invoice_number": "RE-2026-001",
        "invoice_date": "2026-02-23",
        "due_date": "2026-03-23",
        "seller_name": "Musterfirma GmbH",
        "seller_vat_id": "DE123456789",
        "seller_address": "Musterstraße 1, 60311 Frankfurt am Main",
        "buyer_name": "Käufer AG",
        "buyer_vat_id": "DE987654321",
        "buyer_address": "Hauptstraße 5, 10115 Berlin",
        "line_items": [
            {
                "description": "Beratungsleistung",
                "quantity": 10.0,
                "unit_price": 150.0,
                "net_amount": 1500.0,
                "tax_rate": 19.0,
            }
        ],
        "tax_rate": 19.0,
        "iban": "DE89370400440532013000",
        "bic": "COBADEFFXXX",
        "payment_account_name": "Musterfirma GmbH",
        "currency": "EUR",
    }


@pytest.fixture()
def sample_invoice_dict(sample_invoice_data) -> dict:
    """Invoice data dict as expected by XRechnungGenerator.generate_xml()."""
    net = sum(i["net_amount"] for i in sample_invoice_data["line_items"])
    tax = round(net * sample_invoice_data["tax_rate"] / 100, 2)
    gross = round(net + tax, 2)
    return {
        **sample_invoice_data,
        "net_amount": net,
        "tax_amount": tax,
        "gross_amount": gross,
    }


@pytest.fixture()
def saved_invoice(db_session, sample_invoice_dict) -> Invoice:
    """An Invoice row already persisted in the test DB."""
    import uuid

    inv = Invoice(
        invoice_id=f"INV-20260223-{uuid.uuid4().hex[:8]}",
        invoice_number=sample_invoice_dict["invoice_number"],
        invoice_date=date(2026, 2, 23),
        due_date=date(2026, 3, 23),
        seller_name=sample_invoice_dict["seller_name"],
        seller_vat_id=sample_invoice_dict["seller_vat_id"],
        seller_address=sample_invoice_dict["seller_address"],
        buyer_name=sample_invoice_dict["buyer_name"],
        buyer_vat_id=sample_invoice_dict["buyer_vat_id"],
        buyer_address=sample_invoice_dict["buyer_address"],
        net_amount=sample_invoice_dict["net_amount"],
        tax_amount=sample_invoice_dict["tax_amount"],
        gross_amount=sample_invoice_dict["gross_amount"],
        tax_rate=19.0,
        currency="EUR",
        line_items=sample_invoice_dict["line_items"],
        iban=sample_invoice_dict["iban"],
        bic=sample_invoice_dict["bic"],
        payment_account_name=sample_invoice_dict["payment_account_name"],
        source_type="manual",
        validation_status="pending",
    )
    db_session.add(inv)
    db_session.commit()
    db_session.refresh(inv)
    return inv
