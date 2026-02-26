"""Billing router: Stripe checkout, webhooks, portal."""
import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.auth_jwt import get_current_user
from app.models import User, Organization, OrganizationMember
from app import stripe_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/billing", tags=["billing"])


class CheckoutRequest(BaseModel):
    plan: str  # "starter" or "professional"
    billing_cycle: str = "monthly"  # "monthly" or "yearly"


@router.post("/checkout")
def create_checkout(
    req: CheckoutRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == int(current_user["user_id"])).first()
    if not user:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")

    if req.plan not in ("starter", "professional"):
        raise HTTPException(status_code=400, detail="Ungueltiger Plan")

    try:
        url = stripe_service.create_checkout_session(
            customer_email=user.email,
            plan=req.plan,
            billing_cycle=req.billing_cycle,
        )
        return {"url": url}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Stripe checkout error: %s", e)
        raise HTTPException(status_code=500, detail="Zahlung konnte nicht initiiert werden")


@router.post("/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """Handle Stripe webhook events."""
    import stripe
    from app.config import settings

    payload = await request.body()
    sig = request.headers.get("stripe-signature")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig, settings.stripe_webhook_secret
        )
    except (ValueError, stripe.error.SignatureVerificationError):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        customer_email = session.get("customer_email")
        customer_id = session.get("customer")

        # Update organization with Stripe customer ID
        user = db.query(User).filter(User.email == customer_email).first()
        if user:
            member = db.query(OrganizationMember).filter(
                OrganizationMember.user_id == user.id
            ).first()
            if member:
                org = db.query(Organization).filter(
                    Organization.id == member.organization_id
                ).first()
                if org:
                    org.stripe_customer_id = customer_id
                    # Determine plan from price
                    line_items = stripe.checkout.Session.list_line_items(session["id"])
                    if line_items and line_items.data:
                        price_id = line_items.data[0].price.id
                        if price_id in (settings.stripe_starter_price_id, settings.stripe_starter_yearly_price_id):
                            org.plan = "starter"
                        elif price_id in (settings.stripe_pro_price_id, settings.stripe_pro_yearly_price_id):
                            org.plan = "professional"
                    db.commit()

    elif event["type"] == "customer.subscription.deleted":
        subscription = event["data"]["object"]
        customer_id = subscription.get("customer")
        org = db.query(Organization).filter(
            Organization.stripe_customer_id == customer_id
        ).first()
        if org:
            org.plan = "free"
            org.stripe_subscription_id = None
            db.commit()

    return {"status": "ok"}


@router.get("/portal")
def create_portal(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    member = db.query(OrganizationMember).filter(
        OrganizationMember.user_id == int(current_user["user_id"])
    ).first()
    if not member:
        raise HTTPException(status_code=404)

    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if not org or not org.stripe_customer_id:
        raise HTTPException(status_code=400, detail="Kein aktives Abonnement")

    url = stripe_service.create_portal_session(org.stripe_customer_id)
    return {"url": url}
