"""
Webhooks router — manage outbound webhook subscriptions.

Endpoints (all under /api/webhooks, JWT-protected):
  GET    /              — list org's subscriptions
  POST   /              — create subscription (returns secret ONCE)
  DELETE /{id}          — delete (org-scoped)
  POST   /{id}/test     — send test ping event
  GET    /{id}/deliveries — delivery log (last 50)
"""
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, HttpUrl
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import OrganizationMember, WebhookDelivery, WebhookSubscription
from app.auth_jwt import get_current_user
from app.webhook_service import (
    WEBHOOK_EVENTS,
    generate_webhook_secret,
    _deliver,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class WebhookCreateRequest(BaseModel):
    url: HttpUrl
    events: List[str]


class WebhookSubscriptionResponse(BaseModel):
    id: int
    url: str
    events: List[str]
    is_active: bool
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


class WebhookCreatedResponse(WebhookSubscriptionResponse):
    """Returned only on creation — includes the secret (shown once)."""
    secret: str


class WebhookDeliveryResponse(BaseModel):
    id: int
    subscription_id: int
    event_type: str
    payload: Optional[dict]
    status: str
    attempts: int
    response_code: Optional[int]
    response_body: Optional[str]
    last_attempted_at: Optional[datetime]
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _resolve_org_id(current_user: dict, db: Session) -> int:
    """Return the org_id for the authenticated user, or raise 404."""
    member = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.user_id == int(current_user["user_id"]))
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Keine Organisation gefunden")
    return member.organization_id


def _get_subscription_or_404(
    subscription_id: int, org_id: int, db: Session
) -> WebhookSubscription:
    """Return subscription if it belongs to the org, else 404."""
    sub = (
        db.query(WebhookSubscription)
        .filter(
            WebhookSubscription.id == subscription_id,
            WebhookSubscription.org_id == org_id,
        )
        .first()
    )
    if not sub:
        raise HTTPException(status_code=404, detail="Webhook-Subscription nicht gefunden")
    return sub


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=List[WebhookSubscriptionResponse])
def list_webhooks(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all webhook subscriptions for the current organization."""
    org_id = _resolve_org_id(current_user, db)
    subs = (
        db.query(WebhookSubscription)
        .filter(WebhookSubscription.org_id == org_id)
        .all()
    )
    return subs


@router.post("", response_model=WebhookCreatedResponse, status_code=201)
def create_webhook(
    payload: WebhookCreateRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create a new webhook subscription.

    The secret is returned **only once** in this response. Store it securely.
    """
    org_id = _resolve_org_id(current_user, db)

    # Validate event names
    unknown = [e for e in payload.events if e not in WEBHOOK_EVENTS]
    if unknown:
        raise HTTPException(
            status_code=422,
            detail=f"Unbekannte Events: {unknown}. Erlaubt: {WEBHOOK_EVENTS}",
        )

    secret = generate_webhook_secret()
    sub = WebhookSubscription(
        org_id=org_id,
        url=str(payload.url),
        events=list(payload.events),
        secret=secret,
        is_active=True,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)

    return WebhookCreatedResponse(
        id=sub.id,
        url=sub.url,
        events=sub.events,
        is_active=sub.is_active,
        created_at=sub.created_at,
        secret=secret,
    )


@router.delete("/{subscription_id}", status_code=200)
def delete_webhook(
    subscription_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a webhook subscription (org-scoped)."""
    org_id = _resolve_org_id(current_user, db)
    sub = _get_subscription_or_404(subscription_id, org_id, db)
    db.delete(sub)
    db.commit()
    return {"message": "Webhook-Subscription geloescht", "id": subscription_id}


@router.post("/{subscription_id}/test", status_code=200)
def test_webhook(
    subscription_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Send a test 'ping' event to the subscription URL.
    Returns the delivery outcome immediately.
    """
    org_id = _resolve_org_id(current_user, db)
    sub = _get_subscription_or_404(subscription_id, org_id, db)

    _deliver(db, sub, "ping", {"message": "RechnungsWerk webhook test ping"})

    # Fetch the delivery we just created to return its status
    delivery = (
        db.query(WebhookDelivery)
        .filter(
            WebhookDelivery.subscription_id == sub.id,
            WebhookDelivery.event_type == "ping",
        )
        .order_by(WebhookDelivery.id.desc())
        .first()
    )

    return {
        "message": "Test-Ping gesendet",
        "status": delivery.status if delivery else "unknown",
        "response_code": delivery.response_code if delivery else None,
    }


@router.get("/{subscription_id}/deliveries", response_model=List[WebhookDeliveryResponse])
def list_deliveries(
    subscription_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the last 50 delivery attempts for a subscription."""
    org_id = _resolve_org_id(current_user, db)
    # Verify ownership
    _get_subscription_or_404(subscription_id, org_id, db)

    deliveries = (
        db.query(WebhookDelivery)
        .filter(WebhookDelivery.subscription_id == subscription_id)
        .order_by(WebhookDelivery.id.desc())
        .limit(50)
        .all()
    )
    return deliveries
