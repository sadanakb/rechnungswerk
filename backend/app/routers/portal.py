"""
Public portal router — no authentication required.

Customer-facing endpoints accessed via share token.
Rate limited to prevent abuse.
"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Invoice, InvoiceShareLink
from app.rate_limiter import limiter

router = APIRouter()


def _get_invoice_by_token(token: str, db: Session) -> tuple:
    """Resolve token to (invoice, share_link) or raise 404/410."""
    link = db.query(InvoiceShareLink).filter(InvoiceShareLink.token == token).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link nicht gefunden")

    if link.expires_at and link.expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="Link ist abgelaufen")

    invoice = db.query(Invoice).filter(Invoice.id == link.invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")

    link.access_count += 1
    db.commit()

    return invoice, link


@router.get("/{token}")
@limiter.limit("30/minute")
async def get_portal_invoice(
    token: str, request: Request, db: Session = Depends(get_db)
):
    """Return invoice data for portal display. Public endpoint — no auth required."""
    invoice, link = _get_invoice_by_token(token, db)

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
    }


@router.post("/{token}/confirm-payment")
@limiter.limit("10/minute")
async def confirm_payment(
    token: str, request: Request, db: Session = Depends(get_db)
):
    """Customer confirms they have made payment. Sets payment_status to 'paid'."""
    from datetime import date

    invoice, _ = _get_invoice_by_token(token, db)

    if invoice.payment_status == "paid":
        return {"message": "Bereits als bezahlt markiert", "payment_status": "paid"}

    invoice.payment_status = "paid"
    invoice.paid_date = date.today()
    invoice.payment_method = "portal_confirmation"
    db.commit()

    return {"message": "Zahlung bestaetigt", "payment_status": "paid"}


@router.get("/{token}/download-pdf")
@limiter.limit("10/minute")
async def download_pdf(
    token: str, request: Request, db: Session = Depends(get_db)
):
    """Serve ZUGFeRD PDF for download."""
    import os

    invoice, _ = _get_invoice_by_token(token, db)

    if invoice.zugferd_pdf_path and os.path.exists(invoice.zugferd_pdf_path):
        return FileResponse(
            path=invoice.zugferd_pdf_path,
            media_type="application/pdf",
            filename=f"Rechnung_{invoice.invoice_number}.pdf",
        )

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
    }

    xml_content = XRechnungGenerator().generate_xml(invoice_data)
    pdf_path = f"data/zugferd_output/{invoice.invoice_id}_portal.pdf"
    os.makedirs("data/zugferd_output", exist_ok=True)
    ZUGFeRDGenerator().generate(invoice_data, xml_content, pdf_path)

    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename=f"Rechnung_{invoice.invoice_number}.pdf",
    )


@router.get("/{token}/download-xml")
@limiter.limit("10/minute")
async def download_xml(
    token: str, request: Request, db: Session = Depends(get_db)
):
    """Serve XRechnung XML for download."""
    invoice, _ = _get_invoice_by_token(token, db)

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
