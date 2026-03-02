"""
Email inbox router — process IMAP inboxes for PDF invoice attachments.

POST /api/email/process-inbox  — fetch PDFs from IMAP, optionally run OCR
GET  /api/email/status         — last inbox scan result
"""
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from app.auth_jwt import get_current_user
from app.email.inbox_processor import InboxProcessor
from app.utils.network import validate_host_no_ssrf

logger = logging.getLogger(__name__)
audit_logger = logging.getLogger("audit.email")
router = APIRouter(prefix="/api/email", tags=["Email"])

# User-scoped cache: keyed by user_id
_last_result: Dict[str, dict] = {}

_ALLOWED_IMAP_PORTS = {993, 143}


def _validate_imap_host(host: str, port: int) -> None:
    """
    Validate an IMAP host to prevent SSRF attacks.

    Delegates to the shared SSRF validator in ``app.utils.network``.
    """
    validate_host_no_ssrf(
        host,
        port,
        allowed_ports=_ALLOWED_IMAP_PORTS,
        label="IMAP-Host",
    )


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
def process_inbox(config: EmailConfig, current_user: dict = Depends(get_current_user)):
    """
    Fetch PDF invoice attachments from an IMAP inbox.

    Connects to the specified mailbox, finds unread emails with PDF attachments,
    saves them to data/uploads/, and optionally runs the OCR pipeline on each PDF.
    """
    user_id = current_user.get("sub", current_user.get("user_id", "unknown"))

    # --- Audit logging ---
    audit_logger.info(
        "process_inbox called | user_id=%s | imap_host=%s | port=%d | timestamp=%s",
        user_id,
        config.imap_host,
        config.imap_port,
        datetime.now(timezone.utc).isoformat(),
    )

    # --- SSRF validation: block private IPs and non-standard ports ---
    _validate_imap_host(config.imap_host, config.imap_port)

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
    _last_result[user_id] = result.model_dump()
    logger.info("Inbox scan complete: %d attachments, %d OCR runs", len(raw_results), ocr_count)
    return result


@router.get("/status")
def inbox_status(current_user: dict = Depends(get_current_user)):
    """Return the result of the last inbox scan for the current user."""
    user_id = current_user.get("sub", current_user.get("user_id", "unknown"))
    user_result = _last_result.get(user_id)
    if not user_result:
        return {"message": "Noch kein Inbox-Scan durchgeführt"}
    return user_result
