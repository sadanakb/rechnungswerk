"""
Pydantic schemas for request/response validation
"""
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import date, datetime


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
    buyer_vat_id: str
    buyer_address: str
    
    line_items: List[LineItem]
    
    tax_rate: float = 19.0


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
    
    source_type: str
    ocr_confidence: Optional[float]
    validation_status: str
    
    xrechnung_xml_path: Optional[str]
    zugferd_pdf_path: Optional[str]
    
    created_at: datetime
    
    class Config:
        from_attributes = True


class OCRResult(BaseModel):
    """Result from OCR processing"""
    invoice_id: str
    extracted_text: str
    confidence: float
    fields: dict
    suggestions: dict  # Suggested values for fields


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
