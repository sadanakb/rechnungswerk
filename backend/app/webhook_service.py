"""
Outbound Webhook Service — publish events to subscriber URLs.

Provides:
- generate_webhook_secret()  — create a fresh whsec_... token
- sign_payload()             — HMAC-SHA256 signature helper
- publish_event()            — fan-out to all matching subscriptions
- _deliver()                 — single delivery attempt with logging
"""
import hashlib
import hmac
import json
import secrets
from datetime import datetime, timezone

import httpx

from app.models import WebhookSubscription, WebhookDelivery

WEBHOOK_EVENTS = [
    "invoice.created",
    "invoice.deleted",
    "invoice.exported",
    "mahnung.sent",
    "supplier.created",
]


def generate_webhook_secret() -> str:
    """Return a URL-safe random secret prefixed with 'whsec_'."""
    return f"whsec_{secrets.token_urlsafe(32)}"


def sign_payload(secret: str, payload: str) -> str:
    """Generate HMAC-SHA256 hex digest for the given payload string."""
    return hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()


def publish_event(db, org_id: int, event_type: str, payload: dict):
    """
    Fan-out an event to all active subscriptions for this org that
    include *event_type* in their events list.
    """
    subscriptions = (
        db.query(WebhookSubscription)
        .filter(
            WebhookSubscription.org_id == org_id,
            WebhookSubscription.is_active == True,  # noqa: E712
        )
        .all()
    )

    for sub in subscriptions:
        # Filter by subscribed event types (JSON list stored in DB)
        subscribed = sub.events or []
        if event_type in subscribed:
            _deliver(db, sub, event_type, payload)


def _deliver(db, subscription: WebhookSubscription, event_type: str, payload: dict):
    """
    Attempt a single HTTP POST delivery to the subscription URL.
    Records a WebhookDelivery row with the outcome.
    """
    now = datetime.now(timezone.utc)
    body = json.dumps(
        {
            "event": event_type,
            "data": payload,
            "timestamp": now.isoformat(),
        }
    )
    sig = sign_payload(subscription.secret, body)

    delivery = WebhookDelivery(
        subscription_id=subscription.id,
        event_type=event_type,
        payload=payload,
        status="pending",
        attempts=1,
        last_attempted_at=now,
    )
    db.add(delivery)

    try:
        resp = httpx.post(
            subscription.url,
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-RechnungsWerk-Signature": f"sha256={sig}",
                "X-RechnungsWerk-Event": event_type,
            },
            timeout=5.0,
        )
        delivery.status = "success" if resp.status_code < 300 else "failed"
        delivery.response_code = resp.status_code
        delivery.response_body = resp.text[:500]
    except Exception as exc:
        delivery.status = "failed"
        delivery.response_body = str(exc)[:500]

    db.commit()
