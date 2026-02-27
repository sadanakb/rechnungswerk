"""Teams router: manage organization members, invitations, roles."""
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.models import User, Organization, OrganizationMember
from app.auth_jwt import get_current_user
from app.feature_gate import require_feature
from app import email_service

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class MemberResponse(BaseModel):
    id: int
    user_id: int
    email: str
    full_name: str | None
    role: str
    joined_at: datetime | None

    class Config:
        from_attributes = True


class InviteRequest(BaseModel):
    email: EmailStr
    role: str = "member"


class InviteResponse(BaseModel):
    message: str
    email: str
    role: str


class RoleUpdateRequest(BaseModel):
    role: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_member_and_org(
    current_user: dict,
    db: Session,
) -> tuple[OrganizationMember, Organization]:
    """Resolve the current user's membership and organization."""
    member = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.user_id == int(current_user["user_id"]))
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Keine Organisation gefunden")

    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation nicht gefunden")

    return member, org


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/members", response_model=list[MemberResponse])
def list_members(
    current_user: dict = Depends(require_feature("team")),
    db: Session = Depends(get_db),
):
    """List all members of the current user's organization."""
    member, org = _get_member_and_org(current_user, db)

    members = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.organization_id == org.id)
        .all()
    )

    result = []
    for m in members:
        user = db.query(User).filter(User.id == m.user_id).first()
        if user:
            result.append(MemberResponse(
                id=m.id,
                user_id=m.user_id,
                email=user.email,
                full_name=user.full_name,
                role=m.role,
                joined_at=m.joined_at,
            ))

    return result


@router.post("/invite", response_model=InviteResponse, status_code=201)
def invite_member(
    payload: InviteRequest,
    current_user: dict = Depends(require_feature("team")),
    db: Session = Depends(get_db),
):
    """Invite a new member to the organization. Requires owner or admin role."""
    member, org = _get_member_and_org(current_user, db)

    # Only owner and admin can invite
    if member.role not in ("owner", "admin"):
        raise HTTPException(
            status_code=403,
            detail="Nur Owner oder Admin koennen Mitglieder einladen",
        )

    # Validate role
    if payload.role not in ("member", "admin"):
        raise HTTPException(
            status_code=400,
            detail="Ungueltige Rolle. Erlaubt: member, admin",
        )

    # Check if user is already a member
    existing_user = db.query(User).filter(User.email == payload.email).first()
    if existing_user:
        existing_membership = (
            db.query(OrganizationMember)
            .filter(
                OrganizationMember.user_id == existing_user.id,
                OrganizationMember.organization_id == org.id,
            )
            .first()
        )
        if existing_membership:
            raise HTTPException(
                status_code=409,
                detail="Benutzer ist bereits Mitglied der Organisation",
            )

    # Get inviter info
    inviter = db.query(User).filter(User.id == int(current_user["user_id"])).first()
    inviter_name = inviter.full_name or inviter.email if inviter else "Ein Teammitglied"

    # Generate invite token
    invite_token = secrets.token_urlsafe(32)
    invite_url = f"http://localhost:3000/team/einladung?token={invite_token}"

    # Send invitation email
    email_service.send_team_invite(
        to_email=payload.email,
        org_name=org.name,
        inviter_name=inviter_name,
        invite_url=invite_url,
    )

    return InviteResponse(
        message="Einladung wurde gesendet",
        email=payload.email,
        role=payload.role,
    )


@router.delete("/members/{user_id}", status_code=200)
def remove_member(
    user_id: int,
    current_user: dict = Depends(require_feature("team")),
    db: Session = Depends(get_db),
):
    """Remove a member from the organization. Owner only."""
    member, org = _get_member_and_org(current_user, db)

    # Only owner can remove members
    if member.role != "owner":
        raise HTTPException(
            status_code=403,
            detail="Nur der Owner kann Mitglieder entfernen",
        )

    # Cannot remove self
    if user_id == int(current_user["user_id"]):
        raise HTTPException(
            status_code=400,
            detail="Sie koennen sich nicht selbst entfernen",
        )

    # Find the target member
    target_member = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.user_id == user_id,
            OrganizationMember.organization_id == org.id,
        )
        .first()
    )
    if not target_member:
        raise HTTPException(status_code=404, detail="Mitglied nicht gefunden")

    db.delete(target_member)
    db.commit()

    return {"message": "Mitglied wurde entfernt"}


@router.patch("/members/{user_id}", response_model=MemberResponse)
def update_member_role(
    user_id: int,
    payload: RoleUpdateRequest,
    current_user: dict = Depends(require_feature("team")),
    db: Session = Depends(get_db),
):
    """Change a member's role. Owner only."""
    member, org = _get_member_and_org(current_user, db)

    # Only owner can change roles
    if member.role != "owner":
        raise HTTPException(
            status_code=403,
            detail="Nur der Owner kann Rollen aendern",
        )

    # Validate role
    if payload.role not in ("member", "admin"):
        raise HTTPException(
            status_code=400,
            detail="Ungueltige Rolle. Erlaubt: member, admin",
        )

    # Cannot change own role
    if user_id == int(current_user["user_id"]):
        raise HTTPException(
            status_code=400,
            detail="Sie koennen Ihre eigene Rolle nicht aendern",
        )

    # Find the target member
    target_member = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.user_id == user_id,
            OrganizationMember.organization_id == org.id,
        )
        .first()
    )
    if not target_member:
        raise HTTPException(status_code=404, detail="Mitglied nicht gefunden")

    target_member.role = payload.role
    db.commit()
    db.refresh(target_member)

    # Get user info for response
    user = db.query(User).filter(User.id == target_member.user_id).first()

    return MemberResponse(
        id=target_member.id,
        user_id=target_member.user_id,
        email=user.email if user else "",
        full_name=user.full_name if user else None,
        role=target_member.role,
        joined_at=target_member.joined_at,
    )
