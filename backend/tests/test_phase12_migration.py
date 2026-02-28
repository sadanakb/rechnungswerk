"""Tests for Phase 12 model additions."""
import pytest
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import Base, Organization, PortalPaymentIntent


def _engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    return engine


def test_organization_has_connect_fields():
    engine = _engine()
    insp = inspect(engine)
    cols = {c["name"] for c in insp.get_columns("organizations")}
    assert "stripe_connect_account_id" in cols
    assert "stripe_connect_onboarded" in cols
    assert "paypal_link" in cols
    engine.dispose()


def test_portal_payment_intents_table_exists():
    engine = _engine()
    insp = inspect(engine)
    assert "portal_payment_intents" in insp.get_table_names()
    cols = {c["name"] for c in insp.get_columns("portal_payment_intents")}
    for col in ("id", "invoice_id", "share_link_id", "stripe_intent_id",
                "amount_cents", "fee_cents", "status", "created_at", "updated_at"):
        assert col in cols, f"Missing column: {col}"
    engine.dispose()


def test_portal_payment_intent_can_be_created():
    """PortalPaymentIntent can be persisted with valid parent references."""
    from app.models import Invoice, InvoiceShareLink, Organization, OrganizationMember
    from datetime import datetime, timezone, timedelta
    import uuid

    engine = _engine()
    Session = sessionmaker(bind=engine)
    session = Session()

    # Create parent rows
    org = Organization(name="Test", slug=f"test-{uuid.uuid4().hex[:8]}")
    session.add(org)
    session.flush()

    invoice = Invoice(
        invoice_number="TEST-001",
        organization_id=org.id,
        gross_amount=119.00,
        net_amount=100.00,
        tax_amount=19.00,
        tax_rate=19,
        currency="EUR",
        payment_status="unpaid",
    )
    session.add(invoice)
    session.flush()

    link = InvoiceShareLink(
        invoice_id=invoice.id,
        token=str(uuid.uuid4()),
        created_by_user_id=1,
        access_count=0,
    )
    session.add(link)
    session.flush()

    ppi = PortalPaymentIntent(
        invoice_id=invoice.id,
        share_link_id=link.id,
        stripe_intent_id="pi_test_valid_001",
        amount_cents=11900,
        fee_cents=60,
        status="created",
    )
    session.add(ppi)
    session.commit()
    assert ppi.id is not None
    assert ppi.stripe_intent_id == "pi_test_valid_001"
    session.close()
    engine.dispose()


def test_organization_connect_onboarded_defaults_false():
    """stripe_connect_onboarded defaults to False at the Python/ORM level."""
    engine = _engine()
    Session = sessionmaker(bind=engine)
    session = Session()
    org = Organization(
        name="Test Org",
        slug="test-org-connect",
    )
    session.add(org)
    session.commit()
    assert org.stripe_connect_onboarded is False
    session.close()
    engine.dispose()
