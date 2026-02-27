"""Tests for billing webhooks, subscription status, and portal endpoints."""
import json
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import Base, Organization, OrganizationMember, User
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


def register_and_get_token(client, email="billing@test.de"):
    """Register a user and return access token."""
    resp = client.post("/api/auth/register", json={
        "email": email,
        "password": "SecurePass123!",
        "full_name": "Test Billing",
        "organization_name": "Billing Org",
    })
    return resp.json()["access_token"]


def set_org_stripe_ids(db_session, email, customer_id="cus_test123", subscription_id="sub_test123"):
    """Set stripe IDs on the organization for the given user."""
    user = db_session.query(User).filter(User.email == email).first()
    member = db_session.query(OrganizationMember).filter(
        OrganizationMember.user_id == user.id
    ).first()
    org = db_session.query(Organization).filter(
        Organization.id == member.organization_id
    ).first()
    org.stripe_customer_id = customer_id
    org.stripe_subscription_id = subscription_id
    org.plan = "starter"
    org.plan_status = "active"
    db_session.commit()
    db_session.refresh(org)
    return org


def _build_webhook_event(event_type, data_object):
    """Build a mock Stripe event dict."""
    return {
        "id": "evt_test_123",
        "type": event_type,
        "data": {"object": data_object},
    }


class TestGetSubscriptionStatus:
    def test_get_subscription_status(self, client, db_session):
        """Test GET /api/billing/subscription returns plan info."""
        token = register_and_get_token(client, "sub@test.de")
        org = set_org_stripe_ids(db_session, "sub@test.de")

        with patch("app.routers.billing.stripe_service.get_subscription") as mock_get:
            mock_get.return_value = {
                "id": "sub_test123",
                "status": "active",
                "current_period_end": 1735689600,
                "current_period_start": 1733097600,
                "cancel_at_period_end": False,
                "items": [],
            }
            resp = client.get(
                "/api/billing/subscription",
                headers={"Authorization": f"Bearer {token}"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["plan"] == "starter"
        assert data["plan_status"] == "active"
        assert data["stripe_customer_id"] == "cus_test123"
        assert data["stripe_subscription_id"] == "sub_test123"
        assert data["period_end"] == 1735689600

    def test_get_subscription_free_plan(self, client, db_session):
        """Test GET /api/billing/subscription for user with no stripe IDs."""
        token = register_and_get_token(client, "free@test.de")

        resp = client.get(
            "/api/billing/subscription",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["plan"] == "free"
        assert data["plan_status"] == "active"
        assert data["stripe_customer_id"] is None
        assert data["period_end"] is None

    def test_get_subscription_without_auth(self, client):
        """Test GET /api/billing/subscription requires authentication."""
        resp = client.get("/api/billing/subscription")
        assert resp.status_code == 401


class TestPortal:
    def test_create_portal_no_customer_returns_400(self, client, db_session):
        """Test POST /api/billing/portal returns 400 if no stripe_customer_id."""
        token = register_and_get_token(client, "noportal@test.de")

        resp = client.post(
            "/api/billing/portal",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 400
        assert "Kein aktives Abonnement" in resp.json()["detail"]

    @patch("app.routers.billing.stripe_service.create_portal_session")
    def test_create_portal_success(self, mock_portal, client, db_session):
        """Test POST /api/billing/portal returns URL when customer exists."""
        mock_portal.return_value = "https://billing.stripe.com/session/test"

        token = register_and_get_token(client, "portal@test.de")
        set_org_stripe_ids(db_session, "portal@test.de")

        resp = client.post(
            "/api/billing/portal",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["url"] == "https://billing.stripe.com/session/test"
        mock_portal.assert_called_once()


class TestWebhookCheckoutCompleted:
    @patch("stripe.checkout.Session.list_line_items")
    @patch("stripe.Webhook.construct_event")
    def test_webhook_checkout_completed(self, mock_construct, mock_line_items, client, db_session):
        """Test webhook sets stripe IDs and plan on checkout.session.completed."""
        # Register a user first
        register_and_get_token(client, "checkout@test.de")

        # Mock line items
        mock_price = MagicMock()
        mock_price.id = "price_starter_monthly"
        mock_item = MagicMock()
        mock_item.price = mock_price
        mock_line_items.return_value = MagicMock(data=[mock_item])

        # Patch settings for price matching
        with patch.object(settings, "stripe_starter_price_id", "price_starter_monthly"):
            event = _build_webhook_event("checkout.session.completed", {
                "id": "cs_test_session",
                "customer_email": "checkout@test.de",
                "customer": "cus_new_123",
                "subscription": "sub_new_456",
            })
            mock_construct.return_value = event

            resp = client.post(
                "/api/billing/webhook",
                content=b'{"fake": "payload"}',
                headers={"stripe-signature": "sig_test"},
            )

        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

        # Verify the org was updated
        user = db_session.query(User).filter(User.email == "checkout@test.de").first()
        member = db_session.query(OrganizationMember).filter(
            OrganizationMember.user_id == user.id
        ).first()
        org = db_session.query(Organization).filter(
            Organization.id == member.organization_id
        ).first()
        db_session.refresh(org)

        assert org.stripe_customer_id == "cus_new_123"
        assert org.stripe_subscription_id == "sub_new_456"
        assert org.plan == "starter"
        assert org.plan_status == "active"


class TestWebhookSubscriptionCancelled:
    @patch("stripe.Webhook.construct_event")
    def test_webhook_subscription_cancelled(self, mock_construct, client, db_session):
        """Test webhook reverts plan to free on subscription deleted."""
        # Register and set up org with active subscription
        register_and_get_token(client, "cancel@test.de")
        org = set_org_stripe_ids(db_session, "cancel@test.de", "cus_cancel_123", "sub_cancel_456")

        assert org.plan == "starter"

        event = _build_webhook_event("customer.subscription.deleted", {
            "id": "sub_cancel_456",
            "customer": "cus_cancel_123",
        })
        mock_construct.return_value = event

        resp = client.post(
            "/api/billing/webhook",
            content=b'{"fake": "payload"}',
            headers={"stripe-signature": "sig_test"},
        )

        assert resp.status_code == 200

        db_session.refresh(org)
        assert org.plan == "free"
        assert org.plan_status == "cancelled"
        assert org.stripe_subscription_id is None

    @patch("stripe.Webhook.construct_event")
    def test_webhook_subscription_updated(self, mock_construct, client, db_session):
        """Test webhook updates plan_status on subscription updated."""
        register_and_get_token(client, "update@test.de")
        org = set_org_stripe_ids(db_session, "update@test.de", "cus_upd_123", "sub_upd_456")

        event = _build_webhook_event("customer.subscription.updated", {
            "id": "sub_upd_789",
            "customer": "cus_upd_123",
            "status": "past_due",
        })
        mock_construct.return_value = event

        resp = client.post(
            "/api/billing/webhook",
            content=b'{"fake": "payload"}',
            headers={"stripe-signature": "sig_test"},
        )

        assert resp.status_code == 200

        db_session.refresh(org)
        assert org.plan_status == "past_due"
        assert org.stripe_subscription_id == "sub_upd_789"

    @patch("stripe.Webhook.construct_event")
    def test_webhook_payment_failed(self, mock_construct, client, db_session):
        """Test webhook sets status to past_due on invoice.payment_failed."""
        register_and_get_token(client, "fail@test.de")
        org = set_org_stripe_ids(db_session, "fail@test.de", "cus_fail_123", "sub_fail_456")

        event = _build_webhook_event("invoice.payment_failed", {
            "id": "in_failed_789",
            "customer": "cus_fail_123",
        })
        mock_construct.return_value = event

        resp = client.post(
            "/api/billing/webhook",
            content=b'{"fake": "payload"}',
            headers={"stripe-signature": "sig_test"},
        )

        assert resp.status_code == 200

        db_session.refresh(org)
        assert org.plan_status == "past_due"


class TestWebhookSignature:
    @patch("stripe.Webhook.construct_event")
    def test_webhook_invalid_signature_rejected(self, mock_construct, client):
        """Test webhook rejects requests with invalid Stripe signature."""
        import stripe
        mock_construct.side_effect = stripe.error.SignatureVerificationError(
            "Invalid signature", "sig_test"
        )

        resp = client.post(
            "/api/billing/webhook",
            content=b'{"fake": "payload"}',
            headers={"stripe-signature": "invalid_sig"},
        )

        assert resp.status_code == 400
        assert "Invalid webhook signature" in resp.json()["detail"]

    @patch("stripe.Webhook.construct_event")
    def test_webhook_missing_signature_rejected(self, mock_construct, client):
        """Test webhook rejects requests with missing signature header."""
        mock_construct.side_effect = ValueError("No signature header")

        resp = client.post(
            "/api/billing/webhook",
            content=b'{"fake": "payload"}',
        )

        assert resp.status_code == 400
