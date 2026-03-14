"""Feature gating for Free/Starter/Professional tiers."""
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth_jwt import get_current_user
from app.models import Organization, OrganizationMember
from app.config import settings


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
        "ai_features": False,
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
        "ai_features": True,
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
        "ai_features": True,
    },
}


def require_plan(feature: str):
    """Deprecated: use require_feature() instead.

    This function reads the plan from the JWT token payload (current_user dict)
    rather than looking it up from the database, which means the plan can be stale
    if it was changed after the token was issued. require_feature() properly queries
    the Organization table for the current plan.
    """
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


def require_feature(feature_name: str):
    """FastAPI dependency that gates endpoints by organization plan.
    In self-hosted mode (cloud_mode=False), all features are unlocked.
    """
    def dependency(
        current_user: dict = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        # Self-hosted: all features available
        if not settings.cloud_mode:
            return current_user

        # Find org plan
        member = db.query(OrganizationMember).filter(
            OrganizationMember.user_id == int(current_user["user_id"])
        ).first()
        if not member:
            raise HTTPException(status_code=403, detail="Keine Organisation gefunden")

        org = db.query(Organization).filter(Organization.id == member.organization_id).first()
        plan = org.plan if org else "free"

        # Check feature access
        plan_limits = PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])
        if not plan_limits.get(feature_name, False):
            raise HTTPException(
                status_code=403,
                detail=f"Feature '{feature_name}' erfordert ein Upgrade. Aktueller Plan: {plan}",
            )

        return current_user

    return dependency


def check_plan_limit(
    db: Session,
    user_id: int,
    limit_key: str,
    current_count: int,
) -> None:
    """Raise 403 if current_count >= plan limit for the given limit_key.

    In self-hosted mode (cloud_mode=False), limits are not enforced.
    limit_key must map to a numeric value in PLAN_LIMITS (e.g. max_contacts).
    A value of -1 means unlimited.
    """
    if not settings.cloud_mode:
        return

    member = db.query(OrganizationMember).filter(
        OrganizationMember.user_id == user_id
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="Keine Organisation gefunden")

    org = db.query(Organization).filter(
        Organization.id == member.organization_id
    ).first()
    plan = org.plan if org else "free"
    plan_limits = PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])
    limit = plan_limits.get(limit_key, 0)

    if limit == -1:
        return  # unlimited

    if current_count >= limit:
        raise HTTPException(
            status_code=403,
            detail=f"Limit erreicht ({limit}). Bitte upgraden Sie Ihren Plan.",
        )
