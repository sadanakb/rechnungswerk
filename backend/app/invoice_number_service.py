"""
Service for generating sequential, configurable invoice numbers.
"""
from datetime import datetime
from sqlalchemy.orm import Session
from app.models import InvoiceNumberSequence


def generate_next_invoice_number(db: Session, org_id: int) -> str:
    """Atomically generate the next invoice number for an org.

    Uses SELECT ... FOR UPDATE to prevent concurrent duplicates.
    Falls back to a UUID-based format if no sequence is configured.
    """
    seq = db.query(InvoiceNumberSequence).filter(
        InvoiceNumberSequence.org_id == org_id
    ).with_for_update().first()

    if not seq:
        # No sequence configured — use legacy format
        import uuid
        from datetime import date
        return f"RE-{date.today().strftime('%Y%m%d')}-{uuid.uuid4().hex[:8].upper()}"

    current_year = datetime.now().year

    # Reset counter if new year and reset_yearly is True
    if seq.reset_yearly and seq.last_reset_year != current_year:
        seq.current_counter = 0
        seq.last_reset_year = current_year

    seq.current_counter += 1
    db.flush()  # Write the increment before committing

    # Format: {prefix}{sep}{year}{sep}{counter:0{padding}}
    year_str = str(current_year) if seq.year_format == 'YYYY' else str(current_year)[2:]
    counter_str = str(seq.current_counter).zfill(seq.padding)

    parts = [seq.prefix, year_str, counter_str]
    return seq.separator.join(parts)


def preview_format(prefix: str, separator: str, year_format: str, padding: int) -> str:
    """Return a preview of what the next invoice number would look like."""
    year_str = '2026' if year_format == 'YYYY' else '26'
    counter_str = '1'.zfill(padding)
    return separator.join([prefix, year_str, counter_str])
