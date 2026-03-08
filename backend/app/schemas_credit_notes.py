"""Pydantic schemas for Credit Notes (Gutschriften)."""
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import date, datetime


class CreditNoteCreate(BaseModel):
    """Create a Vollgutschrift — only invoice_id and reason needed."""
    original_invoice_id: int
    reason: str


class CreditNoteResponse(BaseModel):
    """List view response for credit notes."""
    id: int
    credit_note_id: str
    credit_note_number: str
    credit_note_date: date
    original_invoice_id: int
    buyer_name: str
    gross_amount: float
    reason: str
    xrechnung_available: bool = False
    zugferd_available: bool = False
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CreditNoteDetailResponse(CreditNoteResponse):
    """Full detail response including all fields."""
    seller_name: str
    seller_vat_id: Optional[str] = None
    seller_address: Optional[str] = None
    buyer_vat_id: Optional[str] = None
    buyer_address: Optional[str] = None
    net_amount: float
    tax_amount: float
    tax_rate: Optional[float] = None
    currency: str = "EUR"
    line_items: Optional[List[dict]] = None
    iban: Optional[str] = None
    bic: Optional[str] = None
    payment_account_name: Optional[str] = None
    buyer_reference: Optional[str] = None
    original_invoice_number: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_orm_with_extras(cls, cn, original_invoice_number: str = "") -> "CreditNoteDetailResponse":
        """Build response from ORM object."""
        data = {
            "id": cn.id,
            "credit_note_id": cn.credit_note_id,
            "credit_note_number": cn.credit_note_number,
            "credit_note_date": cn.credit_note_date,
            "original_invoice_id": cn.original_invoice_id,
            "seller_name": cn.seller_name,
            "seller_vat_id": cn.seller_vat_id,
            "seller_address": cn.seller_address,
            "buyer_name": cn.buyer_name,
            "buyer_vat_id": cn.buyer_vat_id,
            "buyer_address": cn.buyer_address,
            "net_amount": float(cn.net_amount) if cn.net_amount is not None else 0.0,
            "tax_amount": float(cn.tax_amount) if cn.tax_amount is not None else 0.0,
            "gross_amount": float(cn.gross_amount) if cn.gross_amount is not None else 0.0,
            "tax_rate": float(cn.tax_rate) if cn.tax_rate is not None else None,
            "currency": cn.currency or "EUR",
            "line_items": cn.line_items if isinstance(cn.line_items, list) else [],
            "iban": cn.iban,
            "bic": cn.bic,
            "payment_account_name": cn.payment_account_name,
            "buyer_reference": cn.buyer_reference,
            "reason": cn.reason,
            "xrechnung_available": bool(cn.xrechnung_xml_path),
            "zugferd_available": bool(cn.zugferd_pdf_path),
            "created_at": cn.created_at,
            "original_invoice_number": original_invoice_number,
        }
        return cls(**data)


class CreditNoteListResponse(BaseModel):
    """Paginated credit note list."""
    items: List[CreditNoteResponse]
    total: int
    skip: int
    limit: int
