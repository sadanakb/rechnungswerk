"""
In-app notification endpoints.

GET  /api/notifications          — list notifications for current user's org (unread first, limit 50)
GET  /api/notifications/unread-count — count of unread notifications
POST /api/notifications/mark-read    — mark notifications as read (by IDs or all)
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Notification, OrganizationMember
from app.auth_jwt import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class NotificationResponse(BaseModel):
    id: int
    type: str
    title: str
    message: str
    is_read: bool
    link: Optional[str]
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


class MarkReadRequest(BaseModel):
    ids: Optional[list[int]] = None
    all: Optional[bool] = False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _resolve_org_id(current_user: dict, db: Session) -> int:
    """
    Resolve the org_id for the current user via OrganizationMember.
    Raises 404 if the user has no organisation membership.
    """
    raw_user_id = current_user.get("user_id")
    # In dev mode get_current_user returns "dev-user" — skip org lookup
    if raw_user_id == "dev-user":
        raise HTTPException(status_code=404, detail="Keine Organisation gefunden (dev mode)")
    try:
        user_id = int(raw_user_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Ungueltige Benutzer-ID")

    member = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.user_id == user_id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Keine Organisation gefunden")
    return member.organization_id


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=list[NotificationResponse])
def list_notifications(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List notifications for the current user's organisation (unread first, limit 50)."""
    org_id = _resolve_org_id(current_user, db)
    return (
        db.query(Notification)
        .filter(Notification.org_id == org_id)
        .order_by(Notification.is_read.asc(), Notification.created_at.desc())
        .limit(50)
        .all()
    )


@router.get("/unread-count")
def unread_count(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the number of unread notifications for the current user's organisation."""
    org_id = _resolve_org_id(current_user, db)
    count = (
        db.query(Notification)
        .filter(
            Notification.org_id == org_id,
            Notification.is_read == False,  # noqa: E712
        )
        .count()
    )
    return {"count": count}


@router.post("/mark-read")
def mark_read(
    body: MarkReadRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark notifications as read — either all or a specific list of IDs."""
    org_id = _resolve_org_id(current_user, db)
    q = db.query(Notification).filter(Notification.org_id == org_id)
    if body.all:
        q.update({"is_read": True}, synchronize_session=False)
    elif body.ids:
        q.filter(Notification.id.in_(body.ids)).update(
            {"is_read": True}, synchronize_session=False
        )
    db.commit()
    return {"ok": True}
