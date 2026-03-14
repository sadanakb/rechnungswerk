"""AI-powered invoice features router.

Endpoints
---------
POST /api/ai/draft-invoice
    Extract structured invoice fields from free-form German text using GPT-4o Mini.

POST /api/ai/generate-reminder
    Generate a German payment reminder email (subject + body) for an overdue invoice.

POST /api/ai/suggest-line-item
    Autocomplete line-item descriptions: first from invoice history (all plans),
    then via AI (Starter / Professional only).
"""
import time
from datetime import date
from typing import Dict, List, Optional
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.ai_client import get_ai_client, get_model_name
from app.auth_jwt import get_current_user
from app.config import settings
from app.database import get_db
from app.models import Contact, Invoice, Organization, OrganizationMember
from app.rate_limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# In-memory rate-limit bucket for AI suggest calls (per user, 10 calls / 10 min)
# ---------------------------------------------------------------------------
_suggest_rate: Dict[str, List[float]] = {}
_SUGGEST_MAX_CALLS = 10
_SUGGEST_WINDOW_SECONDS = 600  # 10 minutes


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_org_plan(db: Session, user_id: int) -> tuple[Optional[Organization], str]:
    """Return (org, plan_str) for the given user_id."""
    member = db.query(OrganizationMember).filter(
        OrganizationMember.user_id == user_id
    ).first()
    if not member:
        return None, "free"
    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    plan = org.plan if org else "free"
    return org, plan


def _require_ai_features(db: Session, user_id: int, org_id: int) -> None:
    """Raise 403 when the organisation's plan does not include AI features.

    In self-hosted mode (cloud_mode=False) all features are always available.
    """
    if not settings.cloud_mode:
        return

    _, plan = _get_org_plan(db, user_id)
    if plan == "free":
        raise HTTPException(
            status_code=403,
            detail="AI-Features sind ab dem Starter-Plan verfügbar.",
        )


def _check_suggest_rate(user_id: str) -> bool:
    """Return True when the user is within the AI-suggest rate limit.

    Allows up to ``_SUGGEST_MAX_CALLS`` AI calls per user within
    ``_SUGGEST_WINDOW_SECONDS``.  Uses a simple sliding-window list.
    """
    now = time.monotonic()
    window_start = now - _SUGGEST_WINDOW_SECONDS
    timestamps = _suggest_rate.get(user_id, [])
    # Evict stale entries
    timestamps = [t for t in timestamps if t > window_start]
    if len(timestamps) >= _SUGGEST_MAX_CALLS:
        _suggest_rate[user_id] = timestamps
        return False
    timestamps.append(now)
    _suggest_rate[user_id] = timestamps
    return True


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class DraftInvoiceRequest(BaseModel):
    text: str


class LineItemDraft(BaseModel):
    description: str
    quantity: float
    unit: str = "Stück"
    unit_price: float


class DraftInvoiceResponse(BaseModel):
    buyer_name: Optional[str] = None
    buyer_id: Optional[str] = None
    line_items: List[LineItemDraft] = []
    tax_rate: float = 19.0
    payment_terms_days: int = 30
    currency: str = "EUR"
    notes: Optional[str] = None


class ReminderRequest(BaseModel):
    invoice_id: str
    tone: str = "freundlich"  # "freundlich" | "bestimmt" | "formell"


class ReminderResponse(BaseModel):
    subject: str
    body: str


class SuggestRequest(BaseModel):
    description_prefix: str
    buyer_id: Optional[str] = None


class Suggestion(BaseModel):
    description: str
    unit_price: float
    unit: str = "Stück"
    tax_rate: float = 19.0
    source: str  # "history" or "ai"


class SuggestResponse(BaseModel):
    suggestions: List[Suggestion] = []


# ---------------------------------------------------------------------------
# System prompts
# ---------------------------------------------------------------------------

_DRAFT_SYSTEM_PROMPT = """\
Du bist ein Assistent für deutsche Rechnungserstellung.
Extrahiere aus dem Text alle Rechnungsfelder. Antworte NUR mit validem JSON, keine Erklärungen.

JSON-Schema:
{
  "buyer_name": "string oder null",
  "line_items": [{"description": "string", "quantity": number, "unit": "string", "unit_price": number}],
  "tax_rate": number,
  "payment_terms_days": number,
  "currency": "EUR",
  "notes": "string oder null"
}

Regeln:
- Wenn kein Steuersatz genannt: 19
- Wenn kein Zahlungsziel genannt: 30
- Wenn keine Einheit genannt: "Stück"
- Immer EUR wenn nicht anders angegeben
- Beträge als Zahlen ohne Währungszeichen\
"""

_REMINDER_SYSTEM_PROMPT = """\
Du bist ein deutscher Geschäftskorrespondenz-Assistent.
Erstelle eine Zahlungserinnerung auf Deutsch.

Regeln:
- Verwende die Sie-Form
- Nenne den konkreten Betrag und die Rechnungsnummer
- Maximal 120 Wörter
- Kein Betreff mit "Mahnung" bei freundlichem Ton
- Antworte als JSON: {"subject": "...", "body": "..."}

Ton-Varianten:
- freundlich: Warmherzig, verständnisvoll, keine Drohung
- bestimmt: Klar, direkt, mit konkreter Frist (7 Tage)
- formell: Sachlich, geschäftsmäßig, Hinweis auf Verzug\
"""

_SUGGEST_SYSTEM_PROMPT = """\
Gib 1-2 Vorschläge für Rechnungspositionen. \
JSON-Array: [{"description": "...", "unit_price": number, "unit": "Stunden/Tage/Stück/Pauschal", "tax_rate": 19}]\
"""


# ---------------------------------------------------------------------------
# Endpoint 1: POST /draft-invoice
# ---------------------------------------------------------------------------

@router.post("/draft-invoice", response_model=DraftInvoiceResponse)
@limiter.limit("30/hour")
async def draft_invoice(
    request: Request,
    body: DraftInvoiceRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DraftInvoiceResponse:
    """Extract structured invoice fields from free-form German text.

    Requires Starter plan or higher (or self-hosted mode).

    Args:
        request: FastAPI request (required by slowapi).
        body: Request body containing the free-form ``text``.
        current_user: Injected JWT payload.
        db: Database session.

    Returns:
        DraftInvoiceResponse with extracted fields and optional contact match.

    Raises:
        HTTPException 403: Plan does not include AI features.
        HTTPException 422: Input validation failure or AI parse error.
        HTTPException 503: AI service not configured.
    """
    org_id: int = current_user["org_id"]
    user_id: int = int(current_user["user_id"])

    _require_ai_features(db, user_id, org_id)

    text = body.text
    if not text.strip():
        raise HTTPException(status_code=422, detail="Text darf nicht leer sein")
    if len(text) > 2000:
        raise HTTPException(status_code=422, detail="Text zu lang (max. 2000 Zeichen)")

    client, _ = get_ai_client()
    if client is None:
        raise HTTPException(status_code=503, detail="AI-Service nicht konfiguriert")

    try:
        completion = client.chat.completions.create(
            model=get_model_name("mini"),
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": _DRAFT_SYSTEM_PROMPT},
                {"role": "user", "content": text},
            ],
            temperature=0.2,
        )
        raw_json = completion.choices[0].message.content or "{}"
        data = json.loads(raw_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # Normalise line_items
    raw_items = data.get("line_items") or []
    line_items: List[LineItemDraft] = []
    for item in raw_items:
        try:
            line_items.append(
                LineItemDraft(
                    description=str(item.get("description", "")),
                    quantity=float(item.get("quantity", 1)),
                    unit=str(item.get("unit", "Stück")),
                    unit_price=float(item.get("unit_price", 0)),
                )
            )
        except (ValueError, TypeError):
            continue

    buyer_name: Optional[str] = data.get("buyer_name") or None
    buyer_id: Optional[str] = None

    # Contact matching — ILIKE lookup by name within the organisation
    if buyer_name:
        contact = (
            db.query(Contact)
            .filter(
                Contact.org_id == org_id,
                Contact.name.ilike(f"%{buyer_name}%"),
            )
            .first()
        )
        if contact:
            buyer_id = str(contact.id)

    return DraftInvoiceResponse(
        buyer_name=buyer_name,
        buyer_id=buyer_id,
        line_items=line_items,
        tax_rate=float(data.get("tax_rate") or 19.0),
        payment_terms_days=int(data.get("payment_terms_days") or 30),
        currency=str(data.get("currency") or "EUR"),
        notes=data.get("notes") or None,
    )


# ---------------------------------------------------------------------------
# Endpoint 2: POST /generate-reminder
# ---------------------------------------------------------------------------

@router.post("/generate-reminder", response_model=ReminderResponse)
@limiter.limit("20/hour")
async def generate_reminder(
    request: Request,
    body: ReminderRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ReminderResponse:
    """Generate a German payment reminder email for an overdue invoice.

    Requires Starter plan or higher (or self-hosted mode).

    Args:
        request: FastAPI request (required by slowapi).
        body: ``invoice_id`` (string ID) and ``tone`` of the reminder.
        current_user: Injected JWT payload.
        db: Database session.

    Returns:
        ReminderResponse with ``subject`` and ``body`` strings.

    Raises:
        HTTPException 403: Plan does not include AI features.
        HTTPException 404: Invoice not found in this organisation.
        HTTPException 422: AI response could not be parsed.
        HTTPException 503: AI service not configured.
    """
    org_id: int = current_user["org_id"]
    user_id: int = int(current_user["user_id"])

    _require_ai_features(db, user_id, org_id)

    invoice = (
        db.query(Invoice)
        .filter(
            Invoice.invoice_id == body.invoice_id,
            Invoice.organization_id == org_id,
        )
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")

    # Attempt contact lookup for a personalised greeting
    contact_name: str = invoice.buyer_name or "Kunde"
    if invoice.buyer_name:
        contact = (
            db.query(Contact)
            .filter(
                Contact.org_id == org_id,
                Contact.name.ilike(f"%{invoice.buyer_name}%"),
            )
            .first()
        )
        if contact:
            contact_name = contact.name

    days_overdue: int = 0
    if invoice.due_date:
        days_overdue = (date.today() - invoice.due_date).days

    client, _ = get_ai_client()
    if client is None:
        raise HTTPException(status_code=503, detail="AI-Service nicht konfiguriert")

    user_prompt = (
        f"Rechnung: {invoice.invoice_number or invoice.invoice_id}\n"
        f"Betrag: {invoice.gross_amount}€\n"
        f"Kunde: {contact_name}\n"
        f"Fälligkeitsdatum: {invoice.due_date}\n"
        f"Überfällig seit: {days_overdue} Tagen\n"
        f"Ton: {body.tone}"
    )

    try:
        completion = client.chat.completions.create(
            model=get_model_name("mini"),
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": _REMINDER_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.4,
        )
        raw_json = completion.choices[0].message.content or "{}"
        data = json.loads(raw_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    subject = str(data.get("subject") or "Zahlungserinnerung")
    body_text = str(data.get("body") or "")

    return ReminderResponse(subject=subject, body=body_text)


# ---------------------------------------------------------------------------
# Endpoint 3: POST /suggest-line-item
# ---------------------------------------------------------------------------

@router.post("/suggest-line-item", response_model=SuggestResponse)
@limiter.limit("60/minute")
async def suggest_line_item(
    request: Request,
    body: SuggestRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SuggestResponse:
    """Suggest line-item descriptions based on history (all plans) or AI (Starter+).

    Stage 1 — History: Searches the organisation's recent invoices for line items
    whose description contains ``description_prefix`` (case-insensitive).  Returns
    up to 3 deduplicated matches immediately without any AI call.

    Stage 2 — AI fallback: Used only when no history match is found AND
    ``description_prefix`` is at least 5 characters long AND the organisation is on
    Starter or Professional plan.

    Args:
        request: FastAPI request (required by slowapi).
        body: ``description_prefix`` to match/complete, optional ``buyer_id``.
        current_user: Injected JWT payload.
        db: Database session.

    Returns:
        SuggestResponse with a list of Suggestion objects.
    """
    org_id: int = current_user["org_id"]
    user_id: int = int(current_user["user_id"])
    prefix = body.description_prefix

    if len(prefix) < 3:
        return SuggestResponse(suggestions=[])

    # ------------------------------------------------------------------
    # Stage 1: History lookup (available on all plans, no AI)
    # ------------------------------------------------------------------
    recent_invoices = (
        db.query(Invoice)
        .filter(
            Invoice.organization_id == org_id,
            Invoice.payment_status != "cancelled",
        )
        .order_by(Invoice.created_at.desc())
        .limit(50)
        .all()
    )

    seen: dict[str, Suggestion] = {}  # normalised description -> Suggestion
    prefix_lower = prefix.lower()

    for inv in recent_invoices:
        items = inv.line_items
        if not items or not isinstance(items, list):
            continue
        for item in items:
            if not isinstance(item, dict):
                continue
            desc = item.get("description", "")
            if not desc or prefix_lower not in desc.lower():
                continue
            key = desc.lower().strip()
            if key not in seen:
                try:
                    seen[key] = Suggestion(
                        description=desc,
                        unit_price=float(item.get("unit_price", 0)),
                        unit=str(item.get("unit", "Stück")),
                        tax_rate=float(item.get("tax_rate", 19.0)),
                        source="history",
                    )
                except (ValueError, TypeError):
                    continue
            if len(seen) >= 3:
                break
        if len(seen) >= 3:
            break

    if seen:
        return SuggestResponse(suggestions=list(seen.values()))

    # ------------------------------------------------------------------
    # Stage 2: AI fallback — only when prefix is long enough
    # ------------------------------------------------------------------
    if len(prefix) < 5:
        return SuggestResponse(suggestions=[])

    # Plan check (AI only for Starter+)
    _, plan = _get_org_plan(db, user_id)
    if plan == "free" or not settings.cloud_mode is False:
        # In self-hosted mode (cloud_mode=False) we allow AI regardless of plan.
        # In cloud mode, free plan gets no AI.
        if settings.cloud_mode and plan == "free":
            return SuggestResponse(suggestions=[])

    client, _ = get_ai_client()
    if client is None:
        return SuggestResponse(suggestions=[])

    # Per-user in-memory rate limit for AI suggest calls
    if not _check_suggest_rate(str(user_id)):
        logger.info("suggest_line_item: AI rate limit reached for user %s", user_id)
        return SuggestResponse(suggestions=[])

    user_prompt = f"Rechnungsposition beginnt mit: \"{prefix}\""

    try:
        completion = client.chat.completions.create(
            model=get_model_name("mini"),
            messages=[
                {"role": "system", "content": _SUGGEST_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            timeout=3.0,
        )
        raw = completion.choices[0].message.content or "[]"
        # Response may be a JSON array or a JSON object wrapping an array
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            # Some models wrap the array in a key
            for val in parsed.values():
                if isinstance(val, list):
                    parsed = val
                    break
            else:
                parsed = []
    except (json.JSONDecodeError, Exception) as exc:
        logger.warning("suggest_line_item AI call failed: %s", exc)
        return SuggestResponse(suggestions=[])

    suggestions: List[Suggestion] = []
    for item in parsed[:2]:
        if not isinstance(item, dict):
            continue
        try:
            suggestions.append(
                Suggestion(
                    description=str(item.get("description", prefix)),
                    unit_price=float(item.get("unit_price", 0)),
                    unit=str(item.get("unit", "Stück")),
                    tax_rate=float(item.get("tax_rate", 19.0)),
                    source="ai",
                )
            )
        except (ValueError, TypeError):
            continue

    return SuggestResponse(suggestions=suggestions)
