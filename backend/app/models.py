"""
Database models for RechnungsWerk
"""
from datetime import datetime, timezone

from sqlalchemy import (
    Column, Integer, String, Float, Numeric, Date, DateTime, Text,
    JSON, Boolean, ForeignKey, func,
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
    onboarding_completed = Column(Boolean, default=False)
    plan = Column(String(20), default="free")  # free, starter, professional
    stripe_customer_id = Column(String(255), nullable=True)
    stripe_subscription_id = Column(String(255), nullable=True)
    plan_status = Column(String(50), default='active')  # active, cancelled, past_due, trialing
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
    email_verification_token = Column(String(255), nullable=True)
    password_reset_token = Column(String(255), nullable=True)
    password_reset_expires = Column(DateTime(timezone=True), nullable=True)
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

    # Payment Status Lifecycle
    payment_status = Column(String(20), default='unpaid', nullable=False)
    paid_date = Column(Date, nullable=True)
    payment_method = Column(String(50), nullable=True)
    payment_reference = Column(String(255), nullable=True)

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


class ApiKey(Base):
    """API keys for programmatic access — org-scoped, bcrypt-hashed"""
    __tablename__ = "api_keys"

    id = Column(Integer, primary_key=True)
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(255), nullable=False)
    key_prefix = Column(String(12), nullable=False)  # "rw_live_xxxx" first 12 chars
    key_hash = Column(String(255), nullable=False)   # bcrypt hash of full key
    scopes = Column(JSON, default=list)              # ["read:invoices", "write:invoices"]
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    organization = relationship("Organization")
    user = relationship("User")


class Mahnung(Base):
    """Dunning/reminder record for overdue invoices"""
    __tablename__ = 'mahnungen'

    id = Column(Integer, primary_key=True)
    mahnung_id = Column(String, unique=True, index=True)
    invoice_id = Column(String, ForeignKey('invoices.invoice_id'), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey('organizations.id'), nullable=False)
    level = Column(Integer, nullable=False)  # 1, 2, or 3
    fee = Column(Numeric(8, 2), default=0)  # Mahngebuehr
    interest = Column(Numeric(8, 2), default=0)  # Verzugszinsen
    total_due = Column(Numeric(12, 2))  # Original amount + fees + interest
    status = Column(String(50), default="created")  # created, sent, paid, cancelled
    sent_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utc_now)

    invoice = relationship("Invoice")


class WebhookSubscription(Base):
    """Outbound webhook subscription for an organization"""
    __tablename__ = "webhook_subscriptions"

    id = Column(Integer, primary_key=True)
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    url = Column(String(500), nullable=False)
    events = Column(JSON, default=list)  # ["invoice.created", "mahnung.sent", ...]
    secret = Column(String(255), nullable=False)  # for HMAC verification
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    deliveries = relationship("WebhookDelivery", back_populates="subscription")


class WebhookDelivery(Base):
    """Log of individual webhook delivery attempts"""
    __tablename__ = "webhook_deliveries"

    id = Column(Integer, primary_key=True)
    subscription_id = Column(Integer, ForeignKey("webhook_subscriptions.id"), nullable=False)
    event_type = Column(String(100), nullable=False)
    payload = Column(JSON)
    status = Column(String(20), default="pending")  # pending, success, failed
    attempts = Column(Integer, default=0)
    response_code = Column(Integer, nullable=True)
    response_body = Column(String(500), nullable=True)
    last_attempted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    subscription = relationship("WebhookSubscription", back_populates="deliveries")


class AuditLog(Base):
    """Immutable audit log for all significant actions within an organization."""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True)
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # nullable for system actions
    action = Column(String(100), nullable=False)  # "invoice_created", "password_changed", etc.
    resource_type = Column(String(50), nullable=True)  # "invoice", "user", "member"
    resource_id = Column(String(100), nullable=True)   # the ID of the resource
    details = Column(JSON, nullable=True)              # extra context
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class InvoiceTemplate(Base):
    """Invoice design template scoped to an organization."""
    __tablename__ = "invoice_templates"

    id = Column(Integer, primary_key=True)
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    name = Column(String(255), nullable=False)
    primary_color = Column(String(7), default="#14b8a6")  # hex color
    footer_text = Column(String(500), nullable=True)
    payment_terms_days = Column(Integer, default=14)
    bank_iban = Column(String(34), nullable=True)
    bank_bic = Column(String(11), nullable=True)
    bank_name = Column(String(255), nullable=True)
    default_vat_rate = Column(String(10), default="19")
    notes_template = Column(String(1000), nullable=True)
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    organization = relationship("Organization")


class Notification(Base):
    """In-app notification for an organization or a specific user."""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    org_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, nullable=True)  # None = org-wide
    type = Column(String(100), nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(String(1000), nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)
    link = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Contact(Base):
    """Customer or supplier contact scoped to an organization."""
    __tablename__ = "contacts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    org_id = Column(Integer, nullable=False, index=True)
    type = Column(String(20), nullable=False, default='customer')  # customer | supplier
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    address_line1 = Column(String(255), nullable=True)
    address_line2 = Column(String(255), nullable=True)
    city = Column(String(100), nullable=True)
    zip = Column(String(20), nullable=True)
    country = Column(String(2), default='DE', nullable=False)
    vat_id = Column(String(50), nullable=True)
    payment_terms = Column(Integer, default=30)
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class InvoiceNumberSequence(Base):
    """Configurable invoice number sequence per organization."""
    __tablename__ = "invoice_number_sequences"

    id = Column(Integer, primary_key=True, autoincrement=True)
    org_id = Column(Integer, nullable=False, unique=True, index=True)
    prefix = Column(String(20), default='RE', nullable=False)
    separator = Column(String(5), default='-', nullable=False)
    year_format = Column(String(10), default='YYYY', nullable=False)
    padding = Column(Integer, default=4, nullable=False)
    current_counter = Column(Integer, default=0, nullable=False)
    reset_yearly = Column(Boolean, default=True, nullable=False)
    last_reset_year = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
