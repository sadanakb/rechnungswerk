"""
Contact management endpoints — customers and suppliers.

GET    /api/contacts          — list contacts (with type + search filter)
POST   /api/contacts          — create contact
GET    /api/contacts/{id}     — get single contact
PATCH  /api/contacts/{id}     — update contact
DELETE /api/contacts/{id}     — soft-delete contact (is_active = False)
"""
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Contact, OrganizationMember
from app.auth_jwt import get_current_user

router = APIRouter(prefix="/api/contacts", tags=["contacts"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ContactCreate(BaseModel):
    type: str = "customer"
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    zip: Optional[str] = None
    country: str = "DE"
    vat_id: Optional[str] = None
    payment_terms: int = 30
    notes: Optional[str] = None


class ContactResponse(BaseModel):
    id: int
    org_id: int
    type: str
    name: str
    email: Optional[str]
    phone: Optional[str]
    address_line1: Optional[str]
    address_line2: Optional[str]
    city: Optional[str]
    zip: Optional[str]
    country: str
    vat_id: Optional[str]
    payment_terms: int
    notes: Optional[str]
    is_active: bool
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _resolve_org_id(current_user: dict, db: Session) -> int:
    """
    Resolve the org_id for the current user via OrganizationMember.
    In dev mode (user_id == 'dev-user'), returns 0 as a sentinel org.
    """
    raw_user_id = current_user.get("user_id")
    if raw_user_id == "dev-user":
        # Development / test mode without JWT — use sentinel org 0
        return 0

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

@router.get("", response_model=list[ContactResponse])
def list_contacts(
    type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all active contacts for the current organisation."""
    org_id = _resolve_org_id(current_user, db)
    q = db.query(Contact).filter(
        Contact.org_id == org_id,
        Contact.is_active == True,  # noqa: E712
    )
    if type:
        q = q.filter(Contact.type == type)
    if search:
        q = q.filter(Contact.name.ilike(f"%{search}%"))
    return q.order_by(Contact.name).all()


@router.post("", response_model=ContactResponse, status_code=201)
def create_contact(
    body: ContactCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new contact for the current organisation."""
    if body.type not in ("customer", "supplier"):
        raise HTTPException(400, "type muss 'customer' oder 'supplier' sein")
    org_id = _resolve_org_id(current_user, db)
    contact = Contact(org_id=org_id, **body.model_dump())
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


@router.get("/{contact_id}", response_model=ContactResponse)
def get_contact(
    contact_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch a single contact by ID (org-scoped)."""
    org_id = _resolve_org_id(current_user, db)
    contact = db.query(Contact).filter(
        Contact.id == contact_id,
        Contact.org_id == org_id,
    ).first()
    if not contact:
        raise HTTPException(404, "Kontakt nicht gefunden")
    return contact


@router.patch("/{contact_id}", response_model=ContactResponse)
def update_contact(
    contact_id: int,
    body: ContactCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update an existing contact (org-scoped)."""
    org_id = _resolve_org_id(current_user, db)
    contact = db.query(Contact).filter(
        Contact.id == contact_id,
        Contact.org_id == org_id,
    ).first()
    if not contact:
        raise HTTPException(404, "Kontakt nicht gefunden")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(contact, k, v)
    db.commit()
    db.refresh(contact)
    return contact


@router.delete("/{contact_id}", status_code=204)
def delete_contact(
    contact_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Soft-delete a contact by setting is_active = False (org-scoped)."""
    org_id = _resolve_org_id(current_user, db)
    contact = db.query(Contact).filter(
        Contact.id == contact_id,
        Contact.org_id == org_id,
    ).first()
    if not contact:
        raise HTTPException(404, "Kontakt nicht gefunden")
    contact.is_active = False
    db.commit()
