"""
Contact form endpoint — public, no authentication required.
"""
import logging

from fastapi import APIRouter
from pydantic import BaseModel, EmailStr

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/contact", tags=["contact"])


class ContactMessage(BaseModel):
    name: str
    email: str
    subject: str
    message: str


@router.post("")
async def send_contact_message(body: ContactMessage):
    """Receive a contact form submission and optionally send it via email."""
    logger.info(
        "Contact form submission from %s (%s) — subject: %s",
        body.name,
        body.email,
        body.subject,
    )
    # Try to send via email service, silently fail if not configured
    try:
        from app.email_service import send_contact_email
        send_contact_email(body.name, body.email, body.subject, body.message)
    except Exception as exc:  # noqa: BLE001
        logger.debug("Contact email not sent (service not configured or error): %s", exc)
        # Don't fail the request if email isn't configured
    return {"ok": True, "message": "Ihre Nachricht wurde empfangen"}
