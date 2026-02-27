"""
Pydantic schemas for request/response validation
"""
from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import List, Optional
from datetime import date, datetime
import re


class LineItem(BaseModel):
    """Single invoice line item"""
    description: str
    quantity: float = Field(gt=0)
    unit_price: float
    net_amount: float
    tax_rate: float = 19.0


class InvoiceCreate(BaseModel):
    """Schema for creating invoice manually"""
    invoice_number: str
    invoice_date: date
    due_date: Optional[date] = None

    seller_name: str
    seller_vat_id: str
    seller_address: str

    buyer_name: str
    buyer_vat_id: str = ""
    buyer_address: str

    line_items: List[LineItem]

    tax_rate: float = 19.0

    # Payment details (BG-16)
    iban: Optional[str] = None
    bic: Optional[str] = None
    payment_account_name: Optional[str] = None

    # Currency
    currency: str = "EUR"

    # Routing & Reference
    buyer_reference: Optional[str] = None
    seller_endpoint_id: Optional[str] = None
    seller_endpoint_scheme: Optional[str] = "EM"
    buyer_endpoint_id: Optional[str] = None
    buyer_endpoint_scheme: Optional[str] = "EM"

    @field_validator("iban")
    @classmethod
    def validate_iban(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v.strip() == "":
            return None
        cleaned = re.sub(r"\s+", "", v).upper()
        if not re.match(r"^[A-Z]{2}[0-9]{2}[A-Z0-9]{4,30}$", cleaned):
            raise ValueError("Ungültiges IBAN-Format")
        return cleaned

    @field_validator("bic")
    @classmethod
    def validate_bic(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v.strip() == "":
            return None
        cleaned = v.strip().upper()
        if not re.match(r"^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$", cleaned):
            raise ValueError("Ungültiges BIC-Format")
        return cleaned


class InvoiceResponse(BaseModel):
    """Response schema for invoice"""
    id: int
    invoice_id: str
    invoice_number: str
    invoice_date: date
    due_date: Optional[date]

    seller_name: str
    buyer_name: str

    net_amount: float
    tax_amount: float
    gross_amount: float

    # Payment details (BG-16)
    iban: Optional[str] = None
    bic: Optional[str] = None
    payment_account_name: Optional[str] = None

    # Routing & Reference
    buyer_reference: Optional[str] = None
    seller_endpoint_id: Optional[str] = None
    seller_endpoint_scheme: Optional[str] = None
    buyer_endpoint_id: Optional[str] = None
    buyer_endpoint_scheme: Optional[str] = None

    source_type: str
    ocr_confidence: Optional[float]
    validation_status: str

    xrechnung_available: bool = False
    zugferd_available: bool = False

    # Payment status lifecycle
    payment_status: str = "unpaid"
    paid_date: Optional[date] = None
    payment_method: Optional[str] = None
    payment_reference: Optional[str] = None

    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class InvoiceDetailResponse(InvoiceResponse):
    """Extended response schema for single invoice detail view — includes all fields."""
    seller_vat_id: Optional[str] = None
    seller_address: Optional[str] = None
    buyer_vat_id: Optional[str] = None
    buyer_address: Optional[str] = None
    tax_rate: Optional[float] = None
    currency: str = "EUR"
    line_items: Optional[List[dict]] = None
    validation_errors: Optional[List[dict]] = None
    org_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    @classmethod
    def from_orm_with_extras(cls, invoice) -> "InvoiceDetailResponse":
        """Build response from ORM object, parsing JSON fields as needed."""
        data = {
            "id": invoice.id,
            "invoice_id": invoice.invoice_id,
            "invoice_number": invoice.invoice_number,
            "invoice_date": invoice.invoice_date,
            "due_date": invoice.due_date,
            "seller_name": invoice.seller_name,
            "seller_vat_id": invoice.seller_vat_id,
            "seller_address": invoice.seller_address,
            "buyer_name": invoice.buyer_name,
            "buyer_vat_id": invoice.buyer_vat_id,
            "buyer_address": invoice.buyer_address,
            "net_amount": float(invoice.net_amount) if invoice.net_amount is not None else 0.0,
            "tax_amount": float(invoice.tax_amount) if invoice.tax_amount is not None else 0.0,
            "gross_amount": float(invoice.gross_amount) if invoice.gross_amount is not None else 0.0,
            "tax_rate": float(invoice.tax_rate) if invoice.tax_rate is not None else None,
            "currency": invoice.currency or "EUR",
            "iban": invoice.iban,
            "bic": invoice.bic,
            "payment_account_name": invoice.payment_account_name,
            "buyer_reference": invoice.buyer_reference,
            "seller_endpoint_id": invoice.seller_endpoint_id,
            "seller_endpoint_scheme": invoice.seller_endpoint_scheme,
            "buyer_endpoint_id": invoice.buyer_endpoint_id,
            "buyer_endpoint_scheme": invoice.buyer_endpoint_scheme,
            "line_items": invoice.line_items if isinstance(invoice.line_items, list) else [],
            "validation_errors": invoice.validation_errors if isinstance(invoice.validation_errors, list) else [],
            "source_type": invoice.source_type,
            "ocr_confidence": invoice.ocr_confidence,
            "validation_status": invoice.validation_status,
            "xrechnung_available": bool(invoice.xrechnung_xml_path),
            "zugferd_available": bool(invoice.zugferd_pdf_path),
            "payment_status": invoice.payment_status or "unpaid",
            "paid_date": invoice.paid_date,
            "payment_method": invoice.payment_method,
            "payment_reference": invoice.payment_reference,
            "created_at": invoice.created_at,
            "org_id": invoice.organization_id,
        }
        return cls(**data)


class InvoiceListResponse(BaseModel):
    """Paginated invoice list"""
    items: List[InvoiceResponse]
    total: int
    skip: int
    limit: int


class OCRResult(BaseModel):
    """Result from OCR processing"""
    invoice_id: str
    extracted_text: str
    confidence: float
    fields: dict
    suggestions: dict  # Suggested values for fields
    field_confidences: dict = {}  # Per-field confidence scores
    consistency_checks: List[dict] = []  # Mathematical consistency checks
    completeness: float = 0.0  # Percentage of core fields filled
    source: str = ""  # Engine used: ollama-text, ollama-vision, tesseract
    total_pages: int = 1
    ocr_engine: str = ""  # paddleocr or tesseract


class BatchFileResult(BaseModel):
    """Result for a single file in a batch."""
    filename: str
    status: str
    invoice_id: Optional[str] = None
    fields: dict = {}
    confidence: float = 0.0
    field_confidences: dict = {}
    error: Optional[str] = None
    source: str = ""


class BatchJobResponse(BaseModel):
    """Batch processing job status."""
    batch_id: str
    total_files: int
    processed: int
    succeeded: int
    failed: int
    status: str
    progress_percent: float
    results: List[BatchFileResult]
    created_at: str
    completed_at: Optional[str] = None


class ValidationRequest(BaseModel):
    """Request for XRechnung validation"""
    xml_content: str


class ValidationResponse(BaseModel):
    """KoSIT validation result"""
    validation_id: str
    is_valid: bool
    error_count: int
    warning_count: int
    errors: List[dict]
    warnings: List[dict]
    report_html: Optional[str]


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    database: str
    tesseract_installed: bool
    tesseract_version: Optional[str] = None
    kosit_validator: str
    total_invoices: int
    xrechnung_version: Optional[str] = "3.0.2"
    ollama_available: bool = False
    ollama_primary_model: str = "qwen2.5:14b"
    ollama_vision_model: str = "gemma3:latest"
    ocr_engine: str = "tesseract"
