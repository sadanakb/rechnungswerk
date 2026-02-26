"""Newsletter subscription router."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr

from app import brevo_service

router = APIRouter(prefix="/api/newsletter", tags=["newsletter"])


class SubscribeRequest(BaseModel):
    email: EmailStr


@router.post("/subscribe")
def subscribe(req: SubscribeRequest):
    """Subscribe an email address to the RechnungsWerk newsletter."""
    success = brevo_service.add_contact(req.email)
    if not success:
        raise HTTPException(
            status_code=500, detail="Newsletter-Anmeldung fehlgeschlagen"
        )
    return {"status": "subscribed", "email": req.email}
