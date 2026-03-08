"""
Credit Notes (Gutschriften) endpoints — § 14 UStG compliant
"""
import logging
import uuid
import os
import io
import re
from datetime import datetime, date
from typing import Optional

from fastapi import APIRouter, Depends, Path, Query, Request, HTTPException
from fastapi.responses import StreamingResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Invoice, CreditNote, Organization, OrganizationMember
from app.schemas_credit_notes import (
    CreditNoteCreate,
    CreditNoteResponse,
    CreditNoteDetailResponse,
    CreditNoteListResponse,
)
from app.xrechnung_generator import XRechnungGenerator
from app.zugferd_generator import ZUGFeRDGenerator
from app.auth_jwt import get_current_user
from app.rate_limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter()
xrechnung_gen = XRechnungGenerator()
zugferd_gen = ZUGFeRDGenerator()

# Storage directories
XML_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "generated_xml")
PDF_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "generated_pdf")
os.makedirs(XML_DIR, exist_ok=True)
os.makedirs(PDF_DIR, exist_ok=True)
_XML_BASE = os.path.realpath(XML_DIR)
_PDF_BASE = os.path.realpath(PDF_DIR)


def _next_credit_note_number(db: Session, org_id: int) -> str:
    """Generate the next sequential credit note number for an organization."""
    from sqlalchemy import func
    year = datetime.now().year
    prefix = f"GS-{year}-"
    last = db.query(func.max(CreditNote.credit_note_number)).filter(
        CreditNote.organization_id == org_id,
        CreditNote.credit_note_number.like(f"{prefix}%"),
    ).scalar()
    if last:
        try:
            num = int(last.replace(prefix, "")) + 1
        except ValueError:
            num = 1
    else:
        num = 1
    return f"{prefix}{num:04d}"


@router.post("/credit-notes", response_model=CreditNoteDetailResponse)
@limiter.limit("20/minute")
async def create_credit_note(
    body: CreditNoteCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Create a Vollgutschrift (full credit note) for an existing invoice.

    Copies all data from the original invoice. Only invoice_id and reason are required.
    Generates XRechnung XML and ZUGFeRD PDF automatically.
    """
    org_id = current_user.get("org_id")
    if not org_id:
        raise HTTPException(status_code=403, detail="Organisation erforderlich")

    # Fetch the original invoice
    invoice = db.query(Invoice).filter(Invoice.id == body.original_invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Originalrechnung nicht gefunden")

    # Tenant isolation: invoice must belong to the same org
    if invoice.organization_id != int(org_id):
        raise HTTPException(status_code=403, detail="Zugriff verweigert")

    # Generate IDs
    credit_note_id = f"GS-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:8]}"
    credit_note_number = _next_credit_note_number(db, int(org_id))

    # Create the credit note — copy all data from the invoice
    cn = CreditNote(
        credit_note_id=credit_note_id,
        credit_note_number=credit_note_number,
        original_invoice_id=invoice.id,
        credit_note_date=date.today(),
        # Seller info
        seller_name=invoice.seller_name,
        seller_vat_id=invoice.seller_vat_id,
        seller_address=invoice.seller_address,
        # Buyer info
        buyer_name=invoice.buyer_name,
        buyer_vat_id=invoice.buyer_vat_id,
        buyer_address=invoice.buyer_address,
        # Amounts
        net_amount=invoice.net_amount,
        tax_amount=invoice.tax_amount,
        gross_amount=invoice.gross_amount,
        tax_rate=invoice.tax_rate,
        currency=getattr(invoice, "currency", "EUR") or "EUR",
        # Payment details
        iban=invoice.iban,
        bic=invoice.bic,
        payment_account_name=invoice.payment_account_name,
        # Routing & Reference
        buyer_reference=invoice.buyer_reference,
        seller_endpoint_id=invoice.seller_endpoint_id,
        seller_endpoint_scheme=invoice.seller_endpoint_scheme,
        buyer_endpoint_id=invoice.buyer_endpoint_id,
        buyer_endpoint_scheme=invoice.buyer_endpoint_scheme,
        # Line Items
        line_items=invoice.line_items,
        # Reason
        reason=body.reason,
        # Multi-tenant
        organization_id=int(org_id),
    )

    # Build data dict for XML/PDF generation
    credit_note_data = {
        "credit_note_number": credit_note_number,
        "credit_note_id": credit_note_id,
        "credit_note_date": str(date.today()),
        "original_invoice_number": invoice.invoice_number,
        "original_invoice_date": str(invoice.invoice_date) if invoice.invoice_date else "",
        "seller_name": invoice.seller_name or "",
        "seller_vat_id": invoice.seller_vat_id or "",
        "seller_address": invoice.seller_address or "",
        "buyer_name": invoice.buyer_name or "",
        "buyer_vat_id": invoice.buyer_vat_id or "",
        "buyer_address": invoice.buyer_address or "",
        "net_amount": invoice.net_amount or 0,
        "tax_amount": invoice.tax_amount or 0,
        "gross_amount": invoice.gross_amount or 0,
        "tax_rate": invoice.tax_rate or 19,
        "currency": getattr(invoice, "currency", "EUR") or "EUR",
        "line_items": invoice.line_items or [],
        "iban": invoice.iban,
        "bic": invoice.bic,
        "payment_account_name": invoice.payment_account_name,
        "buyer_reference": invoice.buyer_reference,
        "seller_endpoint_id": invoice.seller_endpoint_id,
        "seller_endpoint_scheme": invoice.seller_endpoint_scheme,
        "buyer_endpoint_id": invoice.buyer_endpoint_id,
        "buyer_endpoint_scheme": invoice.buyer_endpoint_scheme,
        "reason": body.reason,
    }

    # Generate XRechnung XML (credit note variant)
    try:
        xml_content = xrechnung_gen.generate_credit_note_xml(credit_note_data)
        xml_filename = f"{credit_note_id}_gutschrift.xml"
        xml_path = os.path.join(XML_DIR, xml_filename)
        with open(xml_path, "w", encoding="utf-8") as f:
            f.write(xml_content)
        cn.xrechnung_xml_path = xml_path
        logger.info("XRechnung XML generated for credit note %s", credit_note_id)
    except Exception as e:
        logger.warning("XRechnung XML generation failed for credit note %s: %s", credit_note_id, e)

    # Generate ZUGFeRD PDF (credit note variant)
    try:
        xml_for_pdf = xml_content if cn.xrechnung_xml_path else None
        if xml_for_pdf:
            pdf_filename = f"{credit_note_id}_gutschrift.pdf"
            pdf_path = os.path.join(PDF_DIR, pdf_filename)
            zugferd_gen.generate_credit_note(credit_note_data, xml_for_pdf, pdf_path)
            cn.zugferd_pdf_path = pdf_path
            logger.info("ZUGFeRD PDF generated for credit note %s", credit_note_id)
    except Exception as e:
        logger.warning("ZUGFeRD PDF generation failed for credit note %s: %s", credit_note_id, e)

    db.add(cn)
    db.commit()
    db.refresh(cn)

    return CreditNoteDetailResponse.from_orm_with_extras(
        cn, original_invoice_number=invoice.invoice_number or ""
    )


@router.get("/credit-notes", response_model=CreditNoteListResponse)
async def list_credit_notes(
    skip: int = Query(default=0, ge=0, description="Anzahl zu überspringender Einträge"),
    limit: int = Query(default=50, ge=1, le=500, description="Max. Einträge (1-500)"),
    search: Optional[str] = Query(None, description="Suche in Gutschriftnummer und Kundenname"),
    date_from: Optional[str] = Query(None, description="Filter by credit_note_date >= date_from (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="Filter by credit_note_date <= date_to (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List all credit notes with pagination and optional filters (org-scoped)."""
    org_id = current_user.get("org_id")
    if not org_id:
        raise HTTPException(status_code=403, detail="Organisation erforderlich")

    query = db.query(CreditNote).filter(CreditNote.organization_id == int(org_id))

    # Optional filters
    if search:
        safe_search = search.replace('%', r'\%').replace('_', r'\_')
        query = query.filter(
            or_(
                CreditNote.credit_note_number.ilike(f"%{safe_search}%", escape='\\'),
                CreditNote.buyer_name.ilike(f"%{safe_search}%", escape='\\'),
            )
        )
    if date_from:
        query = query.filter(CreditNote.credit_note_date >= date_from)
    if date_to:
        query = query.filter(CreditNote.credit_note_date <= date_to)

    total = query.count()
    items = query.order_by(CreditNote.created_at.desc()).offset(skip).limit(limit).all()

    return CreditNoteListResponse(items=items, total=total, skip=skip, limit=limit)


@router.get("/credit-notes/{credit_note_id}", response_model=CreditNoteDetailResponse)
async def get_credit_note(
    credit_note_id: str = Path(..., pattern=r"^GS-\d{8}-[a-f0-9]{8}$"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get a single credit note by its public ID."""
    org_id = current_user.get("org_id")
    if not org_id:
        raise HTTPException(status_code=403, detail="Organisation erforderlich")

    cn = db.query(CreditNote).filter(
        CreditNote.credit_note_id == credit_note_id,
        CreditNote.organization_id == int(org_id),
    ).first()
    if not cn:
        raise HTTPException(status_code=404, detail="Gutschrift nicht gefunden")

    # Fetch original invoice number
    invoice = db.query(Invoice).filter(Invoice.id == cn.original_invoice_id).first()
    original_invoice_number = invoice.invoice_number if invoice else ""

    return CreditNoteDetailResponse.from_orm_with_extras(
        cn, original_invoice_number=original_invoice_number
    )


@router.get("/credit-notes/{credit_note_id}/xml")
async def download_credit_note_xml(
    credit_note_id: str = Path(..., pattern=r"^GS-\d{8}-[a-f0-9]{8}$"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Download XRechnung XML for a credit note."""
    org_id = current_user.get("org_id")
    if not org_id:
        raise HTTPException(status_code=403, detail="Organisation erforderlich")

    cn = db.query(CreditNote).filter(
        CreditNote.credit_note_id == credit_note_id,
        CreditNote.organization_id == int(org_id),
    ).first()
    if not cn:
        raise HTTPException(status_code=404, detail="Gutschrift nicht gefunden")

    if not cn.xrechnung_xml_path:
        raise HTTPException(
            status_code=404,
            detail="XRechnung XML wurde nicht generiert.",
        )

    # K2: Path Traversal Protection
    xml_file_path = os.path.realpath(cn.xrechnung_xml_path)
    if not xml_file_path.startswith(_XML_BASE):
        logger.warning(
            "Path traversal attempt blocked: credit_note_id=%s, path=%s",
            credit_note_id, cn.xrechnung_xml_path,
        )
        raise HTTPException(status_code=403, detail="Zugriff verweigert")

    if not os.path.isfile(xml_file_path):
        logger.error("XML-Datei nicht gefunden: %s", xml_file_path)
        raise HTTPException(status_code=404, detail="XRechnung XML-Datei nicht gefunden")

    with open(xml_file_path, "rb") as f:
        xml_bytes = f.read()

    filename = os.path.basename(xml_file_path)

    return StreamingResponse(
        io.BytesIO(xml_bytes),
        media_type="application/xml",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(xml_bytes)),
        },
    )


@router.get("/credit-notes/{credit_note_id}/pdf")
async def download_credit_note_pdf(
    credit_note_id: str = Path(..., pattern=r"^GS-\d{8}-[a-f0-9]{8}$"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Download ZUGFeRD PDF for a credit note."""
    org_id = current_user.get("org_id")
    if not org_id:
        raise HTTPException(status_code=403, detail="Organisation erforderlich")

    cn = db.query(CreditNote).filter(
        CreditNote.credit_note_id == credit_note_id,
        CreditNote.organization_id == int(org_id),
    ).first()
    if not cn:
        raise HTTPException(status_code=404, detail="Gutschrift nicht gefunden")

    if not cn.zugferd_pdf_path:
        raise HTTPException(
            status_code=404,
            detail="ZUGFeRD PDF wurde nicht generiert.",
        )

    # K2: Path Traversal Protection
    pdf_file_path = os.path.realpath(cn.zugferd_pdf_path)
    if not pdf_file_path.startswith(_PDF_BASE):
        logger.warning(
            "Path traversal attempt blocked: credit_note_id=%s, path=%s",
            credit_note_id, cn.zugferd_pdf_path,
        )
        raise HTTPException(status_code=403, detail="Zugriff verweigert")

    if not os.path.isfile(pdf_file_path):
        logger.error("PDF-Datei nicht gefunden: %s", pdf_file_path)
        raise HTTPException(status_code=404, detail="ZUGFeRD PDF-Datei nicht gefunden")

    with open(pdf_file_path, "rb") as f:
        pdf_bytes = f.read()

    filename = os.path.basename(pdf_file_path)

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(pdf_bytes)),
        },
    )
