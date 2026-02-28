"""Tests for Phase 11 DB models: PushSubscription and GdprDeleteRequest."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.models import Base, GdprDeleteRequest, PushSubscription


@pytest.fixture(scope="module")
def in_memory_engine():
    """SQLite in-memory engine for DDL tests."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)


def test_models_create_without_error(in_memory_engine):
    """ORM mapper config + DDL must succeed — catches backref/mapper conflicts."""
    assert in_memory_engine is not None


def test_push_subscription_model_columns():
    cols = {c.name for c in PushSubscription.__table__.columns}
    assert "fcm_token" in cols
    assert "user_id" in cols
    assert "organization_id" in cols
    assert "device_label" in cols
    assert "created_at" in cols


def test_gdpr_delete_request_model_columns():
    cols = {c.name for c in GdprDeleteRequest.__table__.columns}
    assert "token" in cols
    assert "user_id" in cols
    assert "expires_at" in cols
    assert "created_at" in cols


def test_gdpr_token_column_is_not_nullable():
    col = GdprDeleteRequest.__table__.c.token
    assert col.nullable is False, "token must be NOT NULL"


def test_gdpr_expires_at_is_not_nullable():
    col = GdprDeleteRequest.__table__.c.expires_at
    assert col.nullable is False, "expires_at must be NOT NULL"


def test_push_fcm_token_is_not_nullable():
    col = PushSubscription.__table__.c.fcm_token
    assert col.nullable is False, "fcm_token must be NOT NULL"
