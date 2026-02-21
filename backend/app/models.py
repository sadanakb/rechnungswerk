"""
Database models for RechnungsWerk
"""
from datetime import datetime, timezone

from sqlalchemy import (
    Column, Integer, String, Float, Numeric, Date, DateTime, Text,
    JSON, Boolean, ForeignKey,
)
from sqlalchemy.orm import DeclarativeBase, relationship


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Invoice(Base):
    """Processed invoice entity"""
    __tablename__ = 'invoices'

    id = Column(Integer, primary_key=True)
    invoice_id = Column(String, unique=True, index=True)  # e.g., INV-20260219-abc123

    # Invoice Data (extracted or manual)
    invoice_number = Column(String, index=True)
    invoice_date = Column(Date)
    due_date = Column(Date)

    # Seller Info
    seller_name = Column(String)
    seller_vat_id = Column(String)
    seller_address = Column(Text)

    # Buyer Info
    buyer_name = Column(String)
    buyer_vat_id = Column(String)
    buyer_address = Column(Text)

    # Amounts — Numeric statt Float für cent-genaue Berechnung (H1, EN 16931 BR-CO-15)
    net_amount = Column(Numeric(12, 2))
    tax_amount = Column(Numeric(12, 2))
    gross_amount = Column(Numeric(12, 2))
    tax_rate = Column(Numeric(5, 2), default=19.0)  # German VAT: 19% or 7%

    # Payment details (BG-16)
    iban = Column(String(34))                # BT-84: IBAN
    bic = Column(String(11))                 # BT-86: BIC/SWIFT
    payment_account_name = Column(String(70)) # BT-85: Account holder name

    # Routing & Reference
    buyer_reference = Column(String(200))       # BT-10: Leitweg-ID / purchase order reference
    seller_endpoint_id = Column(String(200))    # BT-34: Seller electronic address
    seller_endpoint_scheme = Column(String(10)) # e.g. "EM", "0088", "0204"
    buyer_endpoint_id = Column(String(200))     # BT-49: Buyer electronic address
    buyer_endpoint_scheme = Column(String(10))  # e.g. "EM", "0088", "0204"

    # Line Items (JSON array)
    line_items = Column(JSON)  # [{"description": "...", "quantity": 1, "price": 100.0}]

    # Processing Metadata
    source_type = Column(String)  # ocr, manual, xml
    ocr_confidence = Column(Float)  # 0-100
    validation_status = Column(String)  # valid, invalid, pending
    validation_errors = Column(JSON)  # KoSIT validation errors

    # Generated Files
    xrechnung_xml_path = Column(String)  # Path to generated XML
    zugferd_pdf_path = Column(String)    # Path to generated PDF/A-3

    # Timestamps — timezone-aware UTC (H2)
    created_at = Column(DateTime(timezone=True), default=_utc_now)
    updated_at = Column(DateTime(timezone=True), default=_utc_now, onupdate=_utc_now)

    # Relationships (H6)
    upload_logs = relationship("UploadLog", back_populates="invoice")
    validation_results = relationship("ValidationResult", back_populates="invoice")


class UploadLog(Base):
    """Log of all uploads (PDF, XML)"""
    __tablename__ = 'upload_logs'

    id = Column(Integer, primary_key=True)
    upload_id = Column(String, unique=True, index=True)
    filename = Column(String)
    file_type = Column(String)  # pdf, xml
    file_size = Column(Integer)  # bytes
    upload_status = Column(String)  # success, error
    error_message = Column(Text)
    invoice_id = Column(String, ForeignKey('invoices.invoice_id'))  # H6: echte FK
    uploaded_at = Column(DateTime(timezone=True), default=_utc_now)

    invoice = relationship("Invoice", back_populates="upload_logs")


class ValidationResult(Base):
    """KoSIT validation results"""
    __tablename__ = 'validation_results'

    id = Column(Integer, primary_key=True)
    validation_id = Column(String, unique=True, index=True)
    invoice_id = Column(String, ForeignKey('invoices.invoice_id'))  # H6: echte FK

    # Validation Results
    is_valid = Column(Boolean)
    validator_version = Column(String)  # KoSIT version
    validation_report = Column(JSON)  # Full validation report
    error_count = Column(Integer)
    warning_count = Column(Integer)

    # Timestamps
    validated_at = Column(DateTime(timezone=True), default=_utc_now)

    invoice = relationship("Invoice", back_populates="validation_results")
