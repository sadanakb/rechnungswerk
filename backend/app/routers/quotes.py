"""
Quote (Angebot) endpoints — CRUD, status transitions, PDF generation, and conversion to invoice.
"""
import io
import logging
import os
import re
import tempfile
import uuid
from datetime import datetime, date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Quote, Invoice, Organization
from app.schemas_quotes import (
    QuoteCreate,
    QuoteUpdate,
    QuoteResponse,
    QuoteDetailResponse,
    QuoteListResponse,
)
from app.auth_jwt import get_current_user
from app.quote_number_service import generate_next_quote_number
from app.storage import get_storage

logger = logging.getLogger(__name__)

router = APIRouter()


def _storage_path(org_id, category: str, filename: str) -> str:
    if org_id:
        return f"{org_id}/{category}/{filename}"
    return f"shared/{category}/{filename}"


def _ensure_quote_belongs_to_org(quote: Quote, org_id: Optional[str]) -> None:
    """Raise 404 if the quote does not belong to the caller's organization.

    Returns 404 (not 403) to avoid revealing that the resource exists to
    unauthorized callers.
    """
    if org_id is None:
        raise HTTPException(status_code=401, detail="Organisation nicht gefunden")
    if str(quote.organization_id) != str(org_id):
        raise HTTPException(
            status_code=404,
            detail="Angebot nicht gefunden",
        )


def _calculate_amounts(line_items, tax_rate):
    """Calculate net, tax, and gross amounts from line items."""
    net_amount = Decimal('0')
    for item in (line_items or []):
        if item.get("net_amount") is not None:
            item_net = Decimal(str(item["net_amount"]))
        else:
            qty = Decimal(str(item.get("quantity", 1)))
            price = Decimal(str(item.get("unit_price", 0)))
            item_net = qty * price
        net_amount += item_net

    tax = Decimal(str(tax_rate or 19))
    tax_amount = (net_amount * tax / Decimal('100')).quantize(Decimal('0.01'))
    gross_amount = net_amount + tax_amount

    return net_amount, tax_amount, gross_amount


@router.post("/quotes/create", response_model=QuoteResponse)
async def create_quote(
    data: QuoteCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Create a new quote (Angebot)."""
    org_id = current_user.get("org_id")
    if not org_id:
        raise HTTPException(status_code=401, detail="Organisation nicht gefunden")
    user_id = current_user.get("user_id")

    # Generate public-facing quote_id
    quote_id = f"ANB-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6]}"

    # Generate sequential quote number
    quote_number = generate_next_quote_number(db, int(org_id))

    # Calculate amounts from line items
    net_amount = Decimal('0')
    tax_amount = Decimal('0')
    gross_amount = Decimal('0')
    serialized_items = None

    if data.line_items:
        items_dicts = [item.model_dump() for item in data.line_items]
        # Calculate net_amount for each item if not provided
        for item_dict in items_dicts:
            if item_dict.get("net_amount") is None:
                item_dict["net_amount"] = float(
                    Decimal(str(item_dict["quantity"])) * Decimal(str(item_dict["unit_price"]))
                )
            # Convert Decimal to float for JSON serialization
            for k, v in item_dict.items():
                if isinstance(v, Decimal):
                    item_dict[k] = float(v)
        serialized_items = items_dicts
        net_amount, tax_amount, gross_amount = _calculate_amounts(items_dicts, data.tax_rate)

    db_quote = Quote(
        quote_id=quote_id,
        quote_number=quote_number,
        status='draft',
        quote_date=data.quote_date or date.today(),
        valid_until=data.valid_until,
        seller_name=data.seller_name,
        seller_vat_id=data.seller_vat_id,
        seller_address=data.seller_address,
        buyer_name=data.buyer_name,
        buyer_vat_id=data.buyer_vat_id,
        buyer_address=data.buyer_address,
        net_amount=net_amount,
        tax_amount=tax_amount,
        gross_amount=gross_amount,
        tax_rate=data.tax_rate or Decimal('19.00'),
        currency=data.currency or 'EUR',
        line_items=serialized_items,
        intro_text=data.intro_text,
        closing_text=data.closing_text,
        internal_notes=data.internal_notes,
        iban=data.iban,
        bic=data.bic,
        payment_account_name=data.payment_account_name,
        organization_id=int(org_id),
        created_by=int(user_id) if user_id else None,
    )

    db.add(db_quote)
    db.commit()
    db.refresh(db_quote)

    return db_quote


@router.get("/quotes/list", response_model=QuoteListResponse)
async def list_quotes(
    status: Optional[str] = Query(None, description="Filter by status"),
    search: Optional[str] = Query(None, description="Search quote_number and buyer_name"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List quotes with optional filters (filtered by org)."""
    org_id = current_user.get("org_id")
    if not org_id:
        raise HTTPException(status_code=401, detail="Organisation nicht gefunden")

    query = db.query(Quote)
    query = query.filter(Quote.organization_id == int(org_id))

    # Optional filters
    if status:
        query = query.filter(Quote.status == status)
    if search:
        safe_search = search.replace('%', r'\%').replace('_', r'\_')
        query = query.filter(
            or_(
                Quote.quote_number.ilike(f"%{safe_search}%", escape='\\'),
                Quote.buyer_name.ilike(f"%{safe_search}%", escape='\\'),
            )
        )

    total = query.count()
    quotes = query.order_by(Quote.created_at.desc()).offset(skip).limit(limit).all()

    return QuoteListResponse(quotes=quotes, total=total)


@router.get("/quotes/{quote_id}", response_model=QuoteDetailResponse)
async def get_quote(
    quote_id: str = Path(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get quote detail by quote_id."""
    quote = db.query(Quote).filter(Quote.quote_id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Angebot nicht gefunden")

    _ensure_quote_belongs_to_org(quote, current_user.get("org_id"))

    return quote


@router.put("/quotes/{quote_id}", response_model=QuoteDetailResponse)
async def update_quote(
    data: QuoteUpdate,
    quote_id: str = Path(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Update a quote."""
    quote = db.query(Quote).filter(Quote.quote_id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Angebot nicht gefunden")

    _ensure_quote_belongs_to_org(quote, current_user.get("org_id"))

    # Only allow editing draft/sent quotes
    if quote.status in ('converted',):
        raise HTTPException(
            status_code=400,
            detail="Konvertierte Angebote koennen nicht bearbeitet werden",
        )

    # Update fields that were provided
    update_data = data.model_dump(exclude_unset=True)

    # Handle line items and recalculate amounts
    if "line_items" in update_data and update_data["line_items"] is not None:
        items_dicts = []
        for item in update_data["line_items"]:
            if isinstance(item, dict):
                item_dict = item
            else:
                item_dict = item.model_dump() if hasattr(item, 'model_dump') else dict(item)
            if item_dict.get("net_amount") is None:
                item_dict["net_amount"] = float(
                    Decimal(str(item_dict["quantity"])) * Decimal(str(item_dict["unit_price"]))
                )
            for k, v in item_dict.items():
                if isinstance(v, Decimal):
                    item_dict[k] = float(v)
            items_dicts.append(item_dict)

        quote.line_items = items_dicts
        tax_rate = update_data.get("tax_rate", quote.tax_rate)
        net_amount, tax_amount, gross_amount = _calculate_amounts(items_dicts, tax_rate)
        quote.net_amount = net_amount
        quote.tax_amount = tax_amount
        quote.gross_amount = gross_amount

    # Update simple fields
    simple_fields = [
        'quote_date', 'valid_until', 'seller_name', 'seller_vat_id', 'seller_address',
        'buyer_name', 'buyer_vat_id', 'buyer_address', 'tax_rate', 'currency',
        'intro_text', 'closing_text', 'internal_notes', 'iban', 'bic',
        'payment_account_name',
    ]
    for field in simple_fields:
        if field in update_data:
            setattr(quote, field, update_data[field])

    db.commit()
    db.refresh(quote)

    return quote


@router.delete("/quotes/{quote_id}")
async def delete_quote(
    quote_id: str = Path(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Delete a quote (only if status is draft)."""
    quote = db.query(Quote).filter(Quote.quote_id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Angebot nicht gefunden")

    _ensure_quote_belongs_to_org(quote, current_user.get("org_id"))

    if quote.status != 'draft':
        raise HTTPException(
            status_code=400,
            detail="Nur Entwuerfe koennen geloescht werden",
        )

    # Clean up PDF if exists
    if quote.pdf_path:
        try:
            storage = get_storage()
            storage.delete(quote.pdf_path)
        except Exception:
            pass

    db.delete(quote)
    db.commit()

    return {"detail": "Angebot geloescht"}


@router.post("/quotes/{quote_id}/send")
async def send_quote(
    quote_id: str = Path(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Change quote status to 'sent'."""
    quote = db.query(Quote).filter(Quote.quote_id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Angebot nicht gefunden")

    _ensure_quote_belongs_to_org(quote, current_user.get("org_id"))

    if quote.status not in ('draft',):
        raise HTTPException(
            status_code=400,
            detail="Nur Entwuerfe koennen gesendet werden",
        )

    quote.status = 'sent'
    db.commit()
    db.refresh(quote)

    return {"detail": "Angebot gesendet", "status": quote.status}


@router.post("/quotes/{quote_id}/accept")
async def accept_quote(
    quote_id: str = Path(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Change quote status to 'accepted'."""
    quote = db.query(Quote).filter(Quote.quote_id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Angebot nicht gefunden")

    _ensure_quote_belongs_to_org(quote, current_user.get("org_id"))

    if quote.status not in ('sent',):
        raise HTTPException(
            status_code=400,
            detail="Nur gesendete Angebote koennen angenommen werden",
        )

    quote.status = 'accepted'
    db.commit()
    db.refresh(quote)

    return {"detail": "Angebot angenommen", "status": quote.status}


@router.post("/quotes/{quote_id}/reject")
async def reject_quote(
    quote_id: str = Path(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Change quote status to 'rejected'."""
    quote = db.query(Quote).filter(Quote.quote_id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Angebot nicht gefunden")

    _ensure_quote_belongs_to_org(quote, current_user.get("org_id"))

    if quote.status not in ('sent',):
        raise HTTPException(
            status_code=400,
            detail="Nur gesendete Angebote koennen abgelehnt werden",
        )

    quote.status = 'rejected'
    db.commit()
    db.refresh(quote)

    return {"detail": "Angebot abgelehnt", "status": quote.status}


@router.post("/quotes/{quote_id}/convert")
async def convert_quote_to_invoice(
    quote_id: str = Path(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Convert a quote to an invoice. Copies all data and creates a new Invoice."""
    quote = db.query(Quote).filter(Quote.quote_id == quote_id).with_for_update().first()
    if not quote:
        raise HTTPException(status_code=404, detail="Angebot nicht gefunden")

    _ensure_quote_belongs_to_org(quote, current_user.get("org_id"))

    if quote.status not in ('accepted',):
        raise HTTPException(
            status_code=400,
            detail="Nur angenommene Angebote koennen in Rechnungen umgewandelt werden",
        )

    org_id = current_user.get("org_id")
    if not org_id:
        raise HTTPException(status_code=401, detail="Organisation nicht gefunden")

    # Generate invoice ID
    invoice_id = f"INV-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:8]}"

    # Generate invoice number
    from app.invoice_number_service import generate_next_invoice_number
    invoice_number = generate_next_invoice_number(db, int(org_id))

    # Create invoice from quote data
    db_invoice = Invoice(
        invoice_id=invoice_id,
        invoice_number=invoice_number,
        invoice_date=date.today(),
        seller_name=quote.seller_name,
        seller_vat_id=quote.seller_vat_id,
        seller_address=quote.seller_address,
        buyer_name=quote.buyer_name,
        buyer_vat_id=quote.buyer_vat_id,
        buyer_address=quote.buyer_address,
        net_amount=quote.net_amount,
        tax_amount=quote.tax_amount,
        gross_amount=quote.gross_amount,
        tax_rate=quote.tax_rate,
        currency=quote.currency,
        line_items=quote.line_items,
        iban=quote.iban,
        bic=quote.bic,
        payment_account_name=quote.payment_account_name,
        source_type="quote",
        validation_status="pending",
        organization_id=int(org_id),
        quote_id=quote.id,
    )

    db.add(db_invoice)
    db.flush()

    # Update quote status and link
    quote.status = 'converted'
    quote.converted_invoice_id = db_invoice.id
    db.commit()
    db.refresh(db_invoice)

    return {
        "detail": "Angebot in Rechnung konvertiert",
        "invoice_id": db_invoice.invoice_id,
        "invoice_number": db_invoice.invoice_number,
        "quote_status": "converted",
    }


@router.get("/quotes/{quote_id}/pdf")
async def get_quote_pdf(
    quote_id: str = Path(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Generate and return the quote PDF."""
    quote = db.query(Quote).filter(Quote.quote_id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Angebot nicht gefunden")

    _ensure_quote_belongs_to_org(quote, current_user.get("org_id"))

    org = db.query(Organization).filter(Organization.id == quote.organization_id).first()

    # Build quote data dict
    quote_data = {
        'quote_number': quote.quote_number or quote.quote_id,
        'quote_date': str(quote.quote_date) if quote.quote_date else '',
        'valid_until': str(quote.valid_until) if quote.valid_until else None,
        'seller_name': quote.seller_name or '',
        'seller_vat_id': quote.seller_vat_id,
        'seller_address': quote.seller_address or '',
        'buyer_name': quote.buyer_name or '',
        'buyer_vat_id': quote.buyer_vat_id,
        'buyer_address': quote.buyer_address or '',
        'net_amount': float(quote.net_amount or 0),
        'tax_rate': float(quote.tax_rate or 19),
        'tax_amount': float(quote.tax_amount or 0),
        'gross_amount': float(quote.gross_amount or 0),
        'currency': quote.currency or 'EUR',
        'line_items': quote.line_items or [],
        'intro_text': quote.intro_text,
        'closing_text': quote.closing_text,
        'iban': quote.iban,
        'bic': quote.bic,
        'payment_account_name': quote.payment_account_name,
        'logo_url': org.logo_url if org else None,
    }

    # Generate PDF
    try:
        from app.quote_pdf_generator import generate_quote_pdf

        org_id = current_user.get("org_id")
        pdf_filename = f"{quote.quote_id}.pdf"
        storage = get_storage()

        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = os.path.join(tmp_dir, pdf_filename)
            generate_quote_pdf(quote_data, tmp_path)
            with open(tmp_path, "rb") as f:
                pdf_bytes = f.read()

        path = _storage_path(org_id, "quote_pdfs", pdf_filename)
        storage.save(path, pdf_bytes)

        # Update pdf_path on quote
        quote.pdf_path = path
        db.commit()

        safe_name = re.sub(r'[^a-zA-Z0-9_-]', '_', quote.quote_number or quote.quote_id)
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="Angebot_{safe_name}.pdf"'
            },
        )
    except ImportError:
        raise HTTPException(status_code=500, detail="PDF-Generierung nicht verfuegbar")
    except Exception as e:
        logger.error("Quote PDF generation failed for %s: %s", quote_id, e)
        raise HTTPException(status_code=500, detail="PDF-Generierung fehlgeschlagen")
