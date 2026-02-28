"""GDPR Controls Router — Phase 11 (Art. 17 + Art. 20)."""
import csv
import io
import json
import logging
import secrets
import zipfile
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth_jwt import get_current_user
from app.database import get_db
from app.email_service import send_gdpr_delete_confirmation
from app.models import (
    ApiKey, ArchiveEntry, AuditLog, Contact, GdprDeleteRequest,
    Invoice, InvoiceNumberSequence, InvoiceShareLink, InvoiceTemplate,
    Mahnung, Organization, OrganizationMember, PushSubscription, User,
    UploadLog, ValidationResult, WebhookDelivery, WebhookSubscription,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def _get_user_and_org(current_user: dict, db: Session):
    """Return (user, org) for current request. org may be None."""
    user_id = int(current_user["user_id"])
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")
    member = db.query(OrganizationMember).filter(
        OrganizationMember.user_id == user_id
    ).first()
    org = (
        db.query(Organization).filter(Organization.id == member.organization_id).first()
        if member else None
    )
    return user, org


@router.get("/export")
def export_gdpr_data(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """GDPR Art. 20 — Export all personal data as ZIP with 4 files."""
    user, org = _get_user_and_org(current_user, db)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # 1. rechnungen.csv
        invoices = (
            db.query(Invoice).filter(Invoice.organization_id == org.id).all()
            if org else []
        )
        inv_buf = io.StringIO()
        inv_writer = csv.writer(inv_buf)
        inv_writer.writerow([
            "invoice_id", "invoice_number", "invoice_date", "total_amount",
            "payment_status", "supplier_name", "description",
        ])
        for inv in invoices:
            inv_writer.writerow([
                inv.invoice_id, inv.invoice_number, inv.invoice_date,
                inv.gross_amount, inv.payment_status,
                inv.seller_name, "",
            ])
        zf.writestr("rechnungen.csv", inv_buf.getvalue())

        # 2. kontakte.csv
        # Contact model uses org_id (not organization_id)
        contacts = (
            db.query(Contact).filter(Contact.org_id == org.id).all()
            if org else []
        )
        con_buf = io.StringIO()
        con_writer = csv.writer(con_buf)
        con_writer.writerow(["id", "name", "email", "phone", "address_line1", "city", "zip"])
        for c in contacts:
            con_writer.writerow([
                c.id, c.name, c.email, c.phone,
                c.address_line1, c.city, c.zip,
            ])
        zf.writestr("kontakte.csv", con_buf.getvalue())

        # 3. organisation.json
        org_data = {
            "name": org.name if org else None,
            "slug": org.slug if org else None,
            "vat_id": org.vat_id if org else None,
            "address": org.address if org else None,
            "plan": org.plan if org else None,
            "created_at": str(org.created_at) if org else None,
        }
        zf.writestr("organisation.json", json.dumps(org_data, ensure_ascii=False, indent=2))

        # 4. profil.json
        profil_data = {
            "email": user.email,
            "full_name": user.full_name,
            "is_active": user.is_active,
            "is_verified": user.is_verified,
            "created_at": str(user.created_at),
        }
        zf.writestr("profil.json", json.dumps(profil_data, ensure_ascii=False, indent=2))

    buf.seek(0)
    filename = f"RechnungsWerk_Datenexport_{datetime.now(timezone.utc).date()}.zip"
    return StreamingResponse(
        content=buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/request-delete")
def request_account_delete(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """GDPR Art. 17 Step 1 — Send account deletion confirmation email with 24h token."""
    user, _ = _get_user_and_org(current_user, db)

    # Remove any existing pending request for this user (idempotent)
    db.query(GdprDeleteRequest).filter(
        GdprDeleteRequest.user_id == user.id
    ).delete()

    token = secrets.token_hex(32)
    req = GdprDeleteRequest(
        user_id=user.id,
        token=token,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
    )
    db.add(req)
    db.commit()

    send_gdpr_delete_confirmation(to_email=user.email, token=token)
    return {"message": "Bestätigungs-E-Mail wurde gesendet."}


@router.delete("/confirm-delete")
def confirm_account_delete(
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    """
    GDPR Art. 17 Step 2 — Confirm deletion via email token link.
    No auth required — the token IS the authentication.
    Deletes all user data: invoices, contacts, push subscriptions, org, user.
    """
    req = db.query(GdprDeleteRequest).filter(GdprDeleteRequest.token == token).first()
    if not req:
        raise HTTPException(status_code=404, detail="Token ungültig oder bereits verwendet.")

    # Compare timezone-aware datetimes
    expires = req.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Token abgelaufen. Bitte erneut anfordern.")

    user_id = req.user_id
    member = db.query(OrganizationMember).filter(
        OrganizationMember.user_id == user_id
    ).first()

    if member:
        org_id = member.organization_id

        # --- Step 1: Children of Invoice (FK to invoices.id or invoices.invoice_id) ---
        # Collect integer PKs of all invoices for this org (used by InvoiceShareLink)
        invoice_ids = db.execute(
            select(Invoice.id).where(Invoice.organization_id == org_id)
        ).scalars().all()
        if invoice_ids:
            db.query(InvoiceShareLink).filter(
                InvoiceShareLink.invoice_id.in_(invoice_ids)
            ).delete(synchronize_session="fetch")

        # Collect string invoice_ids for tables that FK on invoices.invoice_id
        invoice_str_ids = db.execute(
            select(Invoice.invoice_id).where(Invoice.organization_id == org_id)
        ).scalars().all()
        if invoice_str_ids:
            db.query(UploadLog).filter(
                UploadLog.invoice_id.in_(invoice_str_ids)
            ).delete(synchronize_session="fetch")
            db.query(ValidationResult).filter(
                ValidationResult.invoice_id.in_(invoice_str_ids)
            ).delete(synchronize_session="fetch")
            db.query(ArchiveEntry).filter(
                ArchiveEntry.invoice_id.in_(invoice_str_ids)
            ).delete(synchronize_session="fetch")
            db.query(Mahnung).filter(
                Mahnung.invoice_id.in_(invoice_str_ids)
            ).delete(synchronize_session="fetch")

        # --- Step 2: Invoice (FK to organizations.id) ---
        db.query(Invoice).filter(Invoice.organization_id == org_id).delete()

        # --- Step 3: Contact (org_id plain integer column, no FK constraint) ---
        db.query(Contact).filter(Contact.org_id == org_id).delete()

        # --- Step 4: ApiKey (FK org_id -> organizations.id) ---
        db.query(ApiKey).filter(ApiKey.org_id == org_id).delete()

        # --- Step 5: WebhookDelivery -> WebhookSubscription (FK chain) ---
        webhook_sub_ids = db.execute(
            select(WebhookSubscription.id).where(WebhookSubscription.org_id == org_id)
        ).scalars().all()
        if webhook_sub_ids:
            db.query(WebhookDelivery).filter(
                WebhookDelivery.subscription_id.in_(webhook_sub_ids)
            ).delete(synchronize_session="fetch")
        db.query(WebhookSubscription).filter(WebhookSubscription.org_id == org_id).delete()

        # --- Step 6: AuditLog (FK org_id -> organizations.id) ---
        db.query(AuditLog).filter(AuditLog.org_id == org_id).delete()

        # --- Step 7: InvoiceTemplate (FK org_id -> organizations.id) ---
        db.query(InvoiceTemplate).filter(InvoiceTemplate.org_id == org_id).delete()

        # --- Step 8: InvoiceNumberSequence (org_id plain integer, no FK constraint) ---
        db.query(InvoiceNumberSequence).filter(InvoiceNumberSequence.org_id == org_id).delete()

        # --- Step 9: PushSubscription (FK organization_id -> organizations.id) ---
        db.query(PushSubscription).filter(PushSubscription.organization_id == org_id).delete()

        # --- Step 10: OrganizationMember (FK organization_id -> organizations.id) ---
        db.query(OrganizationMember).filter(OrganizationMember.organization_id == org_id).delete()

        # --- Step 11: Organization itself ---
        db.query(Organization).filter(Organization.id == org_id).delete()

    # Delete user-level data
    db.query(GdprDeleteRequest).filter(GdprDeleteRequest.user_id == user_id).delete()
    db.query(PushSubscription).filter(PushSubscription.user_id == user_id).delete()
    db.query(User).filter(User.id == user_id).delete()

    db.commit()
    logger.info("[GDPR] Account deleted for user_id=%d via token", user_id)
    return {"message": "Dein Account wurde vollständig gelöscht."}
