"""Auth router: register, login, me, forgot-password, reset-password."""
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
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
from app import email_service

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

    # Auto-send verification email (non-blocking — do NOT fail registration)
    try:
        raw_token = secrets.token_urlsafe(32)
        user.email_verification_token = hash_password(raw_token)
        db.commit()
        verification_url = f"{FRONTEND_URL}/email-verifizieren?token={raw_token}"
        email_service.send_email_verification(user.email, verification_url)
    except Exception:
        pass  # Never block registration if email sending fails

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


# ---------------------------------------------------------------------------
# Forgot / Reset Password
# ---------------------------------------------------------------------------

FRONTEND_URL = "http://localhost:3000"


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


@router.post("/forgot-password", status_code=200)
def forgot_password(req: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Request a password reset link. Always returns 200 to prevent email enumeration."""
    user = db.query(User).filter(User.email == req.email).first()
    if user:
        # Generate a random token and store its hash
        raw_token = secrets.token_urlsafe(32)
        user.password_reset_token = hash_password(raw_token)
        user.password_reset_expires = datetime.now(timezone.utc) + timedelta(hours=1)
        db.commit()

        reset_url = f"{FRONTEND_URL}/passwort-zuruecksetzen?token={raw_token}"
        email_service.send_password_reset_email(user.email, reset_url)

    # Always return success — no enumeration
    return {"message": "Falls ein Konto mit dieser E-Mail existiert, wurde ein Link gesendet."}


@router.post("/reset-password", status_code=200)
def reset_password(req: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Reset password using a valid token."""
    # Find users with a non-expired reset token
    now = datetime.now(timezone.utc)
    candidates = (
        db.query(User)
        .filter(
            User.password_reset_token.isnot(None),
            User.password_reset_expires > now,
        )
        .all()
    )

    # Verify the raw token against stored hashes
    matched_user = None
    for candidate in candidates:
        if verify_password(req.token, candidate.password_reset_token):
            matched_user = candidate
            break

    if not matched_user:
        raise HTTPException(
            status_code=400,
            detail="Link ungueltig oder abgelaufen",
        )

    # Update password and clear reset fields
    matched_user.hashed_password = hash_password(req.new_password)
    matched_user.password_reset_token = None
    matched_user.password_reset_expires = None
    db.commit()

    return {"message": "Passwort erfolgreich geaendert."}


# ---------------------------------------------------------------------------
# Email Verification
# ---------------------------------------------------------------------------


class VerifyEmailRequest(BaseModel):
    token: str


@router.post("/send-verification-email", status_code=200)
def send_verification_email(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Resend email verification link. Requires authentication."""
    user = db.query(User).filter(User.id == int(current_user["user_id"])).first()
    if not user:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")

    if user.is_verified:
        return {"message": "E-Mail bereits verifiziert."}

    # Generate new verification token
    raw_token = secrets.token_urlsafe(32)
    user.email_verification_token = hash_password(raw_token)
    db.commit()

    verification_url = f"{FRONTEND_URL}/email-verifizieren?token={raw_token}"
    email_service.send_email_verification(user.email, verification_url)

    return {"message": "Verifizierungs-E-Mail wurde gesendet."}


@router.post("/verify-email", status_code=200)
def verify_email(req: VerifyEmailRequest, db: Session = Depends(get_db)):
    """Verify email address using token from verification link."""
    # Find users with a verification token set
    candidates = (
        db.query(User)
        .filter(User.email_verification_token.isnot(None))
        .all()
    )

    # Verify the raw token against stored hashes
    matched_user = None
    for candidate in candidates:
        if verify_password(req.token, candidate.email_verification_token):
            matched_user = candidate
            break

    if not matched_user:
        raise HTTPException(
            status_code=400,
            detail="Verifikationslink ungueltig oder abgelaufen",
        )

    # Mark as verified and clear token
    matched_user.is_verified = True
    matched_user.email_verification_token = None
    db.commit()

    return {"message": "E-Mail erfolgreich verifiziert."}
