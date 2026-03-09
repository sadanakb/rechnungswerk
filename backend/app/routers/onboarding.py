"""Onboarding router: status, company update, completion, logo upload."""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.models import Organization, OrganizationMember, Contact, Invoice
from app.auth_jwt import get_current_user
from app.storage import get_storage

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
    logo_url: str | None = None


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

CONTENT_TYPE_TO_EXT = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/svg+xml": "svg",
}


def _validate_image_magic(content: bytes, content_type: str) -> bool:
    """Verify the file's magic bytes match the declared content type."""
    if content_type == "image/png":
        return content[:4] == b'\x89PNG'
    elif content_type == "image/jpeg":
        return content[:3] == b'\xff\xd8\xff'
    elif content_type == "image/webp":
        return content[:4] == b'RIFF' and b'WEBP' in content[:12]
    elif content_type == "image/svg+xml":
        # SVG is XML/text — look for <svg or <?xml markers
        sample = content[:512].lower()
        return b'<svg' in sample or b'<?xml' in sample
    return False


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
        logo_url=org.logo_url,
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
        logo_url=org.logo_url,
    )


@router.post("/logo")
async def upload_logo(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a company logo and save it to disk; update the organization record."""
    allowed_types = {"image/png", "image/jpeg", "image/webp", "image/svg+xml"}
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Ungültiges Dateiformat. Erlaubt: PNG, JPG, SVG, WebP",
        )

    contents = await file.read()
    if len(contents) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Datei zu groß. Maximum: 2 MB")

    if not _validate_image_magic(contents, file.content_type):
        raise HTTPException(
            status_code=400,
            detail="Dateiinhalt stimmt nicht mit dem deklarierten Format überein",
        )

    ext = CONTENT_TYPE_TO_EXT.get(file.content_type, "png")

    org = _get_org(current_user, db)
    filename = f"{org.id}.{ext}"

    storage = get_storage()
    storage_path = f"{org.id}/logos/{filename}"
    storage.save(storage_path, contents)
    logo_url = storage.url(storage_path)

    org.logo_url = logo_url
    db.commit()

    return {"logo_url": logo_url}


@router.delete("/logo", response_model=OnboardingStatus)
def remove_logo(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove the organization logo."""
    org = _get_org(current_user, db)
    org.logo_url = None
    db.commit()
    db.refresh(org)
    return OnboardingStatus(
        completed=bool(org.onboarding_completed),
        org_name=org.name,
        has_vat_id=bool(org.vat_id),
        has_address=bool(org.address),
        vat_id=org.vat_id,
        address=org.address,
        logo_url=None,
    )


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


# ---------------------------------------------------------------------------
# DATEV Settings (Phase 10)
# ---------------------------------------------------------------------------

class DatevSettingsPayload(BaseModel):
    datev_berater_nr: str | None = None
    datev_mandant_nr: str | None = None
    steuerberater_email: str | None = None


class DatevSettingsResponse(BaseModel):
    datev_berater_nr: str | None
    datev_mandant_nr: str | None
    steuerberater_email: str | None


@router.get("/datev-settings", response_model=DatevSettingsResponse)
def get_datev_settings(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return DATEV configuration for current organization."""
    org = _get_org(current_user, db)
    return DatevSettingsResponse(
        datev_berater_nr=org.datev_berater_nr,
        datev_mandant_nr=org.datev_mandant_nr,
        steuerberater_email=org.steuerberater_email,
    )


@router.post("/datev-settings", response_model=DatevSettingsResponse)
def update_datev_settings(
    payload: DatevSettingsPayload,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update DATEV configuration (Beraternummer, Mandantennummer, Steuerberater-E-Mail)."""
    org = _get_org(current_user, db)

    if payload.datev_berater_nr is not None:
        org.datev_berater_nr = payload.datev_berater_nr
    if payload.datev_mandant_nr is not None:
        org.datev_mandant_nr = payload.datev_mandant_nr
    if payload.steuerberater_email is not None:
        org.steuerberater_email = payload.steuerberater_email

    db.commit()
    db.refresh(org)
    return DatevSettingsResponse(
        datev_berater_nr=org.datev_berater_nr,
        datev_mandant_nr=org.datev_mandant_nr,
        steuerberater_email=org.steuerberater_email,
    )


# ---------------------------------------------------------------------------
# Onboarding Checklist (dynamic)
# ---------------------------------------------------------------------------

class ChecklistStep(BaseModel):
    key: str
    done: bool
    label: str
    description: str
    href: str

class ChecklistResponse(BaseModel):
    completed: int
    total: int
    all_done: bool
    steps: list[ChecklistStep]


@router.get("/checklist", response_model=ChecklistResponse)
def get_onboarding_checklist(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return dynamic onboarding checklist computed from real data."""
    org = _get_org(current_user, db)

    # Check company data completeness
    company_data_done = bool(org.name and org.name.strip() and org.address and org.address.strip() and org.vat_id and org.vat_id.strip())

    # Count contacts
    contact_count = db.query(func.count(Contact.id)).filter(Contact.org_id == org.id).scalar() or 0
    first_contact_done = contact_count >= 1

    # Invoice checks — single query for all invoice-related steps
    # Count non-cancelled invoices, invoices with xrechnung, invoices with zugferd pdf
    invoice_stats = db.query(
        func.count(Invoice.id).filter(Invoice.payment_status != 'cancelled'),
        func.count(Invoice.id).filter(
            Invoice.xrechnung_xml_path.isnot(None),
            Invoice.xrechnung_xml_path != '',
        ),
        func.count(Invoice.id).filter(
            Invoice.zugferd_pdf_path.isnot(None),
            Invoice.zugferd_pdf_path != '',
        ),
    ).filter(Invoice.organization_id == org.id).first()

    first_invoice_done = (invoice_stats[0] or 0) >= 1
    first_xrechnung_done = (invoice_stats[1] or 0) >= 1
    first_download_done = (invoice_stats[2] or 0) >= 1

    steps = [
        ChecklistStep(
            key="company_data",
            done=company_data_done,
            label="Firmendaten vervollständigen",
            description="Name, Adresse und USt-IdNr. hinterlegen",
            href="/settings",
        ),
        ChecklistStep(
            key="first_contact",
            done=first_contact_done,
            label="Ersten Kontakt anlegen",
            description="Einen Kunden oder Geschäftspartner hinzufügen",
            href="/contacts",
        ),
        ChecklistStep(
            key="first_invoice",
            done=first_invoice_done,
            label="Erste Rechnung erstellen",
            description="Ihre erste Rechnung schreiben",
            href="/manual",
        ),
        ChecklistStep(
            key="first_xrechnung",
            done=first_xrechnung_done,
            label="XRechnung generieren",
            description="Eine E-Rechnung im XRechnung-Format erzeugen",
            href="/invoices",
        ),
        ChecklistStep(
            key="first_download",
            done=first_download_done,
            label="ZUGFeRD-PDF herunterladen",
            description="Eine Rechnung als PDF mit eingebetteten XML-Daten herunterladen",
            href="/invoices",
        ),
    ]

    completed = sum(1 for s in steps if s.done)
    return ChecklistResponse(
        completed=completed,
        total=len(steps),
        all_done=completed == len(steps),
        steps=steps,
    )
