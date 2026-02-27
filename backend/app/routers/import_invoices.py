"""
CSV Invoice Import Router
Allows bulk import of invoices from a CSV file with duplicate detection.
"""
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import Optional
import csv
import io
import uuid
from datetime import date, datetime
from app.database import get_db
from app.models import Invoice, OrganizationMember
from app.auth_jwt import get_current_user

router = APIRouter(prefix="/api/import", tags=["import"])

# CSV template headers
TEMPLATE_HEADERS = [
    "invoice_number", "invoice_date", "due_date",
    "buyer_name", "buyer_vat_id",
    "seller_name", "seller_vat_id",
    "net_amount", "tax_rate", "gross_amount",
    "currency", "payment_status"
]

TEMPLATE_EXAMPLE_ROWS = [
    ["RE-2026-0001", "2026-01-15", "2026-02-15",
     "ACME GmbH", "DE123456789",
     "Meine Firma GmbH", "DE987654321",
     "1000.00", "19", "1190.00",
     "EUR", "unpaid"],
    ["RE-2026-0002", "2026-01-20", "2026-02-20",
     "Beta Corp", "",
     "Meine Firma GmbH", "DE987654321",
     "500.00", "0", "500.00",
     "EUR", "paid"],
]

COLUMN_DESCRIPTIONS = {
    "invoice_number": "Eindeutige Rechnungsnummer (Pflichtfeld)",
    "invoice_date": "Rechnungsdatum im Format JJJJ-MM-TT",
    "due_date": "Fälligkeitsdatum im Format JJJJ-MM-TT",
    "buyer_name": "Name des Käufers / Leistungsempfängers",
    "buyer_vat_id": "USt-IdNr. des Käufers (optional)",
    "seller_name": "Name des Verkäufers / Leistungserbringers",
    "seller_vat_id": "USt-IdNr. des Verkäufers (optional)",
    "net_amount": "Nettobetrag in der Rechnungswährung",
    "tax_rate": "Steuersatz in Prozent (z. B. 19 oder 7)",
    "gross_amount": "Bruttobetrag (Netto + Steuer)",
    "currency": "ISO 4217 Währungscode (Standard: EUR)",
    "payment_status": "Zahlungsstatus: unpaid, paid, partial, overdue, cancelled",
}


def _resolve_org_id(current_user: dict, db: Session) -> int:
    """Resolve organization ID from the current user context."""
    if isinstance(current_user, dict):
        user_id = current_user.get("user_id") or current_user.get("id")
        # Dev mode returns "dev-user" string — return 0 for dev
        if not user_id or not isinstance(user_id, int):
            return 0
        member = db.query(OrganizationMember).filter(
            OrganizationMember.user_id == user_id
        ).first()
        return member.organization_id if member else 0
    return getattr(current_user, 'org_id', 0)


def _parse_date(value: str) -> Optional[date]:
    """Parse a date string (YYYY-MM-DD) into a date object, or return None."""
    if not value or not value.strip():
        return None
    try:
        return datetime.strptime(value.strip(), "%Y-%m-%d").date()
    except ValueError:
        return None


def _generate_invoice_id() -> str:
    """Generate a unique invoice ID like INV-20260227-abc12345."""
    today = datetime.now().strftime("%Y%m%d")
    suffix = uuid.uuid4().hex[:8]
    return f"INV-{today}-{suffix}"


@router.get("/template")
def download_template(current_user=Depends(get_current_user)):
    """Download a CSV template with example rows for bulk invoice import."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(TEMPLATE_HEADERS)
    for row in TEMPLATE_EXAMPLE_ROWS:
        writer.writerow(row)
    csv_content = output.getvalue()
    return Response(
        content=csv_content.encode("utf-8-sig"),  # BOM for Excel compatibility
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="rechnungswerk_import_vorlage.csv"'}
    )


@router.post("/csv")
async def import_csv(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Import invoices from a CSV file.

    - Skips rows where invoice_number already exists (deduplication).
    - Reports per-row errors without stopping the whole import.
    - Returns counts of imported, skipped (duplicates), and errored rows.
    """
    org_id = _resolve_org_id(current_user, db)

    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "Nur CSV-Dateien werden unterstützt")

    content = await file.read()
    try:
        text = content.decode("utf-8-sig")  # Handle BOM from Excel
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))

    imported = 0
    skipped = 0
    errors = []

    # Fetch existing invoice numbers for this org to detect duplicates.
    # When org_id is 0 (dev mode / no org), include rows with NULL organization_id.
    if org_id:
        existing_query = db.query(Invoice.invoice_number).filter(
            Invoice.organization_id == org_id
        )
    else:
        existing_query = db.query(Invoice.invoice_number).filter(
            (Invoice.organization_id == None) | (Invoice.organization_id == 0)  # noqa: E711
        )
    existing_numbers = {row[0] for row in existing_query.all()}

    for row_num, row in enumerate(reader, start=2):  # Row 1 = header, data starts at 2
        try:
            invoice_number = (row.get("invoice_number") or "").strip()
            if not invoice_number:
                errors.append({"row": row_num, "error": "invoice_number fehlt"})
                continue

            if invoice_number in existing_numbers:
                skipped += 1
                continue

            # Parse amounts
            net_amount = float(row.get("net_amount") or 0)
            tax_rate_val = float(row.get("tax_rate") or 19)
            gross_amount_str = (row.get("gross_amount") or "").strip()
            gross_amount = float(gross_amount_str) if gross_amount_str else net_amount * (1 + tax_rate_val / 100)

            payment_status = (row.get("payment_status") or "unpaid").strip()
            if payment_status not in {"unpaid", "paid", "partial", "overdue", "cancelled"}:
                payment_status = "unpaid"

            invoice = Invoice(
                invoice_id=_generate_invoice_id(),
                organization_id=org_id if org_id else None,
                invoice_number=invoice_number,
                invoice_date=_parse_date(row.get("invoice_date", "")),
                due_date=_parse_date(row.get("due_date", "")),
                buyer_name=(row.get("buyer_name") or "").strip(),
                buyer_vat_id=(row.get("buyer_vat_id") or "").strip() or None,
                seller_name=(row.get("seller_name") or "").strip(),
                seller_vat_id=(row.get("seller_vat_id") or "").strip() or None,
                net_amount=net_amount,
                tax_rate=tax_rate_val,
                gross_amount=gross_amount,
                currency=(row.get("currency") or "EUR").strip() or "EUR",
                payment_status=payment_status,
                validation_status="pending",
                source_type="csv_import",
            )
            db.add(invoice)
            existing_numbers.add(invoice_number)
            imported += 1

        except Exception as e:
            errors.append({"row": row_num, "error": str(e)})

    if imported > 0:
        db.commit()

    return {
        "imported": imported,
        "skipped": skipped,
        "errors": errors,
        "total_rows": imported + skipped + len(errors)
    }
