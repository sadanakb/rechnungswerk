"""
Invoice Template management endpoints.

Templates are org-scoped — each organisation manages its own set.
At most one template per org may be marked is_default=True.

Endpoints:
- GET    /api/templates          — list org's templates
- POST   /api/templates          — create template
- GET    /api/templates/{id}     — get single template
- PUT    /api/templates/{id}     — update template
- DELETE /api/templates/{id}     — delete template
"""
import logging
import re
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Path, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import InvoiceTemplate, OrganizationMember
from app.auth_jwt import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_HEX_RE = re.compile(r'^#[0-9A-Fa-f]{6}$')


def _get_org_id(current_user: dict, db: Session) -> int:
    """Resolve the organisation id for the current user."""
    user_id = int(current_user["user_id"])
    member = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.user_id == user_id)
        .first()
    )
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Benutzer ist keiner Organisation zugeordnet",
        )
    return member.organization_id


def _get_template_or_404(template_id: int, org_id: int, db: Session) -> InvoiceTemplate:
    tmpl = (
        db.query(InvoiceTemplate)
        .filter(
            InvoiceTemplate.id == template_id,
            InvoiceTemplate.org_id == org_id,
        )
        .first()
    )
    if not tmpl:
        raise HTTPException(status_code=404, detail="Vorlage nicht gefunden")
    return tmpl


# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------

class TemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    primary_color: str = Field(default="#14b8a6", max_length=7)
    footer_text: Optional[str] = Field(None, max_length=500)
    payment_terms_days: int = Field(default=14, ge=0, le=365)
    bank_iban: Optional[str] = Field(None, max_length=34)
    bank_bic: Optional[str] = Field(None, max_length=11)
    bank_name: Optional[str] = Field(None, max_length=255)
    default_vat_rate: str = Field(default="19", max_length=10)
    notes_template: Optional[str] = Field(None, max_length=1000)
    is_default: bool = False

    @field_validator("primary_color")
    @classmethod
    def validate_hex_color(cls, v: str) -> str:
        if not _HEX_RE.match(v):
            raise ValueError("primary_color must be a valid hex color like #14b8a6")
        return v


class TemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    primary_color: Optional[str] = Field(None, max_length=7)
    footer_text: Optional[str] = Field(None, max_length=500)
    payment_terms_days: Optional[int] = Field(None, ge=0, le=365)
    bank_iban: Optional[str] = Field(None, max_length=34)
    bank_bic: Optional[str] = Field(None, max_length=11)
    bank_name: Optional[str] = Field(None, max_length=255)
    default_vat_rate: Optional[str] = Field(None, max_length=10)
    notes_template: Optional[str] = Field(None, max_length=1000)
    is_default: Optional[bool] = None

    @field_validator("primary_color")
    @classmethod
    def validate_hex_color(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not _HEX_RE.match(v):
            raise ValueError("primary_color must be a valid hex color like #14b8a6")
        return v


class TemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    org_id: int
    name: str
    primary_color: str
    footer_text: Optional[str] = None
    payment_terms_days: int
    bank_iban: Optional[str] = None
    bank_bic: Optional[str] = None
    bank_name: Optional[str] = None
    default_vat_rate: str
    notes_template: Optional[str] = None
    is_default: bool
    created_at: datetime


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=List[TemplateResponse])
def list_templates(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all invoice templates for the caller's organisation."""
    org_id = _get_org_id(current_user, db)
    templates = (
        db.query(InvoiceTemplate)
        .filter(InvoiceTemplate.org_id == org_id)
        .order_by(InvoiceTemplate.is_default.desc(), InvoiceTemplate.id.asc())
        .all()
    )
    return templates


@router.post("", response_model=TemplateResponse, status_code=201)
def create_template(
    payload: TemplateCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new invoice template.

    If is_default=True, all other templates for this org are unset first.
    """
    org_id = _get_org_id(current_user, db)

    if payload.is_default:
        # Unset all existing defaults for this org
        db.query(InvoiceTemplate).filter(
            InvoiceTemplate.org_id == org_id,
            InvoiceTemplate.is_default == True,  # noqa: E712
        ).update({"is_default": False}, synchronize_session=False)

    tmpl = InvoiceTemplate(
        org_id=org_id,
        **payload.model_dump(),
    )
    db.add(tmpl)
    db.commit()
    db.refresh(tmpl)

    logger.info("[Template] Created id=%d name=%s org=%d", tmpl.id, tmpl.name, org_id)
    return tmpl


@router.get("/{template_id}", response_model=TemplateResponse)
def get_template(
    template_id: int = Path(..., ge=1),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a single template by ID (must belong to caller's org)."""
    org_id = _get_org_id(current_user, db)
    return _get_template_or_404(template_id, org_id, db)


@router.put("/{template_id}", response_model=TemplateResponse)
def update_template(
    payload: TemplateUpdate,
    template_id: int = Path(..., ge=1),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update an existing template. Only provided fields are changed.

    If is_default=True, all other templates for this org are unset first.
    """
    org_id = _get_org_id(current_user, db)
    tmpl = _get_template_or_404(template_id, org_id, db)

    update_data = payload.model_dump(exclude_unset=True)

    if update_data.get("is_default"):
        # Unset all other defaults for this org
        db.query(InvoiceTemplate).filter(
            InvoiceTemplate.org_id == org_id,
            InvoiceTemplate.id != template_id,
            InvoiceTemplate.is_default == True,  # noqa: E712
        ).update({"is_default": False}, synchronize_session=False)

    for field, value in update_data.items():
        setattr(tmpl, field, value)

    db.commit()
    db.refresh(tmpl)

    logger.info("[Template] Updated id=%d org=%d", template_id, org_id)
    return tmpl


@router.delete("/{template_id}")
def delete_template(
    template_id: int = Path(..., ge=1),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a template.

    Raises 409 if the template is the only one for this org and is_default=True.
    """
    org_id = _get_org_id(current_user, db)
    tmpl = _get_template_or_404(template_id, org_id, db)

    # Guard: cannot delete the sole default template
    if tmpl.is_default:
        count = (
            db.query(InvoiceTemplate)
            .filter(InvoiceTemplate.org_id == org_id)
            .count()
        )
        if count == 1:
            raise HTTPException(
                status_code=409,
                detail="Kann die einzige Standard-Vorlage nicht loeschen",
            )

    db.delete(tmpl)
    db.commit()

    logger.info("[Template] Deleted id=%d org=%d", template_id, org_id)
    return {"message": "Vorlage geloescht", "template_id": template_id}
