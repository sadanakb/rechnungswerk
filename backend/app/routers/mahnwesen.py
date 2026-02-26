"""
Mahnwesen (Dunning) endpoints for overdue invoice management.

Supports up to 3 dunning levels:
  1 — Zahlungserinnerung (payment reminder)
  2 — 1. Mahnung (first dunning notice)
  3 — 2. Mahnung (final dunning notice)
"""
import logging
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Invoice, Mahnung
from app.schemas_mahnwesen import MahnungResponse, OverdueInvoiceResponse
from app.auth_jwt import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/mahnwesen", tags=["Mahnwesen"])

MAHNUNG_CONFIG = {
    1: {"fee": Decimal("5.00"), "interest_rate": Decimal("0.00"), "label": "Zahlungserinnerung"},
    2: {"fee": Decimal("10.00"), "interest_rate": Decimal("5.00"), "label": "1. Mahnung"},
    3: {"fee": Decimal("15.00"), "interest_rate": Decimal("8.00"), "label": "2. Mahnung (letzte)"},
}


# IMPORTANT: /overdue must be defined BEFORE /{invoice_id} to avoid path conflicts
@router.get("/overdue", response_model=List[OverdueInvoiceResponse])
def list_overdue_invoices(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List all overdue invoices for the current user's organization."""
    org_id = current_user.get("org_id")

    query = db.query(Invoice).filter(
        Invoice.due_date < date.today(),
    )
    if org_id:
        query = query.filter(Invoice.organization_id == org_id)

    overdue_invoices = query.all()
    today = date.today()

    results = []
    for inv in overdue_invoices:
        mahnung_count = db.query(Mahnung).filter(
            Mahnung.invoice_id == inv.invoice_id
        ).count()

        days_overdue = (today - inv.due_date).days

        results.append(OverdueInvoiceResponse(
            invoice_id=inv.invoice_id,
            invoice_number=inv.invoice_number or "",
            buyer_name=inv.buyer_name or "",
            gross_amount=float(inv.gross_amount or 0),
            due_date=str(inv.due_date),
            days_overdue=days_overdue,
            mahnung_count=mahnung_count,
        ))

    return results


@router.get("/{invoice_id}", response_model=List[MahnungResponse])
def list_mahnungen(
    invoice_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List all Mahnungen (dunning notices) for a specific invoice."""
    invoice = db.query(Invoice).filter(Invoice.invoice_id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")

    mahnungen = (
        db.query(Mahnung)
        .filter(Mahnung.invoice_id == invoice_id)
        .order_by(Mahnung.level)
        .all()
    )
    return mahnungen


@router.post("/{invoice_id}/mahnung", response_model=MahnungResponse, status_code=201)
def create_mahnung(
    invoice_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Create the next dunning level for an overdue invoice.

    Levels: 1 (Zahlungserinnerung) -> 2 (1. Mahnung) -> 3 (2. Mahnung).
    Returns 400 if invoice already has 3 Mahnungen.
    """
    invoice = db.query(Invoice).filter(Invoice.invoice_id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")

    # Determine next level
    existing_count = (
        db.query(Mahnung)
        .filter(Mahnung.invoice_id == invoice_id)
        .count()
    )
    next_level = existing_count + 1

    if next_level > 3:
        raise HTTPException(
            status_code=400,
            detail="Maximale Mahnstufe (3) bereits erreicht",
        )

    config = MAHNUNG_CONFIG[next_level]
    gross_amount = Decimal(str(invoice.gross_amount or 0))

    # Calculate interest: (gross_amount * interest_rate / 100)
    interest = (gross_amount * config["interest_rate"] / Decimal("100")).quantize(Decimal("0.01"))
    fee = config["fee"]
    total_due = gross_amount + fee + interest

    # Determine organization_id
    org_id = current_user.get("org_id") or invoice.organization_id
    if not org_id:
        # Fallback: use 1 if no org context available
        org_id = invoice.organization_id or 1

    mahnung = Mahnung(
        mahnung_id=f"MAH-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex[:8]}",
        invoice_id=invoice_id,
        organization_id=org_id,
        level=next_level,
        fee=fee,
        interest=interest,
        total_due=total_due,
        status="created",
    )

    db.add(mahnung)
    db.commit()
    db.refresh(mahnung)

    logger.info(
        "Mahnung created: %s (level %d) for invoice %s",
        mahnung.mahnung_id, next_level, invoice_id,
    )

    return mahnung
