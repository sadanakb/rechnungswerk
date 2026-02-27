"""Stripe payment integration."""
import stripe
from app.config import settings

stripe.api_key = settings.stripe_secret_key

PRICE_IDS = {
    "starter_monthly": settings.stripe_starter_price_id,
    "starter_yearly": settings.stripe_starter_yearly_price_id,
    "professional_monthly": settings.stripe_pro_price_id,
    "professional_yearly": settings.stripe_pro_yearly_price_id,
}


def _get_price_id(price_key: str) -> str | None:
    """Look up price ID, falling back to runtime settings if static map is empty."""
    price_id = PRICE_IDS.get(price_key)
    if price_id:
        return price_id
    # Fallback: read from settings at runtime (supports late-bound env vars)
    runtime_map = {
        "starter_monthly": settings.stripe_starter_price_id,
        "starter_yearly": settings.stripe_starter_yearly_price_id,
        "professional_monthly": settings.stripe_pro_price_id,
        "professional_yearly": settings.stripe_pro_yearly_price_id,
    }
    return runtime_map.get(price_key) or None


def create_checkout_session(
    customer_email: str,
    plan: str,
    billing_cycle: str = "monthly",
    success_url: str = "https://rechnungswerk.de/dashboard?upgraded=true",
    cancel_url: str = "https://rechnungswerk.de/preise",
) -> str:
    price_key = f"{plan}_{billing_cycle}"
    price_id = _get_price_id(price_key)
    if not price_id:
        raise ValueError(f"Unknown plan: {price_key}")

    session = stripe.checkout.Session.create(
        mode="subscription",
        payment_method_types=["card", "sepa_debit"],
        line_items=[{"price": price_id, "quantity": 1}],
        customer_email=customer_email,
        success_url=success_url,
        cancel_url=cancel_url,
    )
    return session.url


def create_portal_session(
    customer_id: str,
    return_url: str = "https://rechnungswerk.de/dashboard",
) -> str:
    """Create a Stripe Customer Portal session and return the URL."""
    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=return_url,
    )
    return session.url


def get_subscription(subscription_id: str) -> dict:
    """Retrieve subscription details from Stripe."""
    sub = stripe.Subscription.retrieve(subscription_id)
    return {
        "id": sub.id,
        "status": sub.status,
        "current_period_end": sub.current_period_end,
        "current_period_start": sub.current_period_start,
        "cancel_at_period_end": sub.cancel_at_period_end,
        "items": [
            {
                "price_id": item.price.id,
                "product_id": item.price.product,
            }
            for item in sub["items"]["data"]
        ],
    }
