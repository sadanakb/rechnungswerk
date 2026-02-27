"""Billing router: Stripe checkout, webhooks, portal, subscription status."""
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


# ---------------------------------------------------------------------------
# GET /api/billing/subscription — current plan info
# ---------------------------------------------------------------------------

@router.get("/subscription")
def get_subscription_status(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return current plan info for authenticated user's organization."""
    member = db.query(OrganizationMember).filter(
        OrganizationMember.user_id == int(current_user["user_id"])
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Keine Organisation gefunden")

    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation nicht gefunden")

    result = {
        "plan": org.plan or "free",
        "plan_status": org.plan_status or "active",
        "stripe_customer_id": org.stripe_customer_id,
        "stripe_subscription_id": org.stripe_subscription_id,
        "period_end": None,
    }

    # If there is an active subscription, fetch period_end from Stripe
    if org.stripe_subscription_id:
        try:
            sub_details = stripe_service.get_subscription(org.stripe_subscription_id)
            result["period_end"] = sub_details.get("current_period_end")
        except Exception as e:
            logger.warning("Could not fetch subscription details: %s", e)

    return result


# ---------------------------------------------------------------------------
# POST /api/billing/portal — Stripe Customer Portal
# ---------------------------------------------------------------------------

@router.post("/portal")
def create_portal(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a Stripe Customer Portal session and return the URL."""
    member = db.query(OrganizationMember).filter(
        OrganizationMember.user_id == int(current_user["user_id"])
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Keine Organisation gefunden")

    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if not org or not org.stripe_customer_id:
        raise HTTPException(status_code=400, detail="Kein aktives Abonnement")

    try:
        url = stripe_service.create_portal_session(
            customer_id=org.stripe_customer_id,
            return_url="https://rechnungswerk.de/dashboard",
        )
        return {"url": url}
    except Exception as e:
        logger.error("Stripe portal error: %s", e)
        raise HTTPException(status_code=500, detail="Portal konnte nicht erstellt werden")


# ---------------------------------------------------------------------------
# POST /api/billing/webhook — Stripe Webhook (UNAUTHENTICATED)
# ---------------------------------------------------------------------------

@router.post("/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """Handle Stripe webhook events. Unauthenticated — verified via Stripe signature."""
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

    event_type = event["type"]
    data_object = event["data"]["object"]

    logger.info("Stripe webhook received: %s", event_type)

    # --- checkout.session.completed ---
    if event_type == "checkout.session.completed":
        customer_email = data_object.get("customer_email")
        customer_id = data_object.get("customer")
        subscription_id = data_object.get("subscription")

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
                    org.stripe_subscription_id = subscription_id
                    org.plan_status = "active"

                    # Determine plan from checkout line items
                    try:
                        line_items = stripe.checkout.Session.list_line_items(data_object["id"])
                        if line_items and line_items.data:
                            price_id = line_items.data[0].price.id
                            if price_id in (settings.stripe_starter_price_id, settings.stripe_starter_yearly_price_id):
                                org.plan = "starter"
                            elif price_id in (settings.stripe_pro_price_id, settings.stripe_pro_yearly_price_id):
                                org.plan = "professional"
                    except Exception as e:
                        logger.warning("Could not determine plan from line items: %s", e)

                    db.commit()
                    logger.info("Checkout completed for org %s: plan=%s", org.id, org.plan)

    # --- customer.subscription.updated ---
    elif event_type == "customer.subscription.updated":
        customer_id = data_object.get("customer")
        subscription_status = data_object.get("status")

        org = db.query(Organization).filter(
            Organization.stripe_customer_id == customer_id
        ).first()
        if org:
            org.stripe_subscription_id = data_object.get("id")
            # Map Stripe subscription status to our plan_status
            status_map = {
                "active": "active",
                "trialing": "trialing",
                "past_due": "past_due",
                "canceled": "cancelled",
                "unpaid": "past_due",
                "incomplete": "past_due",
            }
            org.plan_status = status_map.get(subscription_status, "active")
            db.commit()
            logger.info("Subscription updated for org %s: status=%s", org.id, org.plan_status)

    # --- customer.subscription.deleted ---
    elif event_type == "customer.subscription.deleted":
        customer_id = data_object.get("customer")

        org = db.query(Organization).filter(
            Organization.stripe_customer_id == customer_id
        ).first()
        if org:
            org.plan = "free"
            org.plan_status = "cancelled"
            org.stripe_subscription_id = None
            db.commit()
            logger.info("Subscription deleted for org %s: reverted to free", org.id)

    # --- invoice.payment_failed ---
    elif event_type == "invoice.payment_failed":
        customer_id = data_object.get("customer")

        org = db.query(Organization).filter(
            Organization.stripe_customer_id == customer_id
        ).first()
        if org:
            org.plan_status = "past_due"
            db.commit()
            logger.info("Payment failed for org %s: status=past_due", org.id)

    return {"status": "ok"}
