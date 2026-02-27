"""Onboarding router: status, company update, completion, logo upload."""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session
import os

from app.database import get_db
from app.models import Organization, OrganizationMember
from app.auth_jwt import get_current_user

router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class OnboardingStatus(BaseModel):
    completed: bool
    org_name: str
    has_vat_id: bool
    has_address: bool
    vat_id: str | None = None
    address: str | None = None


class CompanyUpdate(BaseModel):
    name: str | None = None
    vat_id: str | None = None
    address: str | None = None
    logo_url: str | None = None


class OnboardingCompleteResponse(BaseModel):
    completed: bool


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_org(current_user: dict, db: Session) -> Organization:
    """Resolve the organization for the current user via OrganizationMember."""
    user_id = current_user.get("user_id")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Benutzer nicht authentifiziert")

    member = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.user_id == int(user_id))
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Keine Organisation gefunden")

    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation nicht gefunden")

    return org


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/status", response_model=OnboardingStatus)
def get_onboarding_status(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return onboarding progress for the current user's organization."""
    org = _get_org(current_user, db)
    return OnboardingStatus(
        completed=bool(org.onboarding_completed),
        org_name=org.name,
        has_vat_id=bool(org.vat_id),
        has_address=bool(org.address),
        vat_id=org.vat_id,
        address=org.address,
    )


@router.post("/company", response_model=OnboardingStatus)
def update_company_info(
    payload: CompanyUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update organization company info (vat_id, address, logo_url)."""
    org = _get_org(current_user, db)

    if payload.name is not None:
        org.name = payload.name
    if payload.vat_id is not None:
        org.vat_id = payload.vat_id
    if payload.address is not None:
        org.address = payload.address
    if payload.logo_url is not None:
        org.logo_url = payload.logo_url

    db.commit()
    db.refresh(org)

    return OnboardingStatus(
        completed=bool(org.onboarding_completed),
        org_name=org.name,
        has_vat_id=bool(org.vat_id),
        has_address=bool(org.address),
        vat_id=org.vat_id,
        address=org.address,
    )


@router.post("/logo")
async def upload_logo(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a company logo and save it to disk; update the organization record."""
    allowed_types = {"image/png", "image/jpeg", "image/svg+xml", "image/webp"}
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Ungültiges Dateiformat. Erlaubt: PNG, JPG, SVG, WebP",
        )

    contents = await file.read()
    if len(contents) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Datei zu groß. Maximum: 2 MB")

    ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "png"
    save_dir = "static/logos"
    os.makedirs(save_dir, exist_ok=True)

    org = _get_org(current_user, db)
    filename = f"{org.id}.{ext}"
    path = os.path.join(save_dir, filename)
    with open(path, "wb") as f:
        f.write(contents)

    logo_url = f"/static/logos/{filename}"
    org.logo_url = logo_url
    db.commit()

    return {"logo_url": logo_url}


@router.post("/complete", response_model=OnboardingCompleteResponse)
def complete_onboarding(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark onboarding as completed for the current user's organization."""
    org = _get_org(current_user, db)
    org.onboarding_completed = True
    db.commit()
    db.refresh(org)

    return OnboardingCompleteResponse(completed=True)
