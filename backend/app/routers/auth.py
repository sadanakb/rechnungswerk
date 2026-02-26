"""Auth router: register, login, me."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import re

from app.database import get_db
from app.models import User, Organization, OrganizationMember
from app.auth_jwt import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    get_current_user,
)
from app.schemas_auth import (
    RegisterRequest,
    LoginRequest,
    RegisterResponse,
    TokenResponse,
    MeResponse,
    UserResponse,
    OrganizationResponse,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _slugify(name: str) -> str:
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    return slug.strip("-")


@router.post("/register", response_model=RegisterResponse, status_code=201)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    # Check duplicate email
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="E-Mail bereits registriert")

    # Create user
    user = User(
        email=req.email,
        hashed_password=hash_password(req.password),
        full_name=req.full_name,
    )
    db.add(user)
    db.flush()

    # Create organization with unique slug
    base_slug = _slugify(req.organization_name)
    slug = base_slug
    counter = 1
    while db.query(Organization).filter(Organization.slug == slug).first():
        slug = f"{base_slug}-{counter}"
        counter += 1

    org = Organization(name=req.organization_name, slug=slug)
    db.add(org)
    db.flush()

    # Add user as owner
    member = OrganizationMember(
        user_id=user.id,
        organization_id=org.id,
        role="owner",
    )
    db.add(member)
    db.commit()
    db.refresh(user)
    db.refresh(org)

    access_token = create_access_token(
        data={"sub": str(user.id), "org_id": org.id, "role": "owner"}
    )
    refresh_token = create_refresh_token(data={"sub": str(user.id)})

    return RegisterResponse(
        user=UserResponse.model_validate(user),
        organization=OrganizationResponse.model_validate(org),
        access_token=access_token,
        refresh_token=refresh_token,
    )


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Ungueltige Anmeldedaten")

    # Get first organization membership
    member = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.user_id == user.id)
        .first()
    )
    org_id = member.organization_id if member else None
    role = member.role if member else "member"

    access_token = create_access_token(
        data={"sub": str(user.id), "org_id": org_id, "role": role}
    )
    refresh_token = create_refresh_token(data={"sub": str(user.id)})

    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.get("/me", response_model=MeResponse)
def get_me(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == int(current_user["user_id"])).first()
    if not user:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")

    member = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.user_id == user.id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Keine Organisation gefunden")

    org = db.query(Organization).filter(Organization.id == member.organization_id).first()

    return MeResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        organization=OrganizationResponse.model_validate(org),
        role=member.role,
    )
