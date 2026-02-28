"""DATEV Export Router — Phase 10.

Endpoints:
    GET  /api/datev/export              — Download EXTF ZIP (only categorized invoices)
    POST /api/datev/send-email          — Notify Steuerberater by email
"""
import calendar as _calendar
import io
import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth_jwt import get_current_user
from app.database import get_db
from app.models import Invoice, Organization, OrganizationMember

logger = logging.getLogger(__name__)
router = APIRouter()


def _resolve_org(current_user: dict, db: Session) -> Organization:
    """Return the Organization for the current user, or raise 404."""
    member = db.query(OrganizationMember).filter(
        OrganizationMember.user_id == int(current_user["user_id"])
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Organisation nicht gefunden")
    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation nicht gefunden")
    return org


def _parse_month(month_str: str, is_start: bool) -> date:
    """Parse 'YYYY-MM' to a date (first or last day of the month)."""
    try:
        year, month = map(int, month_str.split("-"))
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=422,
            detail=f"Ungültiges Monatsformat: {month_str!r}. Erwartet: YYYY-MM",
        )
    if is_start:
        return date(year, month, 1)
    last_day = _calendar.monthrange(year, month)[1]
    return date(year, month, last_day)


@router.get("/export")
async def export_datev(
    from_month: str = Query(..., description="Von-Monat im Format YYYY-MM"),
    to_month: str = Query(..., description="Bis-Monat im Format YYYY-MM"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Export categorized invoices as DATEV EXTF Buchungsstapel ZIP.

    Only invoices with skr03_account set (Phase 9 AI categorization) are included.
    Returns ZIP with Buchungsstapel_<period>.csv + Stammdaten_<period>.csv.
    """
    from app.export.datev_export import DATEVExporter

    org = _resolve_org(current_user, db)
    date_from = _parse_month(from_month, is_start=True)
    date_to = _parse_month(to_month, is_start=False)

    # Only categorized invoices
    invoices = (
        db.query(Invoice)
        .filter(
            Invoice.organization_id == org.id,
            Invoice.skr03_account.isnot(None),
            Invoice.invoice_date >= date_from,
            Invoice.invoice_date <= date_to,
        )
        .order_by(Invoice.invoice_date)
        .all()
    )

    if not invoices:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Keine kategorisierten Rechnungen im Zeitraum {from_month}–{to_month}. "
                "Bitte zuerst KI-Kategorisierung ausführen."
            ),
        )

    # Build invoice dicts
    invoice_dicts = [
        {
            "invoice_number": inv.invoice_number or "",
            "invoice_date": str(inv.invoice_date),
            "seller_name": inv.seller_name or "",
            "buyer_name": inv.buyer_name or "",
            "net_amount": float(inv.net_amount or 0),
            "tax_rate": float(inv.tax_rate or 19),
            "tax_amount": float(inv.tax_amount or 0),
            "gross_amount": float(inv.gross_amount or 0),
            "currency": "EUR",
            "skr03_account": inv.skr03_account or "",
        }
        for inv in invoices
    ]

    # Build unique contacts (sellers -> Kreditoren, starting at 70001)
    seen_names: dict = {}
    contacts = []
    for inv in invoices:
        name = inv.seller_name or "Unbekannt"
        if name not in seen_names:
            seen_names[name] = True
            contacts.append({"account_nr": str(70001 + len(contacts)), "name": name})

    exporter = DATEVExporter(kontenrahmen="SKR03")
    zip_bytes = exporter.export_zip(
        invoice_dicts,
        contacts,
        berater_nr=org.datev_berater_nr or "",
        mandant_nr=org.datev_mandant_nr or "",
        from_month=from_month,
        to_month=to_month,
    )

    filename = f"DATEV_{from_month}_{to_month}.zip"
    return StreamingResponse(
        io.BytesIO(zip_bytes),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


class SendEmailRequest(BaseModel):
    from_month: str
    to_month: str


@router.post("/send-email")
async def send_datev_email(
    body: SendEmailRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Send a notification to the organization's Steuerberater about a new DATEV export.
    Requires steuerberater_email to be configured in DATEV settings.
    """
    from app.email_service import enqueue_email

    org = _resolve_org(current_user, db)

    if not org.steuerberater_email:
        raise HTTPException(
            status_code=400,
            detail=(
                "Keine Steuerberater-E-Mail konfiguriert. "
                "Bitte in Einstellungen > DATEV hinterlegen."
            ),
        )

    date_from = _parse_month(body.from_month, is_start=True)
    date_to = _parse_month(body.to_month, is_start=False)
    count = (
        db.query(Invoice)
        .filter(
            Invoice.organization_id == org.id,
            Invoice.skr03_account.isnot(None),
            Invoice.invoice_date >= date_from,
            Invoice.invoice_date <= date_to,
        )
        .count()
    )

    if count == 0:
        raise HTTPException(
            status_code=400,
            detail="Keine kategorisierten Rechnungen im angegebenen Zeitraum",
        )

    arq_pool = getattr(request.app.state, "arq_pool", None)
    await enqueue_email(
        arq_pool,
        "datev_export",
        to_email=org.steuerberater_email,
        from_month=body.from_month,
        to_month=body.to_month,
        invoice_count=count,
    )

    return {
        "message": "E-Mail an Steuerberater wird versendet",
        "to": org.steuerberater_email,
    }
