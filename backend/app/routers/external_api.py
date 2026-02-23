"""
Versionierte externe API für RechnungsWerk (v1).

Stellt eine öffentliche REST-API bereit, über die externe Systeme
(ERP, Buchhaltungssoftware, etc.) Rechnungen abrufen, XRechnung-XML
generieren und validieren können.

Alle Endpoints sind per API-Key geschützt.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.auth import verify_api_key
from app.database import get_db
from app.models import Invoice
from app.xrechnung_generator import XRechnungGenerator
from app.kosit_validator import KoSITValidator

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1",
    tags=["External API v1"],
    dependencies=[Depends(verify_api_key)],
)

# Service-Instanzen
xrechnung_gen = XRechnungGenerator()
kosit_validator = KoSITValidator()


# ------------------------------------------------------------------
# Request/Response-Schemas
# ------------------------------------------------------------------

class LineItemSchema(BaseModel):
    """Einzelne Rechnungsposition."""
    description: str
    quantity: float = Field(gt=0)
    unit_price: float
    net_amount: float
    tax_rate: float = 19.0


class ConvertRequest(BaseModel):
    """Eingabedaten für die XRechnung-Konvertierung."""
    invoice_number: str
    invoice_date: str  # ISO-Format: YYYY-MM-DD
    due_date: Optional[str] = None

    seller_name: str
    seller_vat_id: str
    seller_address: str

    buyer_name: str
    buyer_vat_id: str = ""
    buyer_address: str

    net_amount: float
    tax_amount: float
    gross_amount: float
    tax_rate: float = 19.0
    currency: str = "EUR"

    line_items: list[LineItemSchema] = []

    # EN 16931 Pflichtfelder
    iban: Optional[str] = None
    bic: Optional[str] = None
    payment_account_name: Optional[str] = None
    buyer_reference: Optional[str] = None
    seller_endpoint_id: Optional[str] = None
    seller_endpoint_scheme: Optional[str] = "EM"
    buyer_endpoint_id: Optional[str] = None
    buyer_endpoint_scheme: Optional[str] = "EM"


class ConvertResponse(BaseModel):
    """Antwort der XRechnung-Konvertierung."""
    success: bool
    xml_content: str
    invoice_number: str
    message: str


class ValidateRequest(BaseModel):
    """Eingabedaten für die XML-Validierung."""
    xml_content: str


class ValidateResponse(BaseModel):
    """Antwort der XML-Validierung."""
    validation_id: str
    is_valid: bool
    error_count: int
    warning_count: int
    errors: list[dict]
    warnings: list[dict]
    validator: str
    message: str


class InvoiceOut(BaseModel):
    """Rechnungsdaten für die externe API."""
    id: int
    invoice_id: str
    invoice_number: str
    invoice_date: Optional[str] = None
    due_date: Optional[str] = None

    seller_name: Optional[str] = None
    buyer_name: Optional[str] = None

    net_amount: Optional[float] = None
    tax_amount: Optional[float] = None
    gross_amount: Optional[float] = None
    currency: Optional[str] = "EUR"

    source_type: Optional[str] = None
    validation_status: Optional[str] = None
    xrechnung_available: bool = False
    zugferd_available: bool = False

    created_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class InvoiceListOut(BaseModel):
    """Paginierte Rechnungsliste."""
    items: list[InvoiceOut]
    total: int
    skip: int
    limit: int


class ErrorResponse(BaseModel):
    """Standard-Fehlerantwort."""
    error: str
    detail: str


# ------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------

@router.get(
    "/invoices",
    response_model=InvoiceListOut,
    summary="Rechnungen auflisten",
    responses={
        401: {"model": ErrorResponse, "description": "API-Key fehlt"},
        403: {"model": ErrorResponse, "description": "Ungültiger API-Key"},
    },
)
async def list_invoices(
    skip: int = Query(default=0, ge=0, description="Anzahl zu überspringender Einträge"),
    limit: int = Query(default=50, ge=1, le=200, description="Maximale Anzahl (1–200)"),
    db: Session = Depends(get_db),
):
    """Gibt eine paginierte Liste aller Rechnungen zurück."""
    total = db.query(Invoice).count()
    invoices = db.query(Invoice).offset(skip).limit(limit).all()

    items = []
    for inv in invoices:
        items.append(InvoiceOut(
            id=inv.id,
            invoice_id=inv.invoice_id,
            invoice_number=inv.invoice_number or "",
            invoice_date=str(inv.invoice_date) if inv.invoice_date else None,
            due_date=str(inv.due_date) if inv.due_date else None,
            seller_name=inv.seller_name,
            buyer_name=inv.buyer_name,
            net_amount=float(inv.net_amount) if inv.net_amount is not None else None,
            tax_amount=float(inv.tax_amount) if inv.tax_amount is not None else None,
            gross_amount=float(inv.gross_amount) if inv.gross_amount is not None else None,
            currency=getattr(inv, "currency", "EUR") or "EUR",
            source_type=inv.source_type,
            validation_status=inv.validation_status,
            xrechnung_available=inv.xrechnung_available,
            zugferd_available=inv.zugferd_available,
            created_at=str(inv.created_at) if inv.created_at else None,
        ))

    return InvoiceListOut(items=items, total=total, skip=skip, limit=limit)


@router.get(
    "/invoices/{invoice_id}",
    response_model=InvoiceOut,
    summary="Einzelne Rechnung abrufen",
    responses={
        404: {"model": ErrorResponse, "description": "Rechnung nicht gefunden"},
    },
)
async def get_invoice(
    invoice_id: str = Path(..., description="Eindeutige Rechnungs-ID (z. B. INV-20260223-abc12345)"),
    db: Session = Depends(get_db),
):
    """Gibt die Daten einer einzelnen Rechnung zurück."""
    invoice = db.query(Invoice).filter(Invoice.invoice_id == invoice_id).first()
    if not invoice:
        raise HTTPException(
            status_code=404,
            detail=f"Rechnung mit ID '{invoice_id}' nicht gefunden.",
        )

    return InvoiceOut(
        id=invoice.id,
        invoice_id=invoice.invoice_id,
        invoice_number=invoice.invoice_number or "",
        invoice_date=str(invoice.invoice_date) if invoice.invoice_date else None,
        due_date=str(invoice.due_date) if invoice.due_date else None,
        seller_name=invoice.seller_name,
        buyer_name=invoice.buyer_name,
        net_amount=float(invoice.net_amount) if invoice.net_amount is not None else None,
        tax_amount=float(invoice.tax_amount) if invoice.tax_amount is not None else None,
        gross_amount=float(invoice.gross_amount) if invoice.gross_amount is not None else None,
        currency=getattr(invoice, "currency", "EUR") or "EUR",
        source_type=invoice.source_type,
        validation_status=invoice.validation_status,
        xrechnung_available=invoice.xrechnung_available,
        zugferd_available=invoice.zugferd_available,
        created_at=str(invoice.created_at) if invoice.created_at else None,
    )


@router.post(
    "/convert",
    response_model=ConvertResponse,
    summary="Rechnungsdaten in XRechnung-XML konvertieren",
    responses={
        400: {"model": ErrorResponse, "description": "Ungültige Eingabedaten"},
        422: {"model": ErrorResponse, "description": "Validierungsfehler in den Rechnungsdaten"},
    },
)
async def convert_to_xrechnung(request: ConvertRequest):
    """Nimmt Rechnungsdaten als JSON entgegen und gibt XRechnung-konformes UBL-XML zurück.

    Die Konvertierung erfolgt nach EN 16931 / XRechnung 3.0.2.
    Es wird kein Datensatz in der Datenbank angelegt.
    """
    # Rechnungsdaten für den Generator aufbereiten
    invoice_data = {
        "invoice_number": request.invoice_number,
        "invoice_date": request.invoice_date,
        "due_date": request.due_date,
        "seller_name": request.seller_name,
        "seller_vat_id": request.seller_vat_id,
        "seller_address": request.seller_address,
        "buyer_name": request.buyer_name,
        "buyer_vat_id": request.buyer_vat_id,
        "buyer_address": request.buyer_address,
        "net_amount": request.net_amount,
        "tax_amount": request.tax_amount,
        "gross_amount": request.gross_amount,
        "tax_rate": request.tax_rate,
        "currency": request.currency,
        "line_items": [item.model_dump() for item in request.line_items] if request.line_items else [],
        "iban": request.iban,
        "bic": request.bic,
        "payment_account_name": request.payment_account_name,
        "buyer_reference": request.buyer_reference,
        "seller_endpoint_id": request.seller_endpoint_id,
        "seller_endpoint_scheme": request.seller_endpoint_scheme,
        "buyer_endpoint_id": request.buyer_endpoint_id,
        "buyer_endpoint_scheme": request.buyer_endpoint_scheme,
    }

    try:
        xml_content = xrechnung_gen.generate_xml(invoice_data)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"XRechnung-Generierung fehlgeschlagen: {exc}",
        )
    except Exception as exc:
        logger.error("Unerwarteter Fehler bei XRechnung-Generierung: %s", exc)
        raise HTTPException(
            status_code=500,
            detail="Interner Fehler bei der XML-Generierung. Bitte versuchen Sie es erneut.",
        )

    return ConvertResponse(
        success=True,
        xml_content=xml_content,
        invoice_number=request.invoice_number,
        message="XRechnung-XML erfolgreich generiert (EN 16931 / XRechnung 3.0.2)",
    )


@router.post(
    "/validate",
    response_model=ValidateResponse,
    summary="XRechnung-XML validieren",
    responses={
        400: {"model": ErrorResponse, "description": "Kein XML-Inhalt übergeben"},
        500: {"model": ErrorResponse, "description": "Validierung fehlgeschlagen"},
    },
)
async def validate_xrechnung(request: ValidateRequest):
    """Validiert ein XRechnung-XML gegen die KoSIT-Regeln.

    Nutzt bevorzugt den Docker-basierten KoSIT-Validator.
    Bei Nicht-Verfügbarkeit wird eine lokale Strukturprüfung durchgeführt.
    """
    if not request.xml_content or not request.xml_content.strip():
        raise HTTPException(
            status_code=400,
            detail="XML-Inhalt darf nicht leer sein.",
        )

    try:
        result = await kosit_validator.validate(request.xml_content)
    except Exception as exc:
        logger.error("Validierung fehlgeschlagen: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Validierung fehlgeschlagen: {exc}",
        )

    is_valid = result.get("is_valid", False)
    message = "XML ist XRechnung-konform." if is_valid else "XML enthält Validierungsfehler."

    return ValidateResponse(
        validation_id=result.get("validation_id", ""),
        is_valid=is_valid,
        error_count=result.get("error_count", 0),
        warning_count=result.get("warning_count", 0),
        errors=result.get("errors", []),
        warnings=result.get("warnings", []),
        validator=result.get("validator", "unknown"),
        message=message,
    )
