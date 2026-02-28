"""AI endpoints — categorization and monthly summary."""
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.auth_jwt import get_current_user
from app.database import get_db
from app.models import Invoice, OrganizationMember
from app.ai_service import categorize_invoice, generate_monthly_summary

logger = logging.getLogger(__name__)
router = APIRouter()


def _resolve_org_id(current_user: dict, db: Session) -> int:
    """Resolve organization_id from the current user. Raises 403 if not found."""
    user_id = current_user.get("user_id")
    if user_id is None:
        raise HTTPException(status_code=403, detail="Keine Organisation gefunden")

    # In dev mode user_id may be the string "dev-user" — convert gracefully
    try:
        uid = int(user_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=403, detail="Keine Organisation gefunden")

    member = db.query(OrganizationMember).filter(
        OrganizationMember.user_id == uid
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="Keine Organisation gefunden")
    return member.organization_id


class CategorizeRequest(BaseModel):
    invoice_id: str


class CategorizeResponse(BaseModel):
    invoice_id: str
    skr03_account: str
    category: str


@router.post("/categorize", response_model=CategorizeResponse)
async def categorize_invoice_endpoint(
    body: CategorizeRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Manually trigger AI categorization for an invoice."""
    org_id = _resolve_org_id(current_user, db)
    invoice = db.query(Invoice).filter(
        Invoice.invoice_id == body.invoice_id,
        Invoice.organization_id == org_id,
    ).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")

    description = " ".join([
        li.get("description", "") for li in (invoice.line_items or [])
    ]) or invoice.invoice_number or invoice.invoice_id or ""

    result = categorize_invoice(
        seller_name=invoice.seller_name or "",
        description=description,
        amount=float(invoice.gross_amount or 0),
    )

    invoice.skr03_account = result.get("skr03_account", "4900")
    invoice.ai_category = result.get("category", "Sonstige")
    invoice.ai_categorized_at = datetime.utcnow()
    db.commit()

    return CategorizeResponse(
        invoice_id=invoice.invoice_id,
        skr03_account=invoice.skr03_account,
        category=invoice.ai_category,
    )


@router.get("/monthly-summary")
async def get_monthly_summary(
    month: Optional[str] = None,  # Format: "2026-02"
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get AI-generated monthly invoice summary. Cached in Redis for 24h."""
    org_id = _resolve_org_id(current_user, db)

    # Determine month
    if month:
        try:
            parts = month.split("-")
            year, mo = int(parts[0]), int(parts[1])
        except Exception:
            raise HTTPException(status_code=422, detail="month format must be YYYY-MM")
    else:
        now = datetime.utcnow()
        year, mo = now.year, now.month

    month_key = f"{year}-{mo:02d}"

    # Check Redis cache
    arq_pool = getattr(request.app.state if request else None, "arq_pool", None)
    redis_key = f"ai_summary:{org_id}:{month_key}"
    cached = None
    if arq_pool:
        try:
            cached = await arq_pool._pool.get(redis_key)
        except Exception:
            pass
    if cached:
        return {
            "month": month_key,
            "summary": cached.decode() if isinstance(cached, bytes) else cached,
            "cached": True,
        }

    # Aggregate data from DB
    invoices = db.query(Invoice).filter(
        Invoice.organization_id == org_id,
        func.strftime("%Y-%m", Invoice.invoice_date) == month_key,
    ).all()

    if not invoices:
        return {
            "month": month_key,
            "summary": f"Im {month_key} wurden keine Rechnungen gefunden.",
            "cached": False,
        }

    gross_total = sum(float(inv.gross_amount or 0) for inv in invoices)
    open_invoices = [inv for inv in invoices if inv.payment_status in ("unpaid", "open", None)]
    paid_invoices = [inv for inv in invoices if inv.payment_status == "paid"]
    overdue_invoices = [inv for inv in invoices if inv.payment_status == "overdue"]
    open_total = sum(float(inv.gross_amount or 0) for inv in open_invoices)

    # Top customer by gross amount
    customer_totals: dict = {}
    for inv in invoices:
        name = inv.buyer_name or "Unbekannt"
        customer_totals[name] = customer_totals.get(name, 0) + float(inv.gross_amount or 0)
    top_customer = max(customer_totals, key=lambda k: customer_totals[k]) if customer_totals else "Unbekannt"

    # Previous month comparison
    prev_mo = mo - 1 if mo > 1 else 12
    prev_year = year if mo > 1 else year - 1
    prev_month_key = f"{prev_year}-{prev_mo:02d}"
    prev_invoices = db.query(Invoice).filter(
        Invoice.organization_id == org_id,
        func.strftime("%Y-%m", Invoice.invoice_date) == prev_month_key,
    ).all()
    prev_total = sum(float(inv.gross_amount or 0) for inv in prev_invoices)
    prev_change = ((gross_total - prev_total) / prev_total * 100) if prev_total > 0 else 0.0

    MONTH_NAMES_DE = {
        1: "Januar", 2: "Februar", 3: "März", 4: "April",
        5: "Mai", 6: "Juni", 7: "Juli", 8: "August",
        9: "September", 10: "Oktober", 11: "November", 12: "Dezember",
    }

    summary_text = generate_monthly_summary(
        month_name=MONTH_NAMES_DE[mo],
        invoice_count=len(invoices),
        gross_total=gross_total,
        open_count=len(open_invoices),
        open_total=open_total,
        paid_count=len(paid_invoices),
        overdue_count=len(overdue_invoices),
        top_customer=top_customer,
        prev_month_change=prev_change,
    )

    # Store in Redis cache (24h TTL)
    if arq_pool:
        try:
            await arq_pool._pool.set(redis_key, summary_text, ex=86400)
        except Exception:
            pass

    return {"month": month_key, "summary": summary_text, "cached": False}
