"""Auth router: register, login, me, forgot-password, reset-password."""
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy.orm import Session
import hashlib
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
    validate_password_strength,
)
from app import email_service
from app.email_service import enqueue_email
from app.rate_limiter import limiter
from app.config import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _slugify(name: str) -> str:
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    return slug.strip("-")


@router.post("/register", response_model=RegisterResponse, status_code=201)
@limiter.limit("5/minute")
def register(request: Request, req: RegisterRequest, db: Session = Depends(get_db)):
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
        user.email_verification_token = hashlib.sha256(raw_token.encode()).hexdigest()
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
@limiter.limit("10/minute")
def login(request: Request, req: LoginRequest, db: Session = Depends(get_db)):
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

FRONTEND_URL = settings.frontend_url


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return validate_password_strength(v)


@router.post("/forgot-password", status_code=200)
@limiter.limit("5/minute")
async def forgot_password(request: Request, req: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Request a password reset link. Always returns 200 to prevent email enumeration."""
    user = db.query(User).filter(User.email == req.email).first()
    if user:
        # Generate a random token and store its SHA256 hash (O(1) lookup)
        raw_token = secrets.token_urlsafe(32)
        user.password_reset_token = hashlib.sha256(raw_token.encode()).hexdigest()
        user.password_reset_expires = datetime.now(timezone.utc) + timedelta(hours=1)
        db.commit()

        reset_url = f"{FRONTEND_URL}/passwort-zuruecksetzen?token={raw_token}"
        arq_pool = getattr(request.app.state, "arq_pool", None)
        await enqueue_email(
            arq_pool,
            "password_reset",
            to_email=user.email,
            reset_url=reset_url,
        )

    # Always return success — no enumeration
    return {"message": "Falls ein Konto mit dieser E-Mail existiert, wurde ein Link gesendet."}


@router.post("/reset-password", status_code=200)
@limiter.limit("5/minute")
def reset_password(request: Request, req: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Reset password using a valid token."""
    now = datetime.now(timezone.utc)

    # O(1) direct lookup via SHA256 hash
    token_hash = hashlib.sha256(req.token.encode()).hexdigest()
    matched_user = (
        db.query(User)
        .filter(
            User.password_reset_token == token_hash,
            User.password_reset_expires > now,
        )
        .first()
    )

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

    # Generate new verification token (SHA256 for O(1) lookup)
    raw_token = secrets.token_urlsafe(32)
    user.email_verification_token = hashlib.sha256(raw_token.encode()).hexdigest()
    db.commit()

    verification_url = f"{FRONTEND_URL}/email-verifizieren?token={raw_token}"
    email_service.send_email_verification(user.email, verification_url)

    return {"message": "Verifizierungs-E-Mail wurde gesendet."}


@router.post("/verify-email", status_code=200)
@limiter.limit("5/minute")
def verify_email(request: Request, req: VerifyEmailRequest, db: Session = Depends(get_db)):
    """Verify email address using token from verification link."""
    # O(1) direct lookup via SHA256 hash
    token_hash = hashlib.sha256(req.token.encode()).hexdigest()
    matched_user = (
        db.query(User)
        .filter(User.email_verification_token == token_hash)
        .first()
    )

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
