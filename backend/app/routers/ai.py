"""AI endpoints — categorization and monthly summary."""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import extract, func

from app.auth_jwt import get_current_user
from app.database import get_db
from app.models import Invoice, OrganizationMember
from app.ai_service import categorize_invoice, generate_monthly_summary
from app.rate_limiter import limiter

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
@limiter.limit("30/minute")
async def categorize_invoice_endpoint(
    request: Request,
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
    invoice.ai_categorized_at = datetime.now(timezone.utc)
    db.commit()

    return CategorizeResponse(
        invoice_id=invoice.invoice_id,
        skr03_account=invoice.skr03_account,
        category=invoice.ai_category,
    )


@router.get("/monthly-summary")
@limiter.limit("10/minute")
async def get_monthly_summary(
    request: Request,
    month: Optional[str] = None,  # Format: "2026-02"
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
        now = datetime.now(timezone.utc)
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
        extract("year", Invoice.invoice_date) == year,
        extract("month", Invoice.invoice_date) == mo,
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
        extract("year", Invoice.invoice_date) == prev_year,
        extract("month", Invoice.invoice_date) == prev_mo,
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


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


SYSTEM_PROMPT = """Du bist ein hilfreicher Buchhaltungsassistent für das Rechnungstool RechnungsWerk.
Du hilfst dem Nutzer bei Fragen zu seinen Rechnungen, Umsätzen und Buchhaltung.
Antworte immer auf Deutsch, präzise und professionell.
Du hast Zugang zu den Rechnungsdaten des Nutzers über die bereitgestellten Tools."""


@router.post("/chat")
@limiter.limit("20/minute")
async def chat(
    body: ChatRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Streaming chat endpoint using SSE. Supports tool use for DB queries."""
    import json as _json
    from fastapi.responses import StreamingResponse

    org_id = _resolve_org_id(current_user, db)

    # Build tool definitions
    tools = [
        {
            "type": "function",
            "function": {
                "name": "get_invoice_stats",
                "description": "Holt Rechnungsstatistiken: Anzahl, Summen, Status-Verteilung",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "period": {"type": "string", "enum": ["today", "week", "month", "year", "all"]},
                    },
                    "required": ["period"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_overdue_invoices",
                "description": "Listet alle überfälligen Rechnungen auf",
                "parameters": {"type": "object", "properties": {}},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_top_customers",
                "description": "Zeigt die Top-Kunden nach Umsatz",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "limit": {"type": "integer", "default": 5},
                    },
                },
            },
        },
    ]

    def execute_tool(tool_name: str, arguments: dict) -> str:
        """Execute a tool call and return result as string."""
        from datetime import date, timedelta

        if tool_name == "get_invoice_stats":
            period = arguments.get("period", "month")
            query = db.query(Invoice).filter(Invoice.organization_id == org_id)
            today = date.today()
            if period == "today":
                query = query.filter(Invoice.invoice_date == today)
            elif period == "week":
                query = query.filter(Invoice.invoice_date >= today - timedelta(days=7))
            elif period == "month":
                query = query.filter(
                    extract("year", Invoice.invoice_date) == today.year,
                    extract("month", Invoice.invoice_date) == today.month,
                )
            elif period == "year":
                query = query.filter(
                    extract("year", Invoice.invoice_date) == today.year,
                )
            invoices = query.all()
            total = sum(float(inv.gross_amount or 0) for inv in invoices)
            paid = sum(1 for inv in invoices if inv.payment_status == "paid")
            open_inv = sum(1 for inv in invoices if inv.payment_status in ("unpaid", "open", None))
            overdue = sum(1 for inv in invoices if inv.payment_status == "overdue")
            return f"Zeitraum '{period}': {len(invoices)} Rechnungen, Gesamtumsatz {total:.2f} EUR, {paid} bezahlt, {open_inv} offen, {overdue} überfällig"

        elif tool_name == "get_overdue_invoices":
            invoices = db.query(Invoice).filter(
                Invoice.organization_id == org_id,
                Invoice.payment_status == "overdue",
            ).limit(10).all()
            if not invoices:
                return "Keine überfälligen Rechnungen."
            lines = [f"- {inv.invoice_id} ({inv.buyer_name}): {float(inv.gross_amount or 0):.2f} EUR, fällig {inv.due_date}" for inv in invoices]
            return "\n".join(lines)

        elif tool_name == "get_top_customers":
            limit = arguments.get("limit", 5)
            invoices = db.query(Invoice).filter(Invoice.organization_id == org_id).all()
            totals: dict = {}
            for inv in invoices:
                name = inv.buyer_name or "Unbekannt"
                totals[name] = totals.get(name, 0) + float(inv.gross_amount or 0)
            sorted_customers = sorted(totals.items(), key=lambda x: x[1], reverse=True)[:limit]
            lines = [f"{i+1}. {name}: {total:.2f} EUR" for i, (name, total) in enumerate(sorted_customers)]
            return "\n".join(lines) if lines else "Keine Kundendaten vorhanden."

        return f"Unbekanntes Tool: {tool_name}"

    async def stream_response():
        """Generator for SSE streaming."""
        from app.config import settings as app_settings

        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        for msg in body.history[-10:]:  # Max 10 history messages
            messages.append({"role": msg.role, "content": msg.content})
        messages.append({"role": "user", "content": body.message})

        try:
            if app_settings.anthropic_api_key:
                # Use Anthropic streaming with tool use
                from anthropic import Anthropic
                client = Anthropic(api_key=app_settings.anthropic_api_key)

                anthropic_tools = [
                    {
                        "name": t["function"]["name"],
                        "description": t["function"]["description"],
                        "input_schema": t["function"]["parameters"],
                    }
                    for t in tools
                ]

                with client.messages.stream(
                    model="claude-haiku-4-5-20251001",
                    max_tokens=1024,
                    system=SYSTEM_PROMPT,
                    messages=[{"role": m["role"], "content": m["content"]} for m in messages if m["role"] != "system"],
                    tools=anthropic_tools,
                ) as stream:
                    tool_calls_made = []
                    for event in stream:
                        if hasattr(event, "type"):
                            if event.type == "content_block_delta" and hasattr(event.delta, "text"):
                                yield f"data: {_json.dumps({'token': event.delta.text})}\n\n"
                            elif event.type == "content_block_start" and hasattr(event.content_block, "type") and event.content_block.type == "tool_use":
                                tool_calls_made.append(event.content_block)

                    # Execute tool calls if any
                    for tool_call in tool_calls_made:
                        tool_result = execute_tool(tool_call.name, tool_call.input)
                        yield f"data: {_json.dumps({'tool_result': tool_result})}\n\n"

            elif app_settings.openai_api_key:
                # Use OpenAI streaming
                from openai import OpenAI
                client = OpenAI(api_key=app_settings.openai_api_key)

                stream = client.chat.completions.create(
                    model=app_settings.openai_model,
                    messages=messages,
                    tools=tools,
                    stream=True,
                    max_tokens=1024,
                )

                tool_name_buf = ""
                tool_args_buf = ""
                in_tool_call = False

                for chunk in stream:
                    delta = chunk.choices[0].delta if chunk.choices else None
                    if not delta:
                        continue
                    if delta.content:
                        yield f"data: {_json.dumps({'token': delta.content})}\n\n"
                    if delta.tool_calls:
                        in_tool_call = True
                        for tc in delta.tool_calls:
                            if tc.function.name:
                                tool_name_buf += tc.function.name
                            if tc.function.arguments:
                                tool_args_buf += tc.function.arguments

                if in_tool_call and tool_name_buf:
                    try:
                        args = _json.loads(tool_args_buf) if tool_args_buf else {}
                    except Exception:
                        args = {}
                    tool_result = execute_tool(tool_name_buf, args)
                    yield f"data: {_json.dumps({'tool_result': tool_result})}\n\n"
            else:
                yield f"data: {_json.dumps({'token': 'Kein KI-Provider konfiguriert. Bitte OPENAI_API_KEY oder ANTHROPIC_API_KEY setzen.'})}\n\n"

        except Exception as e:
            logger.error("Chat streaming error: %s", e)
            yield f"data: {_json.dumps({'error': str(e)})}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(stream_response(), media_type="text/event-stream")
