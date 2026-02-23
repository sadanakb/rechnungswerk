"""
Wiederkehrende Rechnungen — CRUD und Auslösung.

Verwaltet Rechnungsvorlagen die periodisch (monatlich, vierteljährlich,
halbjährlich, jährlich) neue Rechnungen generieren.
"""
import uuid
import logging
from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import RecurringInvoice, Invoice
from app.auth import verify_api_key
from app.recurring.scheduler import RecurringScheduler

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/recurring",
    tags=["Recurring"],
    dependencies=[Depends(verify_api_key)],
)

VALID_FREQUENCIES = {"monthly", "quarterly", "half-yearly", "yearly"}


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class LineItemIn(BaseModel):
    description: str
    quantity: float = Field(default=1.0, gt=0)
    unit_price: float = Field(ge=0)
    net_amount: float = Field(ge=0)
    tax_rate: float = Field(default=19.0, ge=0)


class RecurringCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    frequency: str = Field(..., pattern="^(monthly|quarterly|half-yearly|yearly)$")
    next_date: date
    number_prefix: str = Field(default="RE", max_length=10)
    payment_days: int = Field(default=14, ge=0, le=365)
    seller_name: str = Field(..., min_length=1)
    seller_vat_id: str = Field(..., min_length=5)
    seller_address: Optional[str] = None
    buyer_name: str = Field(..., min_length=1)
    buyer_vat_id: Optional[str] = None
    buyer_address: Optional[str] = None
    line_items: List[LineItemIn] = Field(..., min_length=1)
    tax_rate: float = Field(default=19.0, ge=0, le=100)
    currency: str = Field(default="EUR", pattern="^[A-Z]{3}$")
    iban: Optional[str] = None
    bic: Optional[str] = None
    payment_account_name: Optional[str] = None
    buyer_reference: Optional[str] = None
    seller_endpoint_id: Optional[str] = None
    buyer_endpoint_id: Optional[str] = None


class RecurringUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    frequency: Optional[str] = Field(default=None, pattern="^(monthly|quarterly|half-yearly|yearly)$")
    next_date: Optional[date] = None
    payment_days: Optional[int] = Field(default=None, ge=0, le=365)
    buyer_name: Optional[str] = None
    buyer_vat_id: Optional[str] = None
    buyer_address: Optional[str] = None
    line_items: Optional[List[LineItemIn]] = None
    tax_rate: Optional[float] = Field(default=None, ge=0, le=100)
    currency: Optional[str] = Field(default=None, pattern="^[A-Z]{3}$")
    iban: Optional[str] = None
    bic: Optional[str] = None
    payment_account_name: Optional[str] = None


class RecurringResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    template_id: str
    name: str
    active: bool
    frequency: str
    next_date: date
    last_generated: Optional[date]
    number_prefix: str
    payment_days: int
    seller_name: str
    seller_vat_id: str
    seller_address: Optional[str]
    buyer_name: str
    buyer_vat_id: Optional[str]
    buyer_address: Optional[str]
    line_items: list
    tax_rate: float
    currency: str
    iban: Optional[str]
    bic: Optional[str]
    payment_account_name: Optional[str]
    buyer_reference: Optional[str]
    seller_endpoint_id: Optional[str]
    buyer_endpoint_id: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]

    # Computed helpers
    net_amount: float = 0.0

    @classmethod
    def from_orm_with_net(cls, obj: RecurringInvoice) -> "RecurringResponse":
        """Build response and compute net_amount from line_items."""
        items = obj.line_items or []
        net = sum(float(i.get("net_amount", 0)) for i in items if isinstance(i, dict))
        data = cls.model_validate(obj)
        data.net_amount = round(net, 2)
        return data


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_or_404(db: Session, template_id: str) -> RecurringInvoice:
    tmpl = db.query(RecurringInvoice).filter(RecurringInvoice.template_id == template_id).first()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Vorlage nicht gefunden")
    return tmpl


def _template_to_dict(tmpl: RecurringInvoice) -> dict:
    """Konvertiert ein RecurringInvoice-Objekt in ein Dict für den Scheduler."""
    return {
        "template_id": tmpl.template_id,
        "number_prefix": tmpl.number_prefix,
        "payment_days": tmpl.payment_days,
        "seller_name": tmpl.seller_name,
        "seller_vat_id": tmpl.seller_vat_id,
        "seller_address": tmpl.seller_address,
        "buyer_name": tmpl.buyer_name,
        "buyer_vat_id": tmpl.buyer_vat_id,
        "buyer_address": tmpl.buyer_address,
        "line_items": tmpl.line_items or [],
        "tax_rate": float(tmpl.tax_rate),
        "currency": tmpl.currency,
        "iban": tmpl.iban,
        "bic": tmpl.bic,
        "payment_account_name": tmpl.payment_account_name,
        "buyer_reference": tmpl.buyer_reference,
        "seller_endpoint_id": tmpl.seller_endpoint_id,
        "buyer_endpoint_id": tmpl.buyer_endpoint_id,
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=dict)
def list_recurring(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Alle Vorlagen auflisten."""
    total = db.query(RecurringInvoice).count()
    items = (
        db.query(RecurringInvoice)
        .order_by(RecurringInvoice.name)
        .offset(skip)
        .limit(limit)
        .all()
    )
    return {
        "items": [RecurringResponse.from_orm_with_net(t).model_dump() for t in items],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.post("", response_model=RecurringResponse, status_code=201)
def create_recurring(data: RecurringCreate, db: Session = Depends(get_db)):
    """Neue Rechnungsvorlage anlegen."""
    tmpl = RecurringInvoice(
        template_id=f"tmpl-{uuid.uuid4().hex[:12]}",
        name=data.name,
        active=True,
        frequency=data.frequency,
        next_date=data.next_date,
        number_prefix=data.number_prefix,
        payment_days=data.payment_days,
        seller_name=data.seller_name,
        seller_vat_id=data.seller_vat_id,
        seller_address=data.seller_address,
        buyer_name=data.buyer_name,
        buyer_vat_id=data.buyer_vat_id,
        buyer_address=data.buyer_address,
        line_items=[item.model_dump() for item in data.line_items],
        tax_rate=Decimal(str(data.tax_rate)),
        currency=data.currency,
        iban=data.iban,
        bic=data.bic,
        payment_account_name=data.payment_account_name,
        buyer_reference=data.buyer_reference,
        seller_endpoint_id=data.seller_endpoint_id,
        buyer_endpoint_id=data.buyer_endpoint_id,
    )
    db.add(tmpl)
    db.commit()
    db.refresh(tmpl)
    logger.info("Vorlage erstellt: %s (%s)", tmpl.name, tmpl.template_id)
    return RecurringResponse.from_orm_with_net(tmpl)


@router.get("/{template_id}", response_model=RecurringResponse)
def get_recurring(
    template_id: str = Path(...),
    db: Session = Depends(get_db),
):
    """Einzelne Vorlage abrufen."""
    return RecurringResponse.from_orm_with_net(_get_or_404(db, template_id))


@router.put("/{template_id}", response_model=RecurringResponse)
def update_recurring(
    data: RecurringUpdate,
    template_id: str = Path(...),
    db: Session = Depends(get_db),
):
    """Vorlage aktualisieren."""
    tmpl = _get_or_404(db, template_id)
    update_data = data.model_dump(exclude_unset=True)

    if "line_items" in update_data and update_data["line_items"] is not None:
        update_data["line_items"] = [
            item.model_dump() if hasattr(item, "model_dump") else item
            for item in update_data["line_items"]
        ]
    if "tax_rate" in update_data and update_data["tax_rate"] is not None:
        update_data["tax_rate"] = Decimal(str(update_data["tax_rate"]))

    for field, value in update_data.items():
        setattr(tmpl, field, value)

    db.commit()
    db.refresh(tmpl)
    logger.info("Vorlage aktualisiert: %s", template_id)
    return RecurringResponse.from_orm_with_net(tmpl)


@router.delete("/{template_id}")
def delete_recurring(
    template_id: str = Path(...),
    db: Session = Depends(get_db),
):
    """Vorlage löschen."""
    tmpl = _get_or_404(db, template_id)
    db.delete(tmpl)
    db.commit()
    logger.info("Vorlage gelöscht: %s", template_id)
    return {"message": "Vorlage gelöscht", "template_id": template_id}


@router.post("/{template_id}/toggle", response_model=RecurringResponse)
def toggle_recurring(
    template_id: str = Path(...),
    db: Session = Depends(get_db),
):
    """Vorlage aktivieren oder pausieren."""
    tmpl = _get_or_404(db, template_id)
    tmpl.active = not tmpl.active
    db.commit()
    db.refresh(tmpl)
    status = "aktiviert" if tmpl.active else "pausiert"
    logger.info("Vorlage %s: %s", status, template_id)
    return RecurringResponse.from_orm_with_net(tmpl)


@router.post("/{template_id}/trigger", response_model=dict)
def trigger_recurring(
    template_id: str = Path(...),
    db: Session = Depends(get_db),
):
    """
    Jetzt eine Rechnung aus der Vorlage generieren.

    Erstellt sofort eine neue Rechnung in der Rechnungsliste und
    aktualisiert next_date auf das nächste Fälligkeitsdatum.
    """
    tmpl = _get_or_404(db, template_id)

    today = date.today()
    template_dict = _template_to_dict(tmpl)
    invoice_data = RecurringScheduler.generate_invoice_data(template_dict, today)

    # Beträge aus Line Items berechnen
    line_items = template_dict.get("line_items", [])
    net = round(sum(float(i.get("net_amount", 0)) for i in line_items if isinstance(i, dict)), 2)
    tax_rate = float(tmpl.tax_rate)
    tax = round(net * tax_rate / 100, 2)
    gross = round(net + tax, 2)

    # Rechnung anlegen
    inv = Invoice(
        invoice_id=f"INV-{today.strftime('%Y%m%d')}-{uuid.uuid4().hex[:8]}",
        invoice_number=invoice_data["invoice_number"],
        invoice_date=today,
        due_date=invoice_data.get("due_date", today),
        seller_name=invoice_data.get("seller_name", ""),
        seller_vat_id=invoice_data.get("seller_vat_id", ""),
        seller_address=invoice_data.get("seller_address"),
        buyer_name=invoice_data.get("buyer_name", ""),
        buyer_vat_id=invoice_data.get("buyer_vat_id"),
        buyer_address=invoice_data.get("buyer_address"),
        line_items=line_items,
        net_amount=net,
        tax_amount=tax,
        gross_amount=gross,
        tax_rate=tax_rate,
        currency=tmpl.currency,
        iban=tmpl.iban,
        bic=tmpl.bic,
        payment_account_name=tmpl.payment_account_name,
        buyer_reference=tmpl.buyer_reference,
        seller_endpoint_id=tmpl.seller_endpoint_id,
        seller_endpoint_scheme="EM",
        buyer_endpoint_id=tmpl.buyer_endpoint_id,
        buyer_endpoint_scheme="EM",
        source_type="recurring",
        validation_status="pending",
    )
    db.add(inv)

    # Vorlage aktualisieren
    tmpl.last_generated = today
    tmpl.next_date = RecurringScheduler.calculate_next_date(today, tmpl.frequency)

    db.commit()
    db.refresh(inv)

    logger.info(
        "Rechnung generiert aus Vorlage %s: %s (nächste: %s)",
        template_id, inv.invoice_id, tmpl.next_date,
    )
    return {
        "message": "Rechnung erfolgreich generiert",
        "invoice_id": inv.invoice_id,
        "invoice_number": inv.invoice_number,
        "gross_amount": float(gross),
        "next_date": str(tmpl.next_date),
    }
