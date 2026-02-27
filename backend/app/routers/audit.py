"""
Audit log router — GET /api/audit

Returns paginated audit log entries for the current user's organization.
Restricted to owner and admin roles.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AuditLog, OrganizationMember, User
from app.auth_jwt import get_current_user

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class AuditLogEntry(BaseModel):
    id: int
    org_id: int
    user_id: Optional[int]
    user_email: Optional[str]
    action: str
    resource_type: Optional[str]
    resource_id: Optional[str]
    details: Optional[dict]
    ip_address: Optional[str]
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


class AuditLogListResponse(BaseModel):
    items: list[AuditLogEntry]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _require_org_and_admin(
    current_user: dict,
    db: Session,
) -> tuple[int, OrganizationMember]:
    """
    Resolve the requesting user's organization membership.
    Raises 404 if no membership exists, 403 if not owner/admin.
    Returns (org_id, member).
    """
    user_id = int(current_user["user_id"])
    member = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.user_id == user_id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Keine Organisation gefunden")

    if member.role not in ("owner", "admin"):
        raise HTTPException(
            status_code=403,
            detail="Nur Owner oder Admin koennen das Protokoll einsehen",
        )

    return member.organization_id, member


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=AuditLogListResponse)
def list_audit_log(
    page: int = Query(default=1, ge=1, description="Seitennummer (1-basiert)"),
    page_size: int = Query(default=50, ge=1, le=200, description="Eintraege pro Seite"),
    action: Optional[str] = Query(default=None, description="Filter nach Aktion (z.B. invoice_created)"),
    resource_type: Optional[str] = Query(default=None, description="Filter nach Ressourcentyp"),
    date_from: Optional[str] = Query(default=None, description="Von-Datum (ISO 8601, z.B. 2026-01-01)"),
    date_to: Optional[str] = Query(default=None, description="Bis-Datum (ISO 8601, z.B. 2026-12-31)"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuditLogListResponse:
    """
    Return paginated audit log entries for the current organization.

    Requires owner or admin role.
    Sorted by created_at DESC (newest first).
    """
    org_id, _ = _require_org_and_admin(current_user, db)

    query = db.query(AuditLog).filter(AuditLog.org_id == org_id)

    # Optional filters
    if action:
        query = query.filter(AuditLog.action == action)

    if resource_type:
        query = query.filter(AuditLog.resource_type == resource_type)

    if date_from:
        try:
            dt_from = datetime.fromisoformat(date_from)
            query = query.filter(AuditLog.created_at >= dt_from)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Ungueltige date_from. Format: YYYY-MM-DD oder ISO 8601",
            )

    if date_to:
        try:
            dt_to = datetime.fromisoformat(date_to)
            query = query.filter(AuditLog.created_at <= dt_to)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Ungueltige date_to. Format: YYYY-MM-DD oder ISO 8601",
            )

    total = query.count()

    offset = (page - 1) * page_size
    entries = (
        query
        .order_by(AuditLog.created_at.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )

    # Resolve user emails in one pass
    user_ids = {e.user_id for e in entries if e.user_id is not None}
    user_email_map: dict[int, str] = {}
    if user_ids:
        users = db.query(User).filter(User.id.in_(user_ids)).all()
        user_email_map = {u.id: u.email for u in users}

    items = [
        AuditLogEntry(
            id=e.id,
            org_id=e.org_id,
            user_id=e.user_id,
            user_email=user_email_map.get(e.user_id) if e.user_id else None,
            action=e.action,
            resource_type=e.resource_type,
            resource_id=e.resource_id,
            details=e.details,
            ip_address=e.ip_address,
            created_at=e.created_at,
        )
        for e in entries
    ]

    return AuditLogListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )
