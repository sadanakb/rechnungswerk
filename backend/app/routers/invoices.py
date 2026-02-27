"""
Invoice processing endpoints
"""
import logging
import tempfile

from fastapi import APIRouter, Depends, Path, Query, Request, UploadFile, File, HTTPException
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Invoice, UploadLog
from app.schemas import (
    InvoiceCreate, InvoiceResponse, InvoiceDetailResponse, InvoiceListResponse, OCRResult,
    BatchJobResponse, BatchFileResult,
)
from app.ocr_pipeline import OCRPipeline
from app.ollama_extractor import extract_invoice_fields as ollama_extract
from app.ocr.pipeline import OCRPipelineV2
from app.ocr.batch_processor import BatchProcessor
from app.xrechnung_generator import XRechnungGenerator
from app.zugferd_generator import ZUGFeRDGenerator
from app.kosit_validator import KoSITValidator
from app.export.datev_export import DATEVExporter
from app.fraud.detector import FraudDetector
from app.archive.gobd_archive import GoBDArchive
from app.ai.categorizer import InvoiceCategorizer
from app.auth import verify_api_key
from app.auth_jwt import oauth2_scheme, decode_token
from app.invoice_number_service import generate_next_invoice_number
from app.config import settings
from app.webhook_service import publish_event
from app.audit_service import log_action
from app.notification_service import create_notification
import uuid
import os
import io
from datetime import datetime, date
import re
from typing import List, Optional

logger = logging.getLogger(__name__)
limiter = Limiter(key_func=get_remote_address)


async def get_current_user_optional(token: Optional[str] = Depends(oauth2_scheme)):
    """Returns user dict if authenticated, None otherwise (backwards-compatible)."""
    if not token:
        return None
    try:
        if not settings.require_api_key:
            return None
        payload = decode_token(token)
        if payload.get("type") != "access":
            return None
        return {
            "user_id": payload.get("sub"),
            "org_id": payload.get("org_id"),
            "role": payload.get("role", "user"),
        }
    except Exception:
        return None


router = APIRouter(dependencies=[Depends(verify_api_key)])
ocr_pipeline = OCRPipeline()
ocr_pipeline_v2 = OCRPipelineV2()
batch_processor = BatchProcessor()
xrechnung_gen = XRechnungGenerator()
zugferd_gen = ZUGFeRDGenerator()
kosit_validator = KoSITValidator()
datev_exporter = DATEVExporter()
fraud_detector = FraudDetector()
gobd_archive = GoBDArchive()

# Storage directories
UPLOAD_DIR = "data/uploads"
XML_DIR = "data/xml_output"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(XML_DIR, exist_ok=True)

# Resolved base paths for path traversal protection (K2)
_UPLOAD_BASE = os.path.realpath(UPLOAD_DIR)
_XML_BASE = os.path.realpath(XML_DIR)

# Max upload size in bytes (K3)
_MAX_UPLOAD_BYTES = settings.max_upload_size_mb * 1024 * 1024


@router.post("/upload-ocr", response_model=OCRResult)
@limiter.limit("10/minute")
async def upload_pdf_for_ocr(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Upload PDF invoice for OCR processing

    Steps:
    1. Save uploaded PDF
    2. Extract text using Tesseract OCR
    3. Parse invoice fields using regex
    4. Return extracted data for user review
    """
    # Validate file type (K3 — None-safe) + sanitize filename (M4)
    raw_name = file.filename or ""
    safe_name = re.sub(r"[^\w.\-]", "_", os.path.basename(raw_name))
    if not safe_name.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Nur PDF-Dateien erlaubt")

    # Generate unique IDs
    upload_id = f"upload-{uuid.uuid4().hex[:8]}"
    invoice_id = f"INV-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:8]}"

    # Save uploaded file with size validation (K3)
    file_path = os.path.join(UPLOAD_DIR, f"{upload_id}.pdf")
    try:
        contents = await file.read()
        if len(contents) > _MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"Datei zu groß (max. {settings.max_upload_size_mb} MB)"
            )
        with open(file_path, "wb") as f:
            f.write(contents)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Datei speichern fehlgeschlagen: %s", e)
        raise HTTPException(status_code=500, detail="Datei konnte nicht gespeichert werden")

    # Log upload
    upload_log = UploadLog(
        upload_id=upload_id,
        filename=safe_name,
        file_type="pdf",
        file_size=len(contents),
        upload_status="processing",
        invoice_id=invoice_id
    )
    db.add(upload_log)
    db.commit()

    # Extract invoice fields – Pipeline V2: PaddleOCR + Ollama (structured JSON) + Confidence
    try:
        logger.info("Starting OCR Pipeline V2 for upload_id=%s", upload_id)
        result = ocr_pipeline_v2.process(file_path)

        fields = result.get("fields", {})
        confidence = result.get("confidence", 0.0)
        raw_text = result.get("raw_text", "")
        source = result.get("source", "unknown")
        field_confidences = result.get("field_confidences", {})
        consistency_checks = result.get("consistency_checks", [])
        completeness = result.get("completeness", 0.0)
        total_pages = result.get("total_pages", 1)
        ocr_engine = result.get("ocr_engine", "")

        logger.info(
            "OCR Pipeline V2 finished – source=%s, confidence=%.1f%%, pages=%d",
            source, confidence, total_pages,
        )

        if not fields and not raw_text:
            # Fall back to legacy Ollama extractor
            logger.info("Pipeline V2 returned no results, trying legacy extractor")
            legacy_result = ollama_extract(file_path)
            fields = legacy_result.get("fields", {})
            confidence = legacy_result.get("confidence", 0.0)
            raw_text = legacy_result.get("raw_text", "")
            source = legacy_result.get("source", "legacy-fallback")

        if not fields and not raw_text:
            upload_log.upload_status = "error"
            upload_log.error_message = "No content extracted from PDF"
            db.commit()
            raise HTTPException(status_code=400, detail="PDF-Inhalt konnte nicht extrahiert werden")

        # Build backward-compatible suggestions dict
        suggestions = {
            'invoice_number': fields.get('invoice_number'),
            'invoice_date': fields.get('invoice_date'),
            'due_date': fields.get('due_date'),
            'seller_name': fields.get('seller_name'),
            'seller_vat_id': fields.get('seller_vat_id'),
            'seller_address': fields.get('seller_address'),
            'seller_endpoint_id': fields.get('seller_endpoint_id'),
            'buyer_name': fields.get('buyer_name'),
            'buyer_vat_id': fields.get('buyer_vat_id'),
            'buyer_address': fields.get('buyer_address'),
            'buyer_reference': fields.get('buyer_reference'),
            'buyer_endpoint_id': fields.get('buyer_endpoint_id'),
            'iban': fields.get('iban'),
            'bic': fields.get('bic'),
            'payment_account_name': fields.get('payment_account_name'),
            'net_amount': fields.get('net_amount'),
            'tax_amount': fields.get('tax_amount'),
            'gross_amount': fields.get('gross_amount'),
            'tax_rate': fields.get('tax_rate'),
        }

        # Update upload log
        upload_log.upload_status = "success"
        db.commit()

        return OCRResult(
            invoice_id=invoice_id,
            extracted_text=raw_text[:500],
            confidence=round(confidence, 2),
            fields=fields,
            suggestions=suggestions,
            field_confidences=field_confidences,
            consistency_checks=consistency_checks,
            completeness=completeness,
            source=source,
            total_pages=total_pages,
            ocr_engine=ocr_engine,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("OCR processing failed for upload_id=%s: %s", upload_id, e)
        upload_log.upload_status = "error"
        upload_log.error_message = str(e)
        db.commit()
        raise HTTPException(status_code=500, detail="OCR-Verarbeitung fehlgeschlagen")


@router.post("/invoices", response_model=InvoiceResponse)
async def create_invoice(
    invoice: InvoiceCreate,
    db: Session = Depends(get_db),
    current_user: Optional[dict] = Depends(get_current_user_optional),
):
    """
    Create invoice manually (without OCR)

    User provides all invoice fields via form.
    """
    # Generate invoice ID
    invoice_id = f"INV-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:8]}"

    # Calculate amounts
    net_amount = sum(item.net_amount for item in invoice.line_items)
    tax_amount = net_amount * (invoice.tax_rate / 100)
    gross_amount = net_amount + tax_amount

    # Auto-set organization_id from JWT token (tenant isolation)
    org_id = None
    if current_user and current_user.get("org_id"):
        org_id = current_user["org_id"]

    # Resolve invoice number: use provided value or generate from sequence
    resolved_invoice_number = invoice.invoice_number
    if not resolved_invoice_number and org_id:
        resolved_invoice_number = generate_next_invoice_number(db, int(org_id))

    # Create invoice record
    db_invoice = Invoice(
        invoice_id=invoice_id,
        invoice_number=resolved_invoice_number,
        invoice_date=invoice.invoice_date,
        due_date=invoice.due_date,
        seller_name=invoice.seller_name,
        seller_vat_id=invoice.seller_vat_id,
        seller_address=invoice.seller_address,
        buyer_name=invoice.buyer_name,
        buyer_vat_id=invoice.buyer_vat_id,
        buyer_address=invoice.buyer_address,
        net_amount=net_amount,
        tax_amount=tax_amount,
        gross_amount=gross_amount,
        tax_rate=invoice.tax_rate,
        line_items=[item.model_dump() for item in invoice.line_items],
        # EN 16931 compliance fields
        iban=invoice.iban,
        bic=invoice.bic,
        payment_account_name=invoice.payment_account_name,
        buyer_reference=invoice.buyer_reference,
        seller_endpoint_id=invoice.seller_endpoint_id,
        seller_endpoint_scheme=invoice.seller_endpoint_scheme,
        buyer_endpoint_id=invoice.buyer_endpoint_id,
        buyer_endpoint_scheme=invoice.buyer_endpoint_scheme,
        source_type="manual",
        validation_status="pending",
        organization_id=org_id,
    )

    db.add(db_invoice)
    db.commit()
    db.refresh(db_invoice)

    # Publish webhook event if the invoice belongs to an organization
    if org_id:
        try:
            publish_event(
                db,
                org_id,
                "invoice.created",
                {
                    "id": db_invoice.id,
                    "number": db_invoice.invoice_number,
                    "amount": float(db_invoice.total_amount) if hasattr(db_invoice, "total_amount") and db_invoice.total_amount is not None else float(db_invoice.gross_amount or 0),
                },
            )
        except Exception:
            # Webhook delivery failure must never break invoice creation
            logger.warning("Webhook publish failed for invoice %s", db_invoice.invoice_id)

    # Audit log
    if org_id:
        user_id = int(current_user["user_id"]) if current_user and current_user.get("user_id") else None
        log_action(
            db,
            org_id=int(org_id),
            user_id=user_id,
            action="invoice_created",
            resource_type="invoice",
            resource_id=db_invoice.invoice_id,
            details={
                "invoice_number": db_invoice.invoice_number,
                "gross_amount": float(db_invoice.gross_amount or 0),
            },
        )

    # In-app notification
    if org_id:
        create_notification(
            db,
            org_id=int(org_id),
            type="invoice_created",
            title="Neue Rechnung",
            message=f"Rechnung {db_invoice.invoice_number} wurde erfolgreich erstellt.",
            link=f"/invoices/{db_invoice.id}",
        )

    return db_invoice


@router.post("/invoices/bulk-delete")
async def bulk_delete_invoices(
    request: Request,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: Optional[dict] = Depends(get_current_user_optional),
):
    """
    Bulk-delete invoices by integer DB id.

    Body: {"ids": [1, 2, 3]}
    Returns: {"deleted": N, "skipped": M}
    Skipped = IDs not found or belonging to a different organisation.
    """
    ids = payload.get("ids", [])
    if not isinstance(ids, list) or not ids:
        raise HTTPException(status_code=422, detail="ids muss eine nicht-leere Liste sein")

    org_id = current_user.get("org_id") if current_user else None

    deleted = 0
    skipped = 0

    for inv_id in ids:
        invoice = db.query(Invoice).filter(Invoice.id == inv_id).first()
        if not invoice:
            skipped += 1
            continue

        # Enforce tenant isolation when authenticated
        if org_id and invoice.organization_id != int(org_id):
            skipped += 1
            continue

        # Clean up XML file
        if invoice.xrechnung_xml_path:
            xml_real = os.path.realpath(invoice.xrechnung_xml_path)
            if xml_real.startswith(_XML_BASE) and os.path.isfile(xml_real):
                os.remove(xml_real)

        # Clean up uploaded PDF
        for log in db.query(UploadLog).filter(UploadLog.invoice_id == invoice.invoice_id).all():
            pdf_path = os.path.join(UPLOAD_DIR, f"{log.upload_id}.pdf")
            pdf_real = os.path.realpath(pdf_path)
            if pdf_real.startswith(_UPLOAD_BASE) and os.path.isfile(pdf_real):
                os.remove(pdf_real)
            db.delete(log)

        db.delete(invoice)
        deleted += 1

    db.commit()

    # Audit log
    if org_id and deleted > 0:
        user_id = int(current_user["user_id"]) if current_user and current_user.get("user_id") else None
        ip = request.client.host if request.client else None
        log_action(
            db,
            org_id=int(org_id),
            user_id=user_id,
            action="invoices_bulk_deleted",
            resource_type="invoice",
            resource_id=None,
            details={"deleted": deleted, "skipped": skipped},
            ip_address=ip,
        )

    return {"deleted": deleted, "skipped": skipped}


@router.post("/invoices/bulk-validate")
async def bulk_validate_invoices(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: Optional[dict] = Depends(get_current_user_optional),
):
    """
    Bulk-validate invoices by integer DB id.

    Body: {"ids": [1, 2, 3]}
    For each invoice, checks whether xml_content is present and whether
    required fields (invoice_number, invoice_date, seller_name, buyer_name,
    gross_amount) are populated.

    Returns: {"results": [{"id": 1, "valid": true, "errors": []}]}
    """
    ids = payload.get("ids", [])
    if not isinstance(ids, list) or not ids:
        raise HTTPException(status_code=422, detail="ids muss eine nicht-leere Liste sein")

    org_id = current_user.get("org_id") if current_user else None

    results = []
    for inv_id in ids:
        invoice = db.query(Invoice).filter(Invoice.id == inv_id).first()

        if not invoice:
            results.append({"id": inv_id, "valid": False, "errors": ["Rechnung nicht gefunden"]})
            continue

        # Enforce tenant isolation when authenticated
        if org_id and invoice.organization_id != int(org_id):
            results.append({"id": inv_id, "valid": False, "errors": ["Zugriff verweigert"]})
            continue

        errors: List[str] = []

        # Check required fields (basic EN 16931 presence validation)
        REQUIRED_FIELDS = [
            ("invoice_number", "Rechnungsnummer"),
            ("invoice_date", "Rechnungsdatum"),
            ("seller_name", "Verkäufername"),
            ("buyer_name", "Käufername"),
            ("gross_amount", "Bruttobetrag"),
        ]
        for field, label in REQUIRED_FIELDS:
            val = getattr(invoice, field, None)
            if val is None or (isinstance(val, str) and not val.strip()):
                errors.append(f"Pflichtfeld fehlt: {label}")

        # Check that XRechnung XML has been generated
        if not invoice.xrechnung_xml_path:
            errors.append("XRechnung XML wurde noch nicht generiert")
        else:
            xml_real = os.path.realpath(invoice.xrechnung_xml_path)
            if not xml_real.startswith(_XML_BASE) or not os.path.isfile(xml_real):
                errors.append("XRechnung XML-Datei nicht vorhanden")

        results.append({
            "id": inv_id,
            "invoice_id": invoice.invoice_id,
            "invoice_number": invoice.invoice_number,
            "valid": len(errors) == 0,
            "errors": errors,
        })

    return {"results": results}


@router.post("/invoices/{invoice_id}/generate-xrechnung")
@limiter.limit("20/minute")
async def generate_xrechnung(
    request: Request,
    invoice_id: str = Path(..., pattern=r"^INV-\d{8}-[a-f0-9]{8}$"),
    db: Session = Depends(get_db)
):
    """
    Generate XRechnung UBL XML from invoice
    """
    # Get invoice
    invoice = db.query(Invoice).filter(Invoice.invoice_id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")

    # Prepare invoice data
    invoice_data = {
        'invoice_number': invoice.invoice_number,
        'invoice_date': str(invoice.invoice_date),
        'due_date': str(invoice.due_date) if invoice.due_date else None,
        'seller_name': invoice.seller_name,
        'seller_vat_id': invoice.seller_vat_id,
        'seller_address': invoice.seller_address,
        'buyer_name': invoice.buyer_name,
        'buyer_vat_id': invoice.buyer_vat_id,
        'buyer_address': invoice.buyer_address,
        'net_amount': invoice.net_amount,
        'tax_amount': invoice.tax_amount,
        'gross_amount': invoice.gross_amount,
        'tax_rate': invoice.tax_rate,
        'line_items': invoice.line_items or [],
        # EN 16931 compliance fields
        'iban': invoice.iban,
        'bic': invoice.bic,
        'payment_account_name': invoice.payment_account_name,
        'buyer_reference': invoice.buyer_reference,
        'seller_endpoint_id': invoice.seller_endpoint_id,
        'seller_endpoint_scheme': invoice.seller_endpoint_scheme,
        'buyer_endpoint_id': invoice.buyer_endpoint_id,
        'buyer_endpoint_scheme': invoice.buyer_endpoint_scheme,
    }

    # Generate XML
    try:
        xml_content = xrechnung_gen.generate_xml(invoice_data)

        # Save XML file
        xml_filename = f"{invoice_id}_xrechnung.xml"
        xml_path = os.path.join(XML_DIR, xml_filename)
        with open(xml_path, 'w', encoding='utf-8') as f:
            f.write(xml_content)

        # Update invoice record
        invoice.xrechnung_xml_path = xml_path
        invoice.validation_status = "xrechnung_generated"
        db.commit()

        return {
            "invoice_id": invoice_id,
            "download_url": f"/api/invoices/{invoice_id}/download-xrechnung",
            "message": "XRechnung XML erfolgreich generiert"
        }

    except Exception as e:
        logger.error("XML-Generierung fehlgeschlagen für %s: %s", invoice_id, e)
        raise HTTPException(status_code=500, detail="XML-Generierung fehlgeschlagen")


@router.get("/invoices", response_model=InvoiceListResponse)
async def list_invoices(
    skip: int = Query(default=0, ge=0, description="Anzahl zu überspringender Einträge"),
    limit: int = Query(default=50, ge=1, le=500, description="Max. Einträge (1-500)"),
    status: Optional[str] = Query(None, description="Filter by validation_status (e.g. valid, invalid, pending)"),
    supplier: Optional[str] = Query(None, description="Partial match on buyer_name"),
    search: Optional[str] = Query(None, description="Search invoice_number and buyer_name"),
    date_from: Optional[str] = Query(None, description="Filter by invoice_date >= date_from (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="Filter by invoice_date <= date_to (YYYY-MM-DD)"),
    amount_min: Optional[float] = Query(None, description="Filter by gross_amount >= amount_min"),
    amount_max: Optional[float] = Query(None, description="Filter by gross_amount <= amount_max"),
    payment_status: Optional[str] = Query(None, description="Filter by payment_status (unpaid, paid, partial, overdue, cancelled)"),
    db: Session = Depends(get_db),
    current_user: Optional[dict] = Depends(get_current_user_optional),
):
    """List all invoices with pagination and optional filters (filtered by org if authenticated)"""
    query = db.query(Invoice)

    # Tenant isolation: filter by organization_id if authenticated
    if current_user and current_user.get("org_id"):
        query = query.filter(Invoice.organization_id == current_user["org_id"])

    # Optional filters
    if status:
        query = query.filter(Invoice.validation_status == status)
    if supplier:
        query = query.filter(Invoice.buyer_name.ilike(f"%{supplier}%"))
    if search:
        query = query.filter(
            or_(
                Invoice.invoice_number.ilike(f"%{search}%"),
                Invoice.buyer_name.ilike(f"%{search}%"),
            )
        )
    if date_from:
        query = query.filter(Invoice.invoice_date >= date_from)
    if date_to:
        query = query.filter(Invoice.invoice_date <= date_to)
    if amount_min is not None:
        query = query.filter(Invoice.gross_amount >= amount_min)
    if amount_max is not None:
        query = query.filter(Invoice.gross_amount <= amount_max)
    if payment_status:
        query = query.filter(Invoice.payment_status == payment_status)

    # Auto-mark overdue invoices (lazy evaluation on every list request)
    if current_user and current_user.get("org_id"):
        org_id = current_user["org_id"]
        from datetime import date as date_type
        today_str = str(date_type.today())
        try:
            overdue_candidates = db.query(Invoice).filter(
                Invoice.organization_id == org_id,
                Invoice.payment_status == "unpaid",
                Invoice.due_date.isnot(None),
                Invoice.due_date < today_str,
            ).all()
            for inv in overdue_candidates:
                inv.payment_status = "overdue"
            if overdue_candidates:
                db.commit()
        except Exception:
            pass  # If payment_status column doesn't exist yet, skip

    total = query.count()
    invoices = query.order_by(Invoice.created_at.desc()).offset(skip).limit(limit).all()
    return InvoiceListResponse(items=invoices, total=total, skip=skip, limit=limit)


@router.get("/invoices/export-datev")
async def export_datev_by_period(
    year: int = Query(2026),
    quarter: Optional[int] = Query(None),  # 1-4, None = full year
    db: Session = Depends(get_db),
    current_user: Optional[dict] = Depends(get_current_user_optional),
):
    """Export invoices as DATEV Buchungsstapel CSV, filtered by year and optional quarter."""
    import calendar as cal_module
    from datetime import date as date_type

    if quarter:
        month_start = (quarter - 1) * 3 + 1
        date_from = date_type(year, month_start, 1)
        month_end = month_start + 2
        date_to = date_type(year, month_end, cal_module.monthrange(year, month_end)[1])
    else:
        date_from = date_type(year, 1, 1)
        date_to = date_type(year, 12, 31)

    query = db.query(Invoice).filter(
        Invoice.invoice_date >= date_from,
        Invoice.invoice_date <= date_to,
    )

    org_id = current_user.get("org_id") if current_user else None
    if org_id:
        query = query.filter(Invoice.organization_id == int(org_id))

    invoices = query.all()

    exporter = DATEVExporter(kontenrahmen="SKR03")
    invoice_dicts = []
    for inv in invoices:
        invoice_dicts.append({
            "invoice_number": inv.invoice_number,
            "invoice_date": str(inv.invoice_date),
            "due_date": str(inv.due_date) if inv.due_date else "",
            "seller_name": inv.seller_name or "",
            "buyer_name": inv.buyer_name or "",
            "net_amount": float(inv.net_amount or 0),
            "tax_rate": float(inv.tax_rate or 19),
            "tax_amount": float(inv.tax_amount or 0),
            "gross_amount": float(inv.gross_amount or 0),
            "currency": getattr(inv, "currency", "EUR") or "EUR",
            "iban": inv.iban or "",
            "bic": inv.bic or "",
            "source_type": inv.source_type or "",
            "validation_status": inv.validation_status or "",
        })

    content = exporter.export_buchungsstapel(invoice_dicts)

    filename = f"DATEV_{year}"
    if quarter:
        filename += f"_Q{quarter}"
    filename += ".csv"

    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


class PaymentStatusUpdate(BaseModel):
    status: str  # unpaid, paid, partial, overdue, cancelled
    paid_date: Optional[str] = None
    payment_method: Optional[str] = None
    payment_reference: Optional[str] = None


@router.patch("/invoices/{invoice_id}/payment-status")
async def update_payment_status(
    body: PaymentStatusUpdate,
    invoice_id: str = Path(..., pattern=r"^INV-\d{8}-[a-f0-9]{8}$"),
    db: Session = Depends(get_db),
    current_user: Optional[dict] = Depends(get_current_user_optional),
):
    """Update the payment status of an invoice (paid, unpaid, partial, overdue, cancelled)."""
    allowed = {"unpaid", "paid", "partial", "overdue", "cancelled"}
    if body.status not in allowed:
        raise HTTPException(400, detail=f"Ungültiger Status. Erlaubt: {', '.join(sorted(allowed))}")

    invoice = db.query(Invoice).filter(Invoice.invoice_id == invoice_id).first()
    if not invoice:
        raise HTTPException(404, detail="Rechnung nicht gefunden")

    # Tenant isolation when authenticated
    if current_user and current_user.get("org_id"):
        if invoice.organization_id and invoice.organization_id != int(current_user["org_id"]):
            raise HTTPException(404, detail="Rechnung nicht gefunden")

    invoice.payment_status = body.status
    if body.paid_date:
        from datetime import date as date_type
        invoice.paid_date = date_type.fromisoformat(body.paid_date)
    if body.payment_method:
        invoice.payment_method = body.payment_method
    if body.payment_reference:
        invoice.payment_reference = body.payment_reference

    db.commit()
    db.refresh(invoice)
    return {"ok": True, "payment_status": invoice.payment_status}


@router.get("/invoices/autocomplete")
def autocomplete_invoices(
    q: str = Query(""),
    field: str = Query("buyer_name"),
    current_user: Optional[dict] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    allowed_fields = {
        "buyer_name": Invoice.buyer_name,
        "invoice_number": Invoice.invoice_number,
        "seller_name": Invoice.seller_name,
    }
    if not q or field not in allowed_fields:
        return []
    col = allowed_fields[field]
    org_id = current_user.get("org_id") if current_user else None
    query = db.query(col).filter(
        col.ilike(f"{q}%"),
        col.isnot(None),
        col != "",
    )
    if org_id:
        query = query.filter(Invoice.organization_id == int(org_id))
    results = (
        query
        .distinct()
        .order_by(col)
        .limit(10)
        .all()
    )
    return [r[0] for r in results if r[0]]


@router.get("/invoices/stats")
def get_invoice_stats(
    current_user: Optional[dict] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    from sqlalchemy import func
    from datetime import date, timedelta
    import calendar as cal

    org_id = int(current_user["org_id"]) if current_user and current_user.get("org_id") else None
    today = date.today()
    first_of_month = today.replace(day=1)
    prev_month_end = first_of_month - timedelta(days=1)
    first_of_last_month = prev_month_end.replace(day=1)

    def _base_q(query):
        if org_id is not None:
            return query.filter(Invoice.organization_id == org_id)
        return query

    total = _base_q(db.query(func.count(Invoice.id))).scalar() or 0

    this_month_count = _base_q(db.query(func.count(Invoice.id))).filter(
        Invoice.invoice_date >= str(first_of_month),
    ).scalar() or 0

    revenue_this_month = float(_base_q(db.query(func.sum(Invoice.gross_amount))).filter(
        Invoice.invoice_date >= str(first_of_month),
    ).scalar() or 0)

    revenue_last_month = float(_base_q(db.query(func.sum(Invoice.gross_amount))).filter(
        Invoice.invoice_date >= str(first_of_last_month),
        Invoice.invoice_date < str(first_of_month),
    ).scalar() or 0)

    # Try payment_status columns (added in Phase 7 migration)
    try:
        overdue_count = _base_q(db.query(func.count(Invoice.id))).filter(
            Invoice.payment_status == "overdue",
        ).scalar() or 0
        overdue_amount = float(_base_q(db.query(func.sum(Invoice.gross_amount))).filter(
            Invoice.payment_status == "overdue",
        ).scalar() or 0)
        paid_count = _base_q(db.query(func.count(Invoice.id))).filter(
            Invoice.payment_status == "paid",
        ).scalar() or 0
        unpaid_count = _base_q(db.query(func.count(Invoice.id))).filter(
            Invoice.payment_status.in_(["unpaid", "partial"]),
        ).scalar() or 0
    except Exception:
        overdue_count = overdue_amount = paid_count = unpaid_count = 0

    valid_count = _base_q(db.query(func.count(Invoice.id))).filter(
        Invoice.validation_status == "valid",
    ).scalar() or 0
    validation_rate = round(valid_count / total, 2) if total > 0 else 0.0

    monthly_revenue = []
    for i in range(5, -1, -1):
        m = today.month - i
        y = today.year
        while m <= 0:
            m += 12
            y -= 1
        month_start = date(y, m, 1)
        month_end = date(y, m, cal.monthrange(y, m)[1])
        amount = float(_base_q(db.query(func.sum(Invoice.gross_amount))).filter(
            Invoice.invoice_date >= str(month_start),
            Invoice.invoice_date <= str(month_end),
        ).scalar() or 0)
        monthly_revenue.append({"month": f"{y}-{m:02d}", "amount": amount})

    return {
        "total_invoices": total,
        "invoices_this_month": this_month_count,
        "revenue_this_month": revenue_this_month,
        "revenue_last_month": revenue_last_month,
        "overdue_count": overdue_count,
        "overdue_amount": overdue_amount,
        "paid_count": paid_count,
        "unpaid_count": unpaid_count,
        "validation_rate": validation_rate,
        "monthly_revenue": monthly_revenue,
    }


@router.get("/invoices/check-overdue")
async def check_overdue_invoices(
    db: Session = Depends(get_db),
    current_user: Optional[dict] = Depends(get_current_user_optional),
):
    """Mark all unpaid past-due invoices for the current org as overdue and return the count."""
    from datetime import date as date_type
    today_str = str(date_type.today())
    try:
        query = db.query(Invoice).filter(
            Invoice.payment_status == "unpaid",
            Invoice.due_date.isnot(None),
            Invoice.due_date < today_str,
        )
        if current_user and current_user.get("org_id"):
            query = query.filter(Invoice.organization_id == current_user["org_id"])
        overdue = query.all()
        count = len(overdue)
        for inv in overdue:
            inv.payment_status = "overdue"
        if count:
            db.commit()
        return {"updated": count}
    except Exception:
        return {"updated": 0}


@router.get("/invoices/{invoice_id}", response_model=InvoiceDetailResponse)
async def get_invoice(
    invoice_id: str = Path(..., pattern=r"^INV-\d{8}-[a-f0-9]{8}$"),
    db: Session = Depends(get_db),
    current_user: Optional[dict] = Depends(get_current_user_optional),
):
    """Get single invoice by ID — returns full detail including line items."""
    invoice = db.query(Invoice).filter(Invoice.invoice_id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")

    # Tenant isolation: if authenticated, enforce org scope
    if current_user and current_user.get("org_id"):
        if invoice.organization_id and invoice.organization_id != int(current_user["org_id"]):
            raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")

    return InvoiceDetailResponse.from_orm_with_extras(invoice)


@router.delete("/invoices/{invoice_id}")
async def delete_invoice(
    request: Request,
    invoice_id: str = Path(..., pattern=r"^INV-\d{8}-[a-f0-9]{8}$"),
    db: Session = Depends(get_db),
    current_user: Optional[dict] = Depends(get_current_user_optional),
):
    """Delete invoice and clean up associated files (M5)."""
    invoice = db.query(Invoice).filter(Invoice.invoice_id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")

    # Capture audit context before deletion
    audit_org_id = invoice.organization_id
    audit_details = {
        "invoice_number": invoice.invoice_number,
        "gross_amount": float(invoice.gross_amount or 0),
    }

    # Clean up XML file
    if invoice.xrechnung_xml_path:
        xml_real = os.path.realpath(invoice.xrechnung_xml_path)
        if xml_real.startswith(_XML_BASE) and os.path.isfile(xml_real):
            os.remove(xml_real)

    # Clean up uploaded PDF (look for matching upload log)
    for log in db.query(UploadLog).filter(UploadLog.invoice_id == invoice_id).all():
        pdf_path = os.path.join(UPLOAD_DIR, f"{log.upload_id}.pdf")
        pdf_real = os.path.realpath(pdf_path)
        if pdf_real.startswith(_UPLOAD_BASE) and os.path.isfile(pdf_real):
            os.remove(pdf_real)
        db.delete(log)

    db.delete(invoice)
    db.commit()

    # Audit log
    if audit_org_id:
        user_id = int(current_user["user_id"]) if current_user and current_user.get("user_id") else None
        ip = request.client.host if request.client else None
        log_action(
            db,
            org_id=int(audit_org_id),
            user_id=user_id,
            action="invoice_deleted",
            resource_type="invoice",
            resource_id=invoice_id,
            details=audit_details,
            ip_address=ip,
        )

    return {"message": "Rechnung gelöscht", "invoice_id": invoice_id}


@router.get("/invoices/{invoice_id}/download-xrechnung")
async def download_xrechnung(
    invoice_id: str = Path(..., pattern=r"^INV-\d{8}-[a-f0-9]{8}$"),
    db: Session = Depends(get_db)
):
    """
    Download XRechnung UBL XML file for an invoice.

    Returns the XML as an attachment (application/xml).
    """
    invoice = db.query(Invoice).filter(Invoice.invoice_id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")

    if not invoice.xrechnung_xml_path:
        raise HTTPException(
            status_code=404,
            detail="XRechnung XML wurde noch nicht generiert. "
                   "Zuerst POST /api/invoices/{invoice_id}/generate-xrechnung aufrufen."
        )

    # K2: Path Traversal Protection — Pfad gegen erlaubtes Verzeichnis validieren
    xml_file_path = os.path.realpath(invoice.xrechnung_xml_path)
    if not xml_file_path.startswith(_XML_BASE):
        logger.warning(
            "Path traversal attempt blocked: invoice_id=%s, path=%s",
            invoice_id, invoice.xrechnung_xml_path
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


@router.post("/upload-ocr-batch", response_model=BatchJobResponse)
@limiter.limit("5/minute")
async def upload_batch_for_ocr(
    request: Request,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    """
    Upload multiple PDF invoices for batch OCR processing.

    Processes each PDF through the OCR Pipeline V2 and returns
    per-file results with confidence scores.
    """
    if not files:
        raise HTTPException(status_code=400, detail="Keine Dateien hochgeladen")

    if len(files) > 50:
        raise HTTPException(status_code=400, detail="Maximal 50 Dateien pro Batch")

    # Validate all files first
    filenames = []
    for f in files:
        raw_name = f.filename or ""
        safe_name = re.sub(r"[^\w.\-]", "_", os.path.basename(raw_name))
        if not safe_name.lower().endswith(".pdf"):
            raise HTTPException(
                status_code=400,
                detail=f"Nur PDF-Dateien erlaubt: {raw_name}",
            )
        filenames.append(safe_name)

    # Create batch job
    batch_job = batch_processor.create_batch(filenames)

    # Save all files
    file_paths = []
    for i, f in enumerate(files):
        upload_id = f"upload-{uuid.uuid4().hex[:8]}"
        file_path = os.path.join(UPLOAD_DIR, f"{upload_id}.pdf")

        contents = await f.read()
        if len(contents) > _MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"Datei '{filenames[i]}' zu gross (max. {settings.max_upload_size_mb} MB)",
            )

        with open(file_path, "wb") as fp:
            fp.write(contents)

        file_paths.append(file_path)

        # Log upload
        invoice_id = f"INV-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:8]}"
        upload_log = UploadLog(
            upload_id=upload_id,
            filename=filenames[i],
            file_type="pdf",
            file_size=len(contents),
            upload_status="batch_processing",
            invoice_id=invoice_id,
        )
        db.add(upload_log)
        batch_job.results[i].invoice_id = invoice_id

    db.commit()

    # Process batch
    try:
        batch_job = batch_processor.process_batch(batch_job.batch_id, file_paths)
    except Exception as e:
        logger.error("Batch processing failed: %s", e)
        raise HTTPException(status_code=500, detail="Batch-Verarbeitung fehlgeschlagen")

    return BatchJobResponse(
        batch_id=batch_job.batch_id,
        total_files=batch_job.total_files,
        processed=batch_job.processed,
        succeeded=batch_job.succeeded,
        failed=batch_job.failed,
        status=batch_job.status,
        progress_percent=batch_job.progress_percent(),
        results=[
            BatchFileResult(
                filename=r.filename,
                status=r.status,
                invoice_id=r.invoice_id,
                fields=r.fields,
                confidence=r.confidence,
                field_confidences=r.field_confidences,
                error=r.error,
                source=r.source,
            )
            for r in batch_job.results
        ],
        created_at=batch_job.created_at,
        completed_at=batch_job.completed_at,
    )


@router.get("/batch/{batch_id}", response_model=BatchJobResponse)
async def get_batch_status(
    batch_id: str = Path(...),
):
    """Get status of a batch processing job."""
    job = BatchProcessor.get_batch(batch_id)
    if not job:
        raise HTTPException(status_code=404, detail="Batch-Job nicht gefunden")

    return BatchJobResponse(
        batch_id=job.batch_id,
        total_files=job.total_files,
        processed=job.processed,
        succeeded=job.succeeded,
        failed=job.failed,
        status=job.status,
        progress_percent=job.progress_percent(),
        results=[
            BatchFileResult(
                filename=r.filename,
                status=r.status,
                invoice_id=r.invoice_id,
                fields=r.fields,
                confidence=r.confidence,
                field_confidences=r.field_confidences,
                error=r.error,
                source=r.source,
            )
            for r in job.results
        ],
        created_at=job.created_at,
        completed_at=job.completed_at,
    )


# ---------------------------------------------------------------------------
# Phase 3: ZUGFeRD, Validator, DATEV, Fraud Detection
# ---------------------------------------------------------------------------

ZUGFERD_DIR = "data/zugferd_output"
os.makedirs(ZUGFERD_DIR, exist_ok=True)
_ZUGFERD_BASE = os.path.realpath(ZUGFERD_DIR)


@router.post("/invoices/{invoice_id}/generate-zugferd")
@limiter.limit("10/minute")
async def generate_zugferd(
    request: Request,
    invoice_id: str = Path(..., pattern=r"^INV-\d{8}-[a-f0-9]{8}$"),
    db: Session = Depends(get_db),
):
    """Generate ZUGFeRD PDF/A-3 with embedded XRechnung XML."""
    invoice = db.query(Invoice).filter(Invoice.invoice_id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")

    # Prepare invoice data
    invoice_data = {
        "invoice_number": invoice.invoice_number,
        "invoice_date": str(invoice.invoice_date),
        "due_date": str(invoice.due_date) if invoice.due_date else None,
        "seller_name": invoice.seller_name,
        "seller_vat_id": invoice.seller_vat_id,
        "seller_address": invoice.seller_address,
        "buyer_name": invoice.buyer_name,
        "buyer_vat_id": invoice.buyer_vat_id,
        "buyer_address": invoice.buyer_address,
        "net_amount": invoice.net_amount,
        "tax_amount": invoice.tax_amount,
        "gross_amount": invoice.gross_amount,
        "tax_rate": invoice.tax_rate,
        "currency": getattr(invoice, "currency", "EUR") or "EUR",
        "line_items": invoice.line_items or [],
        "iban": invoice.iban,
        "bic": invoice.bic,
        "payment_account_name": invoice.payment_account_name,
        "buyer_reference": invoice.buyer_reference,
        "seller_endpoint_id": invoice.seller_endpoint_id,
        "buyer_endpoint_id": invoice.buyer_endpoint_id,
    }

    try:
        # Generate XRechnung XML first
        xml_content = xrechnung_gen.generate_xml(invoice_data)

        # Generate ZUGFeRD PDF
        pdf_filename = f"{invoice_id}_zugferd.pdf"
        pdf_path = os.path.join(ZUGFERD_DIR, pdf_filename)
        zugferd_gen.generate(invoice_data, xml_content, pdf_path)

        # Update invoice record
        invoice.zugferd_pdf_path = pdf_path
        if not invoice.xrechnung_xml_path:
            xml_path = os.path.join(XML_DIR, f"{invoice_id}_xrechnung.xml")
            with open(xml_path, "w", encoding="utf-8") as f:
                f.write(xml_content)
            invoice.xrechnung_xml_path = xml_path

        invoice.validation_status = "zugferd_generated"
        db.commit()

        # Archive for GoBD compliance
        try:
            with open(pdf_path, "rb") as f:
                gobd_archive.archive_document(
                    f.read(), "zugferd_pdf", invoice_id,
                )
        except Exception as arch_err:
            logger.warning("GoBD archiving failed: %s", arch_err)

        return {
            "invoice_id": invoice_id,
            "download_url": f"/api/invoices/{invoice_id}/download-zugferd",
            "message": "ZUGFeRD PDF/A-3 erfolgreich generiert",
        }

    except Exception as e:
        logger.error("ZUGFeRD generation failed for %s: %s", invoice_id, e)
        raise HTTPException(status_code=500, detail=f"ZUGFeRD-Generierung fehlgeschlagen: {e}")


@router.get("/invoices/{invoice_id}/download-zugferd")
async def download_zugferd(
    invoice_id: str = Path(..., pattern=r"^INV-\d{8}-[a-f0-9]{8}$"),
    db: Session = Depends(get_db),
    current_user: Optional[dict] = Depends(get_current_user_optional),
):
    """Download ZUGFeRD PDF/A-3 file.

    If a cached PDF exists on disk, it is served directly.
    Otherwise the PDF is generated on-the-fly from the invoice data
    (XRechnung XML is created internally and embedded automatically).
    """
    invoice = db.query(Invoice).filter(Invoice.invoice_id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")

    # Org isolation: when authenticated, restrict to the user's org
    if current_user and current_user.get("org_id") is not None:
        if invoice.organization_id is not None and invoice.organization_id != current_user["org_id"]:
            raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")

    # --- Try to serve from cached file first ---
    if invoice.zugferd_pdf_path:
        pdf_path = os.path.realpath(invoice.zugferd_pdf_path)
        if pdf_path.startswith(_ZUGFERD_BASE) and os.path.isfile(pdf_path):
            with open(pdf_path, "rb") as f:
                pdf_bytes = f.read()
            filename = invoice.invoice_number or os.path.basename(pdf_path)
            return StreamingResponse(
                io.BytesIO(pdf_bytes),
                media_type="application/pdf",
                headers={
                    "Content-Disposition": f'attachment; filename="{filename}_ZUGFeRD.pdf"',
                    "Content-Length": str(len(pdf_bytes)),
                },
            )

    # --- Generate on-the-fly ---
    invoice_data = {
        "invoice_number": invoice.invoice_number,
        "invoice_date": str(invoice.invoice_date) if invoice.invoice_date else "",
        "due_date": str(invoice.due_date) if invoice.due_date else None,
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
        "buyer_endpoint_id": invoice.buyer_endpoint_id,
    }

    try:
        xml_content = xrechnung_gen.generate_xml(invoice_data)

        with tempfile.TemporaryDirectory() as tmp_dir:
            pdf_path = os.path.join(tmp_dir, f"{invoice_id}_zugferd.pdf")
            zugferd_gen.generate(invoice_data, xml_content, pdf_path)
            with open(pdf_path, "rb") as f:
                pdf_bytes = f.read()

        filename = invoice.invoice_number or invoice_id
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}_ZUGFeRD.pdf"',
                "Content-Length": str(len(pdf_bytes)),
            },
        )
    except Exception as e:
        logger.error("ZUGFeRD on-the-fly generation failed for %s: %s", invoice_id, e)
        raise HTTPException(
            status_code=500,
            detail=f"ZUGFeRD-Generierung fehlgeschlagen: {e}",
        )


@router.post("/invoices/{invoice_id}/validate")
async def validate_invoice(
    invoice_id: str = Path(..., pattern=r"^INV-\d{8}-[a-f0-9]{8}$"),
    db: Session = Depends(get_db),
):
    """Validate an invoice's XRechnung XML against KoSIT rules."""
    invoice = db.query(Invoice).filter(Invoice.invoice_id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")

    if not invoice.xrechnung_xml_path:
        raise HTTPException(
            status_code=400,
            detail="XRechnung XML muss zuerst generiert werden",
        )

    xml_path = os.path.realpath(invoice.xrechnung_xml_path)
    if not xml_path.startswith(_XML_BASE) or not os.path.isfile(xml_path):
        raise HTTPException(status_code=404, detail="XML-Datei nicht gefunden")

    with open(xml_path, "r", encoding="utf-8") as f:
        xml_content = f.read()

    try:
        result = await kosit_validator.validate(xml_content)

        # Update invoice status
        invoice.validation_status = "valid" if result["is_valid"] else "invalid"
        invoice.validation_errors = result.get("errors")
        db.commit()

        return result

    except Exception as e:
        logger.error("Validation failed for %s: %s", invoice_id, e)
        raise HTTPException(status_code=500, detail=f"Validierung fehlgeschlagen: {e}")


@router.get("/export/datev")
async def export_datev(
    format: str = Query(default="buchungsstapel", description="buchungsstapel or csv"),
    kontenrahmen: str = Query(default="SKR03", description="SKR03 or SKR04"),
    db: Session = Depends(get_db),
):
    """Export all invoices as DATEV-compatible file."""
    invoices = db.query(Invoice).all()
    if not invoices:
        raise HTTPException(status_code=404, detail="Keine Rechnungen zum Exportieren")

    exporter = DATEVExporter(kontenrahmen=kontenrahmen)

    invoice_dicts = []
    for inv in invoices:
        invoice_dicts.append({
            "invoice_number": inv.invoice_number,
            "invoice_date": str(inv.invoice_date),
            "due_date": str(inv.due_date) if inv.due_date else "",
            "seller_name": inv.seller_name or "",
            "buyer_name": inv.buyer_name or "",
            "net_amount": float(inv.net_amount or 0),
            "tax_rate": float(inv.tax_rate or 19),
            "tax_amount": float(inv.tax_amount or 0),
            "gross_amount": float(inv.gross_amount or 0),
            "currency": getattr(inv, "currency", "EUR") or "EUR",
            "iban": inv.iban or "",
            "bic": inv.bic or "",
            "source_type": inv.source_type or "",
            "validation_status": inv.validation_status or "",
        })

    if format == "csv":
        content = exporter.export_csv_simple(invoice_dicts)
        filename = f"rechnungswerk_export_{datetime.now().strftime('%Y%m%d')}.csv"
    else:
        content = exporter.export_buchungsstapel(invoice_dicts)
        filename = f"EXTF_Buchungsstapel_{datetime.now().strftime('%Y%m%d')}.csv"

    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.post("/invoices/{invoice_id}/check-fraud")
async def check_fraud(
    invoice_id: str = Path(..., pattern=r"^INV-\d{8}-[a-f0-9]{8}$"),
    db: Session = Depends(get_db),
):
    """Run fraud and duplicate detection on an invoice."""
    invoice = db.query(Invoice).filter(Invoice.invoice_id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")

    invoice_data = {
        "invoice_number": invoice.invoice_number,
        "seller_name": invoice.seller_name,
        "seller_vat_id": invoice.seller_vat_id,
        "buyer_name": invoice.buyer_name,
        "iban": invoice.iban,
        "gross_amount": float(invoice.gross_amount or 0),
        "tax_rate": float(invoice.tax_rate or 19),
    }

    result = fraud_detector.check(invoice_data, db)
    return result


@router.post("/invoices/{invoice_id}/categorize")
async def categorize_invoice(
    invoice_id: str = Path(..., pattern=r"^INV-\d{8}-[a-f0-9]{8}$"),
    db: Session = Depends(get_db),
):
    """
    KI-gestützte Kategorisierung einer Rechnung mit SKR03/SKR04-Kontozuordnung.

    Nutzt primär Ollama (qwen2.5:14b) lokal, fällt bei Nicht-Verfügbarkeit
    auf regelbasiertes Keyword-Matching zurück. Kein externer API-Key nötig.
    """
    invoice = db.query(Invoice).filter(Invoice.invoice_id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")

    invoice_data = {
        "invoice_number": invoice.invoice_number,
        "seller_name": invoice.seller_name,
        "seller_vat_id": invoice.seller_vat_id,
        "buyer_name": invoice.buyer_name,
        "buyer_vat_id": invoice.buyer_vat_id,
        "line_items": invoice.line_items or [],
        "net_amount": float(invoice.net_amount or 0),
        "gross_amount": float(invoice.gross_amount or 0),
        "tax_rate": float(invoice.tax_rate or 19),
        "currency": invoice.currency or "EUR",
    }

    categorizer = InvoiceCategorizer()
    result = await categorizer.categorize(invoice_data)

    return {
        "invoice_id": invoice_id,
        "invoice_number": invoice.invoice_number,
        **result,
    }


@router.get("/analytics/summary")
async def analytics_summary(
    db: Session = Depends(get_db),
):
    """Get analytics summary for dashboard."""
    from sqlalchemy import func

    total = db.query(Invoice).count()
    total_gross = db.query(func.sum(Invoice.gross_amount)).scalar() or 0

    # This month's invoices
    today = date.today()
    first_of_month = today.replace(day=1)
    month_count = db.query(Invoice).filter(
        Invoice.invoice_date >= first_of_month,
    ).count()
    month_gross = db.query(func.sum(Invoice.gross_amount)).filter(
        Invoice.invoice_date >= first_of_month,
    ).scalar() or 0

    # OCR success rate
    ocr_total = db.query(Invoice).filter(Invoice.source_type == "ocr").count()
    ocr_high_conf = db.query(Invoice).filter(
        Invoice.source_type == "ocr",
        Invoice.ocr_confidence >= 80,
    ).count()
    ocr_success_rate = round((ocr_high_conf / ocr_total * 100) if ocr_total > 0 else 0, 1)

    # XRechnung generated count
    xrechnung_count = db.query(Invoice).filter(
        Invoice.xrechnung_xml_path.isnot(None),
    ).count()

    # Monthly volumes (last 6 months)
    monthly_volumes = []
    for i in range(5, -1, -1):
        month = today.month - i
        year = today.year
        while month <= 0:
            month += 12
            year -= 1
        month_start = date(year, month, 1)
        if month == 12:
            month_end = date(year + 1, 1, 1)
        else:
            month_end = date(year, month + 1, 1)

        vol = db.query(func.sum(Invoice.gross_amount)).filter(
            Invoice.invoice_date >= month_start,
            Invoice.invoice_date < month_end,
        ).scalar() or 0

        count = db.query(Invoice).filter(
            Invoice.invoice_date >= month_start,
            Invoice.invoice_date < month_end,
        ).count()

        monthly_volumes.append({
            "month": month_start.strftime("%Y-%m"),
            "label": month_start.strftime("%b %Y"),
            "volume": round(float(vol), 2),
            "count": count,
        })

    return {
        "total_invoices": total,
        "total_volume": round(float(total_gross), 2),
        "month_invoices": month_count,
        "month_volume": round(float(month_gross), 2),
        "ocr_success_rate": ocr_success_rate,
        "xrechnung_generated": xrechnung_count,
        "monthly_volumes": monthly_volumes,
    }


@router.get("/analytics/top-suppliers")
async def analytics_top_suppliers(
    db: Session = Depends(get_db),
    current_user: Optional[dict] = Depends(get_current_user_optional),
    from_date: Optional[str] = Query(None, alias="from", description="Start date (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, alias="to", description="End date (YYYY-MM-DD)"),
):
    """
    Return top 5 suppliers by invoice count and total amount.

    Groups invoices by buyer_name (the counterpart on our invoices).
    Accepts optional 'from' and 'to' date params for filtering.
    """
    from sqlalchemy import func, cast, Float as SAFloat

    query = db.query(
        Invoice.buyer_name,
        func.count(Invoice.id).label("invoice_count"),
        func.sum(Invoice.gross_amount).label("total_amount"),
    )

    # Tenant isolation
    if current_user and current_user.get("org_id"):
        query = query.filter(Invoice.organization_id == current_user["org_id"])

    # Date filters
    if from_date:
        try:
            parsed_from = date.fromisoformat(from_date)
            query = query.filter(Invoice.invoice_date >= parsed_from)
        except ValueError:
            raise HTTPException(status_code=400, detail="Ungültiges Startdatum. Format: YYYY-MM-DD")

    if to_date:
        try:
            parsed_to = date.fromisoformat(to_date)
            query = query.filter(Invoice.invoice_date <= parsed_to)
        except ValueError:
            raise HTTPException(status_code=400, detail="Ungültiges Enddatum. Format: YYYY-MM-DD")

    rows = (
        query
        .filter(Invoice.buyer_name.isnot(None))
        .group_by(Invoice.buyer_name)
        .order_by(func.count(Invoice.id).desc())
        .limit(5)
        .all()
    )

    return [
        {
            "name": row[0] or "Unbekannt",
            "invoice_count": row[1],
            "total_amount": round(float(row[2] or 0), 2),
        }
        for row in rows
    ]


@router.get("/analytics/tax-summary")
async def analytics_tax_summary(
    db: Session = Depends(get_db),
    year: Optional[int] = Query(None, description="Filter by invoice year (e.g. 2026)"),
):
    """
    Return tax summary grouped by tax rate for a given year.

    For each tax rate group returns: count, net sum, VAT sum, gross sum.
    """
    from sqlalchemy import func, extract

    query = db.query(
        Invoice.tax_rate,
        func.count(Invoice.id).label("count"),
        func.sum(Invoice.net_amount).label("net"),
        func.sum(Invoice.tax_amount).label("vat"),
        func.sum(Invoice.gross_amount).label("gross"),
    )

    if year is not None:
        query = query.filter(extract("year", Invoice.invoice_date) == year)

    rows = (
        query
        .group_by(Invoice.tax_rate)
        .order_by(Invoice.tax_rate.desc())
        .all()
    )

    def tax_label(rate: float) -> str:
        r = float(rate or 0)
        if r == 19:
            return "19% (Regelsteuersatz)"
        elif r == 7:
            return "7% (ermäßigter Steuersatz)"
        elif r == 0:
            return "0% (steuerfrei/reverse charge)"
        else:
            return f"{r}%"

    return [
        {
            "tax_rate": str(int(float(row[0] or 0))) if float(row[0] or 0) == int(float(row[0] or 0)) else str(float(row[0] or 0)),
            "label": tax_label(row[0]),
            "count": row[1],
            "net": round(float(row[2] or 0), 2),
            "vat": round(float(row[3] or 0), 2),
            "gross": round(float(row[4] or 0), 2),
        }
        for row in rows
    ]


@router.get("/analytics/cashflow")
async def analytics_cashflow(
    db: Session = Depends(get_db),
    months: int = Query(default=6, ge=1, le=24, description="Number of months to look back"),
):
    """
    Return monthly invoice totals for the last N months.

    Groups invoices by invoice_date month and returns total amount and count.
    """
    from sqlalchemy import func

    today = date.today()
    monthly_data = []

    for i in range(months - 1, -1, -1):
        month = today.month - i
        year = today.year
        while month <= 0:
            month += 12
            year -= 1

        month_start = date(year, month, 1)
        if month == 12:
            month_end = date(year + 1, 1, 1)
        else:
            month_end = date(year, month + 1, 1)

        total = db.query(func.sum(Invoice.gross_amount)).filter(
            Invoice.invoice_date >= month_start,
            Invoice.invoice_date < month_end,
        ).scalar() or 0

        count = db.query(Invoice).filter(
            Invoice.invoice_date >= month_start,
            Invoice.invoice_date < month_end,
        ).count()

        monthly_data.append({
            "month": month_start.strftime("%Y-%m"),
            "label": month_start.strftime("%b %Y"),
            "total_amount": round(float(total), 2),
            "invoice_count": count,
        })

    return monthly_data


@router.get("/analytics/overdue-aging")
async def analytics_overdue_aging(
    db: Session = Depends(get_db),
):
    """
    Return overdue invoices grouped by aging buckets.

    Buckets: 0-30, 31-60, 61-90, 90+ days past due_date.
    Only includes invoices where due_date has passed.
    """
    today = date.today()

    overdue = db.query(Invoice).filter(
        Invoice.due_date.isnot(None),
        Invoice.due_date < today,
    ).all()

    buckets = {
        "0-30": {"count": 0, "total_amount": 0.0, "invoices": []},
        "31-60": {"count": 0, "total_amount": 0.0, "invoices": []},
        "61-90": {"count": 0, "total_amount": 0.0, "invoices": []},
        "90+": {"count": 0, "total_amount": 0.0, "invoices": []},
    }

    for inv in overdue:
        days_overdue = (today - inv.due_date).days
        amount = float(inv.gross_amount or 0)

        if days_overdue <= 30:
            key = "0-30"
        elif days_overdue <= 60:
            key = "31-60"
        elif days_overdue <= 90:
            key = "61-90"
        else:
            key = "90+"

        buckets[key]["count"] += 1
        buckets[key]["total_amount"] += amount
        buckets[key]["invoices"].append({
            "id": inv.invoice_id,
            "number": inv.invoice_number,
            "amount": amount,
            "days_overdue": days_overdue,
        })

    return [
        {
            "bucket": bucket,
            "label": f"{bucket} Tage überfällig",
            "count": data["count"],
            "total_amount": round(data["total_amount"], 2),
            "invoices": data["invoices"],
        }
        for bucket, data in buckets.items()
    ]


@router.get("/analytics/category-breakdown")
async def analytics_category_breakdown(
    db: Session = Depends(get_db),
    current_user: Optional[dict] = Depends(get_current_user_optional),
    from_date: Optional[str] = Query(None, alias="from", description="Start date (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, alias="to", description="End date (YYYY-MM-DD)"),
):
    """
    Return revenue grouped by tax rate (0%, 7%, 19%).

    Accepts optional 'from' and 'to' date params for filtering.
    """
    from sqlalchemy import func, case

    query = db.query(
        Invoice.tax_rate,
        func.count(Invoice.id).label("invoice_count"),
        func.sum(Invoice.gross_amount).label("total_amount"),
    )

    # Tenant isolation
    if current_user and current_user.get("org_id"):
        query = query.filter(Invoice.organization_id == current_user["org_id"])

    # Date filters
    if from_date:
        try:
            parsed_from = date.fromisoformat(from_date)
            query = query.filter(Invoice.invoice_date >= parsed_from)
        except ValueError:
            raise HTTPException(status_code=400, detail="Ungültiges Startdatum. Format: YYYY-MM-DD")

    if to_date:
        try:
            parsed_to = date.fromisoformat(to_date)
            query = query.filter(Invoice.invoice_date <= parsed_to)
        except ValueError:
            raise HTTPException(status_code=400, detail="Ungültiges Enddatum. Format: YYYY-MM-DD")

    rows = (
        query
        .group_by(Invoice.tax_rate)
        .order_by(func.sum(Invoice.gross_amount).desc())
        .all()
    )

    # Map tax rates to labels
    def tax_label(rate: float) -> str:
        r = float(rate or 0)
        if r == 0:
            return "0% (steuerfrei)"
        elif r == 7:
            return "7% (ermäßigt)"
        elif r == 19:
            return "19% (Regelsteuersatz)"
        else:
            return f"{r}%"

    return [
        {
            "tax_rate": float(row[0] or 0),
            "label": tax_label(row[0]),
            "invoice_count": row[1],
            "total_amount": round(float(row[2] or 0), 2),
        }
        for row in rows
    ]
