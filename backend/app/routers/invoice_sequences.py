"""
Router for configurable invoice number sequences.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models import InvoiceNumberSequence
from app.auth_jwt import get_current_user
from app.invoice_number_service import preview_format

router = APIRouter(prefix="/api/invoice-sequences", tags=["invoice-sequences"])


def _get_org_id(current_user, db) -> int:
    """Resolve org_id from current_user (same pattern as other routers)."""
    from app.models import OrganizationMember
    if isinstance(current_user, dict):
        user_id = current_user.get("user_id") or current_user.get("id")
        if not user_id:
            return 0
        member = db.query(OrganizationMember).filter(
            OrganizationMember.user_id == user_id
        ).first()
        return member.organization_id if member else 0
    return getattr(current_user, 'org_id', 0)


class SequenceConfig(BaseModel):
    prefix: str = "RE"
    separator: str = "-"
    year_format: str = "YYYY"
    padding: int = 4
    reset_yearly: bool = True


@router.get("")
def get_sequence(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Return current sequence config for the authenticated org."""
    org_id = _get_org_id(current_user, db)
    seq = db.query(InvoiceNumberSequence).filter(
        InvoiceNumberSequence.org_id == org_id
    ).first()
    if not seq:
        return {
            "configured": False,
            "preview": preview_format("RE", "-", "YYYY", 4),
        }
    return {
        "configured": True,
        "id": seq.id,
        "org_id": seq.org_id,
        "prefix": seq.prefix,
        "separator": seq.separator,
        "year_format": seq.year_format,
        "padding": seq.padding,
        "current_counter": seq.current_counter,
        "reset_yearly": seq.reset_yearly,
        "last_reset_year": seq.last_reset_year,
        "preview": preview_format(seq.prefix, seq.separator, seq.year_format, seq.padding),
    }


@router.post("", status_code=200)
def create_or_update_sequence(
    body: SequenceConfig,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create or update the invoice number sequence config for the authenticated org."""
    org_id = _get_org_id(current_user, db)
    if not body.prefix.strip():
        raise HTTPException(400, "Praefix darf nicht leer sein")
    if body.padding < 1 or body.padding > 10:
        raise HTTPException(400, "Padding muss zwischen 1 und 10 liegen")

    seq = db.query(InvoiceNumberSequence).filter(
        InvoiceNumberSequence.org_id == org_id
    ).first()

    if seq:
        seq.prefix = body.prefix
        seq.separator = body.separator
        seq.year_format = body.year_format
        seq.padding = body.padding
        seq.reset_yearly = body.reset_yearly
    else:
        seq = InvoiceNumberSequence(
            org_id=org_id,
            prefix=body.prefix,
            separator=body.separator,
            year_format=body.year_format,
            padding=body.padding,
            reset_yearly=body.reset_yearly,
        )
        db.add(seq)

    db.commit()
    db.refresh(seq)
    return {
        "ok": True,
        "preview": preview_format(seq.prefix, seq.separator, seq.year_format, seq.padding),
    }


@router.get("/preview")
def get_preview(
    prefix: str = "RE",
    separator: str = "-",
    year_format: str = "YYYY",
    padding: int = 4,
    current_user=Depends(get_current_user),
):
    """Return a live preview of the invoice number format without saving."""
    return {"preview": preview_format(prefix, separator, year_format, padding)}
