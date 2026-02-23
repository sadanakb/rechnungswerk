"""
Background task worker using ARQ (Redis-based).

Handles:
- OCR batch processing
- ZUGFeRD PDF generation
- Email inbox processing
- Scheduled recurring invoice generation

Requires Redis: redis-server running on localhost:6379
"""
import logging
from typing import Dict

logger = logging.getLogger(__name__)


async def process_ocr_batch(ctx: Dict, batch_id: str, file_paths: list):
    """Process a batch of PDFs through OCR pipeline."""
    from app.ocr.batch_processor import BatchProcessor

    processor = BatchProcessor()
    result = processor.process_batch(batch_id, file_paths)
    logger.info("Batch %s completed: %d/%d succeeded", batch_id, result.succeeded, result.total_files)
    return {"batch_id": batch_id, "status": result.status}


async def generate_zugferd_task(ctx: Dict, invoice_id: str):
    """Generate ZUGFeRD PDF in background."""
    from app.database import SessionLocal
    from app.models import Invoice
    from app.xrechnung_generator import XRechnungGenerator
    from app.zugferd_generator import ZUGFeRDGenerator
    import os

    db = SessionLocal()
    try:
        invoice = db.query(Invoice).filter(Invoice.invoice_id == invoice_id).first()
        if not invoice:
            return {"error": f"Invoice {invoice_id} not found"}

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
            "line_items": invoice.line_items or [],
            "iban": invoice.iban,
            "bic": invoice.bic,
            "payment_account_name": invoice.payment_account_name,
        }

        xml_content = XRechnungGenerator().generate_xml(invoice_data)
        pdf_path = os.path.join("data/zugferd_output", f"{invoice_id}_zugferd.pdf")
        ZUGFeRDGenerator().generate(invoice_data, xml_content, pdf_path)

        invoice.zugferd_pdf_path = pdf_path
        db.commit()

        logger.info("ZUGFeRD generated for %s", invoice_id)
        return {"invoice_id": invoice_id, "pdf_path": pdf_path}
    finally:
        db.close()


async def process_email_inbox(ctx: Dict, config: Dict):
    """Process email inbox for PDF attachments."""
    from app.email.inbox_processor import InboxProcessor

    processor = InboxProcessor(
        imap_host=config["imap_host"],
        imap_port=config.get("imap_port", 993),
        username=config["username"],
        password=config["password"],
        folder=config.get("folder", "INBOX"),
    )

    results = processor.fetch_pdf_attachments()
    logger.info("Fetched %d PDF attachments from inbox", len(results))
    return {"attachments_found": len(results), "results": results}


async def startup(ctx: Dict):
    """Worker startup hook."""
    logger.info("ARQ worker started")


async def shutdown(ctx: Dict):
    """Worker shutdown hook."""
    logger.info("ARQ worker stopped")


class WorkerSettings:
    """ARQ worker configuration."""
    functions = [
        process_ocr_batch,
        generate_zugferd_task,
        process_email_inbox,
    ]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = None  # Uses default localhost:6379
    max_jobs = 10
    job_timeout = 600  # 10 minutes
