"""
Public portal router — no authentication required.

Customer-facing endpoints accessed via share token.
Rate limited to prevent abuse.
"""
import io
import os
import tempfile
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Invoice, InvoiceShareLink, Organization, PortalPaymentIntent
from app.rate_limiter import limiter
from app.storage import get_storage
from app import stripe_service

router = APIRouter()


def _storage_path(org_id, category: str, filename: str) -> str:
    if org_id:
        return f"{org_id}/{category}/{filename}"
    return f"shared/{category}/{filename}"


def _get_invoice_by_token(token: str, db: Session) -> tuple:
    """Resolve token to (invoice, share_link, org) or raise 404/410."""
    link = db.query(InvoiceShareLink).filter(InvoiceShareLink.token == token).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link nicht gefunden")

    expires = link.expires_at
    if expires:
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < datetime.now(timezone.utc):
            raise HTTPException(status_code=410, detail="Link ist abgelaufen")

    invoice = db.query(Invoice).filter(Invoice.id == link.invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")

    org = db.query(Organization).filter(Organization.id == invoice.organization_id).first()

    link.access_count += 1
    db.commit()

    return invoice, link, org


@router.get("/{token}")
@limiter.limit("30/minute")
async def get_portal_invoice(
    token: str, request: Request, db: Session = Depends(get_db)
):
    """Return invoice data for portal display. Public endpoint — no auth required."""
    invoice, link, org = _get_invoice_by_token(token, db)

    from app.ws import notify_org
    try:
        await notify_org(
            invoice.organization_id or 0,
            "portal.visited",
            {"invoice_id": invoice.invoice_id, "access_count": link.access_count},
        )
    except Exception:
        pass  # WS notification is best-effort

    return {
        "invoice_number": invoice.invoice_number,
        "invoice_date": str(invoice.invoice_date) if invoice.invoice_date else None,
        "due_date": str(invoice.due_date) if invoice.due_date else None,
        "seller_name": invoice.seller_name,
        "seller_address": invoice.seller_address,
        "seller_vat_id": invoice.seller_vat_id,
        "buyer_name": invoice.buyer_name,
        "buyer_address": invoice.buyer_address,
        "buyer_vat_id": invoice.buyer_vat_id,
        "net_amount": float(invoice.net_amount or 0),
        "tax_amount": float(invoice.tax_amount or 0),
        "gross_amount": float(invoice.gross_amount or 0),
        "tax_rate": float(invoice.tax_rate or 19),
        "currency": invoice.currency or "EUR",
        "line_items": invoice.line_items or [],
        "payment_status": invoice.payment_status or "unpaid",
        "iban": invoice.iban,
        "payment_account_name": invoice.payment_account_name,
        "expires_at": link.expires_at.isoformat() if link.expires_at else None,
        # Phase 12: online payment options
        "stripe_payment_enabled": bool(org and org.stripe_connect_onboarded),
        "paypal_link": (org.paypal_link if org else None),
    }


@router.post("/{token}/confirm-payment")
@limiter.limit("10/minute")
async def confirm_payment(
    token: str, request: Request, db: Session = Depends(get_db)
):
    """Customer confirms they have made payment. Sets payment_status to 'payment_pending_confirmation'."""
    from datetime import date

    invoice, _link, _org = _get_invoice_by_token(token, db)

    if invoice.payment_status == "paid":
        return {"message": "Bereits als bezahlt markiert", "payment_status": "paid"}

    if invoice.payment_status == "payment_pending_confirmation":
        return {"message": "Zahlungsbestaetigung bereits eingereicht", "payment_status": "payment_pending_confirmation"}

    invoice.payment_status = "payment_pending_confirmation"
    invoice.paid_date = date.today()
    invoice.payment_method = "portal_confirmation"
    db.commit()

    # Notify org via WebSocket
    from app.ws import notify_org
    try:
        await notify_org(
            invoice.organization_id or 0,
            "invoice.payment_pending",
            {"invoice_id": invoice.invoice_id, "amount": float(invoice.gross_amount or 0)},
        )
    except Exception:
        pass  # WS notification is best-effort

    return {"message": "Zahlungsbestaetigung eingereicht", "payment_status": "payment_pending_confirmation"}


@router.get("/{token}/download-pdf")
@limiter.limit("10/minute")
async def download_pdf(
    token: str, request: Request, db: Session = Depends(get_db)
):
    """Serve ZUGFeRD PDF for download."""
    invoice, _link, _org = _get_invoice_by_token(token, db)

    storage = get_storage()

    if invoice.zugferd_pdf_path:
        try:
            data = storage.read(invoice.zugferd_pdf_path)
            return StreamingResponse(
                io.BytesIO(data),
                media_type="application/pdf",
                headers={
                    "Content-Disposition": f'attachment; filename="Rechnung_{invoice.invoice_number}.pdf"'
                },
            )
        except Exception:
            pass  # Fall through to on-the-fly generation

    # Generate on-the-fly
    from app.xrechnung_generator import XRechnungGenerator
    from app.zugferd_generator import ZUGFeRDGenerator

    invoice_data = {
        "invoice_number": invoice.invoice_number or "",
        "invoice_date": str(invoice.invoice_date) if invoice.invoice_date else "",
        "due_date": str(invoice.due_date) if invoice.due_date else None,
        "seller_name": invoice.seller_name or "",
        "seller_vat_id": invoice.seller_vat_id or "",
        "seller_address": invoice.seller_address or "",
        "buyer_name": invoice.buyer_name or "",
        "buyer_vat_id": invoice.buyer_vat_id or "",
        "buyer_address": invoice.buyer_address or "",
        "net_amount": float(invoice.net_amount or 0),
        "tax_amount": float(invoice.tax_amount or 0),
        "gross_amount": float(invoice.gross_amount or 0),
        "tax_rate": float(invoice.tax_rate or 19),
        "currency": invoice.currency or "EUR",
        "line_items": invoice.line_items or [],
        "iban": invoice.iban or "",
        "bic": invoice.bic or "",
        "payment_account_name": invoice.payment_account_name or "",
        "logo_url": _org.logo_url if _org else None,
    }

    xml_content = XRechnungGenerator().generate_xml(invoice_data)
    pdf_filename = f"{invoice.invoice_id}_portal.pdf"

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = os.path.join(tmp_dir, pdf_filename)
        ZUGFeRDGenerator().generate(invoice_data, xml_content, tmp_path)
        with open(tmp_path, "rb") as f:
            pdf_bytes = f.read()

    path = _storage_path(invoice.organization_id, "zugferd", pdf_filename)
    storage.save(path, pdf_bytes)

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="Rechnung_{invoice.invoice_number}.pdf"'
        },
    )


@router.get("/{token}/download-xml")
@limiter.limit("10/minute")
async def download_xml(
    token: str, request: Request, db: Session = Depends(get_db)
):
    """Serve XRechnung XML for download."""
    invoice, _link, _org = _get_invoice_by_token(token, db)

    invoice_data = {
        "invoice_number": invoice.invoice_number or "",
        "invoice_date": str(invoice.invoice_date) if invoice.invoice_date else "",
        "due_date": str(invoice.due_date) if invoice.due_date else None,
        "seller_name": invoice.seller_name or "",
        "seller_vat_id": invoice.seller_vat_id or "",
        "seller_address": invoice.seller_address or "",
        "buyer_name": invoice.buyer_name or "",
        "buyer_vat_id": invoice.buyer_vat_id or "",
        "buyer_address": invoice.buyer_address or "",
        "net_amount": float(invoice.net_amount or 0),
        "tax_amount": float(invoice.tax_amount or 0),
        "gross_amount": float(invoice.gross_amount or 0),
        "tax_rate": float(invoice.tax_rate or 19),
        "currency": invoice.currency or "EUR",
        "line_items": invoice.line_items or [],
        "iban": invoice.iban or "",
        "bic": invoice.bic or "",
        "payment_account_name": invoice.payment_account_name or "",
    }

    from app.xrechnung_generator import XRechnungGenerator
    xml_content = XRechnungGenerator().generate_xml(invoice_data)
    xml_bytes = xml_content.encode("utf-8") if isinstance(xml_content, str) else xml_content

    return Response(
        content=xml_bytes,
        media_type="application/xml",
        headers={
            "Content-Disposition": f'attachment; filename="Rechnung_{invoice.invoice_number}.xml"'
        },
    )


@router.post("/{token}/create-payment-intent")
@limiter.limit("10/minute")
async def create_payment_intent(
    token: str, request: Request, db: Session = Depends(get_db)
):
    """Create a Stripe PaymentIntent for this invoice. Idempotent — returns existing if pending."""
    invoice, link, org = _get_invoice_by_token(token, db)

    if invoice.payment_status == "paid":
        raise HTTPException(status_code=409, detail="Rechnung bereits bezahlt")

    if not org or not org.stripe_connect_onboarded or not org.stripe_connect_account_id:
        raise HTTPException(status_code=409, detail="Online-Zahlung nicht aktiviert")

    # Idempotency: return existing "created" intent without calling Stripe again
    # with_for_update() locks the row to prevent race conditions with concurrent requests
    existing = db.query(PortalPaymentIntent).filter(
        PortalPaymentIntent.invoice_id == invoice.id,
        PortalPaymentIntent.status == "created",
    ).with_for_update().first()
    if existing:
        return {
            "intent_id": existing.stripe_intent_id,
            "client_secret": existing.client_secret,
            "amount": existing.amount_cents,
            "currency": invoice.currency or "EUR",
        }

    amount_cents = round(float(invoice.gross_amount or 0) * 100)
    fee_cents = round(amount_cents * 0.005)

    try:
        result = stripe_service.create_portal_payment_intent(
            amount_cents=amount_cents,
            currency=invoice.currency or "EUR",
            connected_account_id=org.stripe_connect_account_id,
            fee_cents=fee_cents,
            metadata={
                "invoice_id": str(invoice.id),
                "invoice_number": invoice.invoice_number or "",
                "share_link_id": str(link.id),
            },
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Stripe-Fehler: {e}")

    ppi = PortalPaymentIntent(
        invoice_id=invoice.id,
        share_link_id=link.id,
        stripe_intent_id=result["intent_id"],
        client_secret=result["client_secret"],
        amount_cents=amount_cents,
        fee_cents=fee_cents,
        status="created",
    )
    db.add(ppi)
    db.commit()

    return {
        "intent_id": result["intent_id"],
        "client_secret": result["client_secret"],
        "amount": amount_cents,
        "currency": invoice.currency or "EUR",
    }


@router.get("/{token}/payment-status")
@limiter.limit("30/minute")
async def get_payment_status(
    token: str, request: Request, db: Session = Depends(get_db)
):
    """Return current payment status for polling after Stripe redirect."""
    invoice, _link, _org = _get_invoice_by_token(token, db)
    return {"payment_status": invoice.payment_status or "unpaid"}
