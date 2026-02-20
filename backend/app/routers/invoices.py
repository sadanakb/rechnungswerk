"""
Invoice processing endpoints
"""
import logging

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Invoice, UploadLog
from app.schemas import InvoiceCreate, InvoiceResponse, OCRResult
from app.ocr_pipeline import OCRPipeline
from app.ollama_extractor import extract_invoice_fields as ollama_extract
from app.xrechnung_generator import XRechnungGenerator
import uuid
import os
import io
from datetime import datetime, date
from typing import List

logger = logging.getLogger(__name__)

router = APIRouter()
ocr_pipeline = OCRPipeline()
xrechnung_gen = XRechnungGenerator()

# Storage directories
UPLOAD_DIR = "data/uploads"
XML_DIR = "data/xml_output"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(XML_DIR, exist_ok=True)


@router.post("/upload-ocr", response_model=OCRResult)
async def upload_pdf_for_ocr(
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
    # Validate file type
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")
    
    # Generate unique IDs
    upload_id = f"upload-{uuid.uuid4().hex[:8]}"
    invoice_id = f"INV-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:8]}"
    
    # Save uploaded file
    file_path = os.path.join(UPLOAD_DIR, f"{upload_id}.pdf")
    try:
        contents = await file.read()
        with open(file_path, "wb") as f:
            f.write(contents)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
    
    # Log upload
    upload_log = UploadLog(
        upload_id=upload_id,
        filename=file.filename,
        file_type="pdf",
        file_size=len(contents),
        upload_status="processing",
        invoice_id=invoice_id
    )
    db.add(upload_log)
    db.commit()
    
    # Extract invoice fields – primary: Ollama Vision; fallback: Tesseract
    try:
        logger.info("Starting OCR extraction for upload_id=%s via Ollama Vision", upload_id)
        result = ollama_extract(file_path)

        fields = result.get("fields", {})
        confidence = result.get("confidence", 0.0)
        raw_text = result.get("raw_text", "")
        source = result.get("source", "unknown")

        logger.info(
            "OCR extraction finished – source=%s, confidence=%.1f%%",
            source,
            confidence,
        )

        if not fields and not raw_text:
            upload_log.upload_status = "error"
            upload_log.error_message = "No content extracted from PDF"
            db.commit()
            raise HTTPException(status_code=400, detail="Failed to extract content from PDF")

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
            extracted_text=raw_text[:500],  # First 500 chars
            confidence=round(confidence, 2),
            fields=fields,
            suggestions=suggestions,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("OCR processing failed for upload_id=%s: %s", upload_id, e)
        upload_log.upload_status = "error"
        upload_log.error_message = str(e)
        db.commit()
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")


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
        line_items=[item.dict() for item in invoice.line_items],
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
async def generate_xrechnung(
    invoice_id: str,
    db: Session = Depends(get_db)
):
    """
    Generate XRechnung UBL XML from invoice
    """
    # Get invoice
    invoice = db.query(Invoice).filter(Invoice.invoice_id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
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
            "xml_path": xml_path,
            "download_url": f"/api/invoices/{invoice_id}/download-xrechnung",
            "message": "XRechnung XML generated successfully"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"XML generation failed: {str(e)}")


@router.get("/invoices", response_model=List[InvoiceResponse])
async def list_invoices(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """List all invoices"""
    invoices = db.query(Invoice).offset(skip).limit(limit).all()
    return invoices


@router.get("/invoices/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(invoice_id: str, db: Session = Depends(get_db)):
    """Get single invoice by ID"""
    invoice = db.query(Invoice).filter(Invoice.invoice_id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice


@router.get("/invoices/{invoice_id}/download-xrechnung")
async def download_xrechnung(invoice_id: str, db: Session = Depends(get_db)):
    """
    Download XRechnung UBL XML file for an invoice.

    Returns the XML as an attachment (application/xml).
    """
    invoice = db.query(Invoice).filter(Invoice.invoice_id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if not invoice.xrechnung_xml_path:
        raise HTTPException(
            status_code=404,
            detail="XRechnung XML has not been generated yet. "
                   "Call POST /api/invoices/{invoice_id}/generate-xrechnung first."
        )

    xml_file_path = invoice.xrechnung_xml_path
    if not os.path.isfile(xml_file_path):
        raise HTTPException(
            status_code=404,
            detail=f"XML file not found on disk: {xml_file_path}"
        )

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
