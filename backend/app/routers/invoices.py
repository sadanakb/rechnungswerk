"""
Invoice processing endpoints
"""
import logging
import tempfile

from fastapi import APIRouter, Depends, Path, Query, Request, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Invoice, UploadLog
from app.schemas import (
    InvoiceCreate, InvoiceResponse, InvoiceListResponse, OCRResult,
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
from app.config import settings
import uuid
import os
import io
from datetime import datetime, date
import re
from typing import List

logger = logging.getLogger(__name__)
limiter = Limiter(key_func=get_remote_address)

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
    db: Session = Depends(get_db)
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

    # Create invoice record
    db_invoice = Invoice(
        invoice_id=invoice_id,
        invoice_number=invoice.invoice_number,
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
        validation_status="pending"
    )

    db.add(db_invoice)
    db.commit()
    db.refresh(db_invoice)

    return db_invoice


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
    db: Session = Depends(get_db)
):
    """List all invoices with pagination"""
    total = db.query(Invoice).count()
    invoices = db.query(Invoice).offset(skip).limit(limit).all()
    return InvoiceListResponse(items=invoices, total=total, skip=skip, limit=limit)


@router.get("/invoices/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: str = Path(..., pattern=r"^INV-\d{8}-[a-f0-9]{8}$"),
    db: Session = Depends(get_db)
):
    """Get single invoice by ID"""
    invoice = db.query(Invoice).filter(Invoice.invoice_id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")
    return invoice


@router.delete("/invoices/{invoice_id}")
async def delete_invoice(
    invoice_id: str = Path(..., pattern=r"^INV-\d{8}-[a-f0-9]{8}$"),
    db: Session = Depends(get_db)
):
    """Delete invoice and clean up associated files (M5)."""
    invoice = db.query(Invoice).filter(Invoice.invoice_id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")

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
):
    """Download ZUGFeRD PDF/A-3 file."""
    invoice = db.query(Invoice).filter(Invoice.invoice_id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")

    if not invoice.zugferd_pdf_path:
        raise HTTPException(status_code=404, detail="ZUGFeRD PDF wurde noch nicht generiert")

    pdf_path = os.path.realpath(invoice.zugferd_pdf_path)
    if not pdf_path.startswith(_ZUGFERD_BASE):
        raise HTTPException(status_code=403, detail="Zugriff verweigert")

    if not os.path.isfile(pdf_path):
        raise HTTPException(status_code=404, detail="ZUGFeRD PDF-Datei nicht gefunden")

    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{os.path.basename(pdf_path)}"',
            "Content-Length": str(len(pdf_bytes)),
        },
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
