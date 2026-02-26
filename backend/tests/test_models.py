"""Tests for User and Organization models."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.models import Base, User, Organization, OrganizationMember, Invoice


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    with Session(engine) as session:
        yield session
    Base.metadata.drop_all(bind=engine)


class TestOrganization:
    def test_create_organization(self, db):
        org = Organization(name="Test GmbH", slug="test-gmbh", vat_id="DE123456789")
        db.add(org)
        db.commit()
        db.refresh(org)
        assert org.id is not None
        assert org.slug == "test-gmbh"
        assert org.plan == "free"

    def test_organization_slug_unique(self, db):
        org1 = Organization(name="A", slug="same-slug")
        org2 = Organization(name="B", slug="same-slug")
        db.add(org1)
        db.commit()
        db.add(org2)
        with pytest.raises(Exception):
            db.commit()


class TestUser:
    def test_create_user(self, db):
        user = User(email="test@example.com", hashed_password="hashed", full_name="Max Mustermann")
        db.add(user)
        db.commit()
        db.refresh(user)
        assert user.id is not None
        assert user.email == "test@example.com"
        assert user.is_active is True

    def test_user_email_unique(self, db):
        u1 = User(email="same@example.com", hashed_password="h1")
        u2 = User(email="same@example.com", hashed_password="h2")
        db.add(u1)
        db.commit()
        db.add(u2)
        with pytest.raises(Exception):
            db.commit()


class TestOrganizationMember:
    def test_add_member_to_org(self, db):
        org = Organization(name="Org", slug="org")
        user = User(email="u@test.de", hashed_password="h")
        db.add_all([org, user])
        db.commit()
        member = OrganizationMember(user_id=user.id, organization_id=org.id, role="owner")
        db.add(member)
        db.commit()
        assert member.role == "owner"


class TestInvoiceOrgRelation:
    def test_invoice_has_organization_id(self, db):
        org = Organization(name="Org", slug="org")
        db.add(org)
        db.commit()
        invoice = Invoice(invoice_number="INV-001", seller_name="Seller", buyer_name="Buyer", organization_id=org.id)
        db.add(invoice)
        db.commit()
        assert invoice.organization_id == org.id

    def test_invoice_without_org_still_works(self, db):
        invoice = Invoice(invoice_number="INV-002", seller_name="Seller", buyer_name="Buyer")
        db.add(invoice)
        db.commit()
        assert invoice.organization_id is None
