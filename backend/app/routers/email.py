"""
Email inbox router — process IMAP inboxes for PDF invoice attachments.

POST /api/email/process-inbox  — fetch PDFs from IMAP, optionally run OCR
GET  /api/email/status         — last inbox scan result
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from app.email.inbox_processor import InboxProcessor

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/email", tags=["Email"])

_last_result: dict = {}


class EmailConfig(BaseModel):
    imap_host: str = Field(..., description="IMAP server hostname")
    imap_port: int = Field(993, description="IMAP port (993=SSL, 143=plain)")
    username: str = Field(..., description="IMAP login username / email")
    password: str = Field(..., description="IMAP password or app password")
    folder: str = Field("INBOX", description="Mailbox folder to scan")
    use_ssl: bool = Field(True, description="Use IMAPS (SSL/TLS)")
    since_date: Optional[str] = Field(None, description="Only emails since YYYY-MM-DD")
    max_emails: int = Field(50, ge=1, le=200, description="Max emails to scan (1-200)")
    run_ocr: bool = Field(True, description="Run OCR pipeline on found PDFs")


class AttachmentResult(BaseModel):
    filename: str
    file_path: str
    sender: str
    subject: str
    date: str
    file_size: int
    ocr_invoice_id: Optional[str] = None
    ocr_confidence: Optional[float] = None
    ocr_error: Optional[str] = None


class InboxProcessResult(BaseModel):
    processed: int
    attachments_found: int
    ocr_triggered: int
    results: List[AttachmentResult]


def _run_ocr(file_path: str) -> dict:
    """Run OCR pipeline on a PDF and return invoice_id + confidence."""
    try:
        from app.ollama_extractor import extract_invoice_fields
        result = extract_invoice_fields(file_path)
        return {
            "invoice_id": result.get("source", "unknown"),
            "confidence": result.get("confidence", 0.0),
        }
    except Exception as e:
        return {"error": str(e)}


@router.post("/process-inbox", response_model=InboxProcessResult)
def process_inbox(config: EmailConfig):
    """
    Fetch PDF invoice attachments from an IMAP inbox.

    Connects to the specified mailbox, finds unread emails with PDF attachments,
    saves them to data/uploads/, and optionally runs the OCR pipeline on each PDF.
    """
    global _last_result

    try:
        processor = InboxProcessor(
            imap_host=config.imap_host,
            imap_port=config.imap_port,
            username=config.username,
            password=config.password,
            folder=config.folder,
            use_ssl=config.use_ssl,
        )
        raw_results = processor.fetch_pdf_attachments(
            since_date=config.since_date,
            max_emails=config.max_emails,
        )
    except ConnectionError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        logger.error("Email processing failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Email-Verarbeitung fehlgeschlagen: {e}")

    attachments: List[AttachmentResult] = []
    ocr_count = 0

    for raw in raw_results:
        att = AttachmentResult(
            filename=raw["filename"],
            file_path=raw["file_path"],
            sender=raw["sender"],
            subject=raw["subject"],
            date=raw["date"],
            file_size=raw["file_size"],
        )
        if config.run_ocr:
            ocr = _run_ocr(raw["file_path"])
            if "error" in ocr:
                att.ocr_error = ocr["error"]
            else:
                att.ocr_invoice_id = ocr.get("invoice_id")
                att.ocr_confidence = ocr.get("confidence")
                ocr_count += 1
        attachments.append(att)

    result = InboxProcessResult(
        processed=len(raw_results),
        attachments_found=len(raw_results),
        ocr_triggered=ocr_count,
        results=attachments,
    )
    _last_result = result.model_dump()
    logger.info("Inbox scan complete: %d attachments, %d OCR runs", len(raw_results), ocr_count)
    return result


@router.get("/status")
def inbox_status():
    """Return the result of the last inbox scan."""
    if not _last_result:
        return {"message": "Noch kein Inbox-Scan durchgeführt"}
    return _last_result
