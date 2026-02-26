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


class Organization(Base):
    """Organization / tenant for multi-tenancy"""
    __tablename__ = 'organizations'

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    vat_id = Column(String(20))
    address = Column(Text)
    logo_url = Column(String(500))
    plan = Column(String(20), default="free")  # free, starter, professional
    stripe_customer_id = Column(String(100))
    stripe_subscription_id = Column(String(100))
    created_at = Column(DateTime(timezone=True), default=_utc_now)
    updated_at = Column(DateTime(timezone=True), default=_utc_now, onupdate=_utc_now)

    members = relationship("OrganizationMember", back_populates="organization")
    invoices = relationship("Invoice", back_populates="organization")


class User(Base):
    """Application user"""
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(200))
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=_utc_now)
    updated_at = Column(DateTime(timezone=True), default=_utc_now, onupdate=_utc_now)

    memberships = relationship("OrganizationMember", back_populates="user")


class OrganizationMember(Base):
    """Links users to organizations with roles"""
    __tablename__ = 'organization_members'

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    role = Column(String(20), default="member")  # owner, admin, member
    joined_at = Column(DateTime(timezone=True), default=_utc_now)

    user = relationship("User", back_populates="memberships")
    organization = relationship("Organization", back_populates="members")


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
    currency = Column(String(3), default='EUR')  # ISO 4217 currency code

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

    # Multi-tenant
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)
    organization = relationship("Organization", back_populates="invoices")

    # Relationships (H6)
    upload_logs = relationship("UploadLog", back_populates="invoice")
    validation_results = relationship("ValidationResult", back_populates="invoice")

    @property
    def xrechnung_available(self) -> bool:
        return bool(self.xrechnung_xml_path)

    @property
    def zugferd_available(self) -> bool:
        return bool(self.zugferd_pdf_path)


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


class BatchJob(Base):
    """Batch OCR processing job"""
    __tablename__ = 'batch_jobs'

    id = Column(Integer, primary_key=True)
    batch_id = Column(String, unique=True, index=True)
    total_files = Column(Integer, default=0)
    processed = Column(Integer, default=0)
    succeeded = Column(Integer, default=0)
    failed = Column(Integer, default=0)
    status = Column(String, default="pending")  # pending, processing, completed, failed, partial
    results = Column(JSON)  # Array of per-file results
    created_at = Column(DateTime(timezone=True), default=_utc_now)
    completed_at = Column(DateTime(timezone=True), nullable=True)


class Supplier(Base):
    """Known supplier / vendor"""
    __tablename__ = 'suppliers'

    id = Column(Integer, primary_key=True)
    name = Column(String, index=True)
    vat_id = Column(String, unique=True, index=True)  # USt-IdNr
    address = Column(Text)
    iban = Column(String(34))
    bic = Column(String(11))
    email = Column(String)
    default_account = Column(String(10))  # SKR03/04 account number
    notes = Column(Text)
    invoice_count = Column(Integer, default=0)
    total_volume = Column(Numeric(12, 2), default=0)
    created_at = Column(DateTime(timezone=True), default=_utc_now)
    updated_at = Column(DateTime(timezone=True), default=_utc_now, onupdate=_utc_now)


class RecurringInvoice(Base):
    """Recurring invoice template"""
    __tablename__ = 'recurring_invoices'

    id = Column(Integer, primary_key=True)
    template_id = Column(String, unique=True, index=True)
    name = Column(String)  # Template display name
    active = Column(Boolean, default=True)
    frequency = Column(String)  # monthly, quarterly, half-yearly, yearly
    next_date = Column(Date)
    last_generated = Column(Date, nullable=True)

    # Invoice template data
    number_prefix = Column(String, default='RE')
    payment_days = Column(Integer, default=14)
    seller_name = Column(String)
    seller_vat_id = Column(String)
    seller_address = Column(Text)
    buyer_name = Column(String)
    buyer_vat_id = Column(String)
    buyer_address = Column(Text)
    line_items = Column(JSON)
    tax_rate = Column(Numeric(5, 2), default=19.0)
    currency = Column(String(3), default='EUR')
    iban = Column(String(34))
    bic = Column(String(11))
    payment_account_name = Column(String(70))
    buyer_reference = Column(String(200))
    seller_endpoint_id = Column(String(200))
    buyer_endpoint_id = Column(String(200))

    created_at = Column(DateTime(timezone=True), default=_utc_now)
    updated_at = Column(DateTime(timezone=True), default=_utc_now, onupdate=_utc_now)


class ArchiveEntry(Base):
    """GoBD-compliant archive entry"""
    __tablename__ = 'archive_entries'

    id = Column(Integer, primary_key=True)
    archive_id = Column(String, unique=True, index=True)
    invoice_id = Column(String, ForeignKey('invoices.invoice_id'), index=True)
    document_type = Column(String)  # xrechnung_xml, zugferd_pdf, original_pdf
    sha256_hash = Column(String(64))
    archive_path = Column(String)
    file_size = Column(Integer)
    archived_at = Column(DateTime(timezone=True), default=_utc_now)
