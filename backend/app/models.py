"""
Database models for RechnungsWerk
"""
from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Text, JSON, Boolean
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()


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
    
    # Amounts
    net_amount = Column(Float)
    tax_amount = Column(Float)
    gross_amount = Column(Float)
    tax_rate = Column(Float, default=19.0)  # German VAT: 19% or 7%
    
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
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


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
    invoice_id = Column(String)  # FK to invoices.invoice_id
    uploaded_at = Column(DateTime, default=datetime.utcnow)


class ValidationResult(Base):
    """KoSIT validation results"""
    __tablename__ = 'validation_results'
    
    id = Column(Integer, primary_key=True)
    validation_id = Column(String, unique=True, index=True)
    invoice_id = Column(String)  # FK to invoices.invoice_id
    
    # Validation Results
    is_valid = Column(Boolean)
    validator_version = Column(String)  # KoSIT version
    validation_report = Column(JSON)  # Full validation report
    error_count = Column(Integer)
    warning_count = Column(Integer)
    
    # Timestamps
    validated_at = Column(DateTime, default=datetime.utcnow)
