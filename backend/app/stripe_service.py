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


# ---------------------------------------------------------------------------
# Phase 12: Stripe Connect Express
# ---------------------------------------------------------------------------

def create_connect_onboarding_url(
    existing_account_id: str | None,
    return_url: str,
    refresh_url: str,
) -> dict:
    """Create or reuse a Stripe Express connected account and return the onboarding URL.

    Returns: {"url": str, "account_id": str}
    """
    if existing_account_id:
        account_id = existing_account_id
    else:
        account = stripe.Account.create(
            type="express",
            country="DE",
            capabilities={
                "card_payments": {"requested": True},
                "transfers": {"requested": True},
            },
        )
        account_id = account.id

    link = stripe.AccountLink.create(
        account=account_id,
        return_url=return_url,
        refresh_url=refresh_url,
        type="account_onboarding",
    )
    return {"url": link.url, "account_id": account_id}


def get_connect_account_status(account_id: str) -> dict:
    """Retrieve Connect account status from Stripe.

    Returns: {"onboarded": bool, "charges_enabled": bool, "details_submitted": bool, "payouts_enabled": bool}
    """
    account = stripe.Account.retrieve(account_id)
    onboarded = bool(account.charges_enabled and account.details_submitted)
    return {
        "onboarded": onboarded,
        "charges_enabled": bool(account.charges_enabled),
        "details_submitted": bool(account.details_submitted),
        "payouts_enabled": bool(account.payouts_enabled),
    }


def create_portal_payment_intent(
    amount_cents: int,
    currency: str,
    connected_account_id: str,
    fee_cents: int,
    metadata: dict | None = None,
) -> dict:
    """Create a PaymentIntent on a connected account with platform fee.

    Returns: {"intent_id": str, "client_secret": str, "status": str}
    """
    intent = stripe.PaymentIntent.create(
        amount=amount_cents,
        currency=currency.lower(),
        automatic_payment_methods={"enabled": True},
        application_fee_amount=fee_cents,
        transfer_data={"destination": connected_account_id},
        metadata=metadata or {},
    )
    return {
        "intent_id": intent.id,
        "client_secret": intent.client_secret,
        "status": intent.status,
    }
