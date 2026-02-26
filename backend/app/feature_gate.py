"""Feature gating for Free/Starter/Professional tiers."""
from fastapi import HTTPException, Depends
from app.auth_jwt import get_current_user


PLAN_LIMITS = {
    "free": {
        "max_invoices_per_month": 5,
        "max_contacts": 10,
        "datev_export": False,
        "mahnwesen": False,
        "banking": False,
        "ustva": False,
        "team": False,
        "api_access": False,
        "priority_support": False,
    },
    "starter": {
        "max_invoices_per_month": -1,  # unlimited
        "max_contacts": -1,
        "datev_export": True,
        "mahnwesen": True,
        "banking": False,
        "ustva": False,
        "team": False,
        "api_access": True,
        "priority_support": False,
    },
    "professional": {
        "max_invoices_per_month": -1,
        "max_contacts": -1,
        "datev_export": True,
        "mahnwesen": True,
        "banking": True,
        "ustva": True,
        "team": True,
        "api_access": True,
        "priority_support": True,
    },
}


def require_plan(feature: str):
    """Dependency that checks if user's org plan allows the feature."""
    def dependency(current_user: dict = Depends(get_current_user)):
        plan = current_user.get("plan", "free")
        limits = PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])
        if not limits.get(feature, False):
            raise HTTPException(
                status_code=403,
                detail=f"Feature '{feature}' erfordert ein Upgrade. Aktueller Plan: {plan}",
            )
        return current_user
    return dependency
