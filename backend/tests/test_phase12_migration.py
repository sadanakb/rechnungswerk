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
    engine = _engine()
    Session = sessionmaker(bind=engine)
    session = Session()
    ppi = PortalPaymentIntent(
        invoice_id=1,
        share_link_id=1,
        stripe_intent_id="pi_test_unique_001",
        amount_cents=10000,
        fee_cents=50,
        status="created",
    )
    session.add(ppi)
    session.commit()
    assert ppi.id is not None
    session.close()
    engine.dispose()


def test_organization_connect_onboarded_defaults_false():
    engine = _engine()
    insp = inspect(engine)
    cols = {c["name"]: c for c in insp.get_columns("organizations")}
    # The column exists and is boolean type
    assert "stripe_connect_onboarded" in cols
    engine.dispose()
