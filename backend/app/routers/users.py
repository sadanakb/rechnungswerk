"""Users router: profile read and update."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Organization, OrganizationMember
from app.auth_jwt import get_current_user, hash_password, verify_password
from app.schemas_users import UserProfileResponse, UserProfileUpdate, OrganizationInfo

router = APIRouter()


@router.get("/me", response_model=UserProfileResponse)
def get_profile(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the current user's profile with organization info."""
    user = db.query(User).filter(User.id == int(current_user["user_id"])).first()
    if not user:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")

    # Resolve organization
    org_info = None
    member = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.user_id == user.id)
        .first()
    )
    if member:
        org = db.query(Organization).filter(Organization.id == member.organization_id).first()
        if org:
            org_info = OrganizationInfo(id=org.id, name=org.name)

    return UserProfileResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_verified=user.is_verified,
        created_at=user.created_at,
        organization=org_info,
    )


@router.patch("/me", response_model=UserProfileResponse)
def update_profile(
    payload: UserProfileUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update the current user's full_name and/or password."""
    user = db.query(User).filter(User.id == int(current_user["user_id"])).first()
    if not user:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")

    # Update full_name if provided
    if payload.full_name is not None:
        user.full_name = payload.full_name

    # Update password if requested
    if payload.new_password is not None:
        if not payload.current_password:
            raise HTTPException(
                status_code=400,
                detail="Aktuelles Passwort ist erforderlich",
            )
        if not verify_password(payload.current_password, user.hashed_password):
            raise HTTPException(
                status_code=400,
                detail="Aktuelles Passwort ist falsch",
            )
        user.hashed_password = hash_password(payload.new_password)

    db.commit()
    db.refresh(user)

    # Resolve organization
    org_info = None
    member = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.user_id == user.id)
        .first()
    )
    if member:
        org = db.query(Organization).filter(Organization.id == member.organization_id).first()
        if org:
            org_info = OrganizationInfo(id=org.id, name=org.name)

    return UserProfileResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_verified=user.is_verified,
        created_at=user.created_at,
        organization=org_info,
    )
