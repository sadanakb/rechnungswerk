"""Mahnwesen (dunning) schemas."""
from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class MahnungResponse(BaseModel):
    mahnung_id: str
    invoice_id: str
    level: int
    fee: float
    interest: float
    total_due: float
    status: str
    sent_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class MahnungStatusUpdate(BaseModel):
    status: str  # "paid" or "cancelled"


class OverdueInvoiceResponse(BaseModel):
    invoice_id: str
    invoice_number: str
    buyer_name: str
    gross_amount: float
    due_date: str
    days_overdue: int
    mahnung_count: int
