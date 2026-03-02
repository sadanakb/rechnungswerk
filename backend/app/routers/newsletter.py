"""Newsletter subscription router."""
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr

from app import brevo_service
from app.rate_limiter import limiter

router = APIRouter(prefix="/api/newsletter", tags=["newsletter"])


class SubscribeRequest(BaseModel):
    email: EmailStr
    website: Optional[str] = None  # honeypot — hidden field, bots fill it


@router.post("/subscribe")
@limiter.limit("3/minute")
def subscribe(request: Request, req: SubscribeRequest):
    # Honeypot check — real users never fill the hidden 'website' field
    if req.website:
        raise HTTPException(status_code=400, detail="Invalid request")
    """Subscribe an email address to the RechnungsWerk newsletter."""
    success = brevo_service.add_contact(req.email)
    if not success:
        raise HTTPException(
            status_code=500, detail="Newsletter-Anmeldung fehlgeschlagen"
        )
    return {"status": "subscribed", "email": req.email}
