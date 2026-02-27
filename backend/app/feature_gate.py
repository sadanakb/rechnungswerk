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
