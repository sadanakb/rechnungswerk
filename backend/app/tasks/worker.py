"""
Background task worker using ARQ (Redis-based).

Handles:
- OCR batch processing
- ZUGFeRD PDF generation
- Email inbox processing
- Scheduled recurring invoice generation

Requires Redis: redis-server running on localhost:6379
"""
import logging
from typing import Dict
from arq import cron

logger = logging.getLogger(__name__)


async def process_ocr_batch(ctx: Dict, batch_id: str, file_paths: list):
    """Process a batch of PDFs through OCR pipeline."""
    from app.ocr.batch_processor import BatchProcessor

    processor = BatchProcessor()
    result = processor.process_batch(batch_id, file_paths)
    logger.info("Batch %s completed: %d/%d succeeded", batch_id, result.succeeded, result.total_files)
    return {"batch_id": batch_id, "status": result.status}


async def generate_zugferd_task(ctx: Dict, invoice_id: str):
    """Generate ZUGFeRD PDF in background."""
    from app.database import SessionLocal
    from app.models import Invoice
    from app.xrechnung_generator import XRechnungGenerator
    from app.zugferd_generator import ZUGFeRDGenerator
    import os

    db = SessionLocal()
    try:
        invoice = db.query(Invoice).filter(Invoice.invoice_id == invoice_id).first()
        if not invoice:
            return {"error": f"Invoice {invoice_id} not found"}

        invoice_data = {
            "invoice_number": invoice.invoice_number,
            "invoice_date": str(invoice.invoice_date),
            "due_date": str(invoice.due_date) if invoice.due_date else None,
            "seller_name": invoice.seller_name,
            "seller_vat_id": invoice.seller_vat_id,
            "seller_address": invoice.seller_address,
            "buyer_name": invoice.buyer_name,
            "buyer_vat_id": invoice.buyer_vat_id,
            "buyer_address": invoice.buyer_address,
            "net_amount": invoice.net_amount,
            "tax_amount": invoice.tax_amount,
            "gross_amount": invoice.gross_amount,
            "tax_rate": invoice.tax_rate,
            "line_items": invoice.line_items or [],
            "iban": invoice.iban,
            "bic": invoice.bic,
            "payment_account_name": invoice.payment_account_name,
        }

        xml_content = XRechnungGenerator().generate_xml(invoice_data)
        pdf_path = os.path.join("data/zugferd_output", f"{invoice_id}_zugferd.pdf")
        ZUGFeRDGenerator().generate(invoice_data, xml_content, pdf_path)

        invoice.zugferd_pdf_path = pdf_path
        db.commit()

        logger.info("ZUGFeRD generated for %s", invoice_id)
        return {"invoice_id": invoice_id, "pdf_path": pdf_path}
    finally:
        db.close()


async def process_email_inbox(ctx: Dict, config: Dict):
    """Process email inbox for PDF attachments."""
    from app.email.inbox_processor import InboxProcessor

    processor = InboxProcessor(
        imap_host=config["imap_host"],
        imap_port=config.get("imap_port", 993),
        username=config["username"],
        password=config["password"],
        folder=config.get("folder", "INBOX"),
    )

    results = processor.fetch_pdf_attachments()
    logger.info("Fetched %d PDF attachments from inbox", len(results))
    return {"attachments_found": len(results), "results": results}


async def send_email_task(ctx: Dict, task_type: str, **kwargs):
    """Dispatch an email by task_type to the correct email_service function."""
    from app import email_service
    _known_types = [
        "password_reset",
        "email_verification",
        "team_invite",
        "mahnung",
        "contact",
        "invoice_portal",
    ]
    _func_map = {
        "password_reset": "send_password_reset_email",
        "email_verification": "send_email_verification",
        "team_invite": "send_team_invite",
        "mahnung": "send_mahnung_email",
        "contact": "send_contact_email",
        "invoice_portal": "send_invoice_portal_email",
    }
    func_name = _func_map.get(task_type)
    handler = getattr(email_service, func_name, None) if func_name else None
    if not handler:
        logger.error("Unknown email task_type: %s", task_type)
        return {"error": f"Unknown task_type: {task_type}"}
    result = handler(**kwargs)
    return {"task_type": task_type, "success": result}


RETRY_DELAYS = [60, 300, 1800, 7200, 86400]  # 1m, 5m, 30m, 2h, 24h


async def webhook_retry_task(ctx: Dict, delivery_id: int):
    """Retry a failed webhook delivery with exponential backoff."""
    from app.database import SessionLocal
    from app.models import WebhookDelivery, WebhookSubscription
    from app.webhook_service import _deliver
    from datetime import datetime, timezone

    db = SessionLocal()
    try:
        delivery = db.query(WebhookDelivery).filter(
            WebhookDelivery.id == delivery_id
        ).first()
        if not delivery or delivery.status == "success":
            return {"skipped": True}

        sub = db.query(WebhookSubscription).filter(
            WebhookSubscription.id == delivery.subscription_id
        ).first()
        if not sub:
            return {"error": "subscription not found"}

        if delivery.attempts >= 5:
            delivery.status = "failed"
            db.commit()
            return {"final_failure": True, "delivery_id": delivery_id}

        success, code, body = await _deliver(
            sub.url,
            delivery.payload,
            sub.secret,
            event_type=delivery.event_type,
        )
        delivery.attempts += 1
        delivery.response_code = code
        delivery.response_body = body[:500] if body else None
        delivery.last_attempted_at = datetime.now(timezone.utc)

        if success:
            delivery.status = "success"
            db.commit()
            return {"success": True, "delivery_id": delivery_id}
        else:
            delivery.status = "pending"
            db.commit()
            if delivery.attempts < 5 and ctx.get("redis"):
                delay = RETRY_DELAYS[delivery.attempts - 1]
                await ctx["redis"].enqueue_job(
                    "webhook_retry_task", delivery_id, _defer_by=delay
                )
            return {"retrying": True, "attempt": delivery.attempts}
    finally:
        db.close()


async def daily_recurring_check(ctx: Dict):
    """Daily ARQ cron: auto-generate recurring invoices that are due."""
    from app.database import SessionLocal
    from app.models import RecurringInvoice, Invoice
    from app.recurring.scheduler import RecurringScheduler
    from datetime import date, datetime, timezone
    import uuid

    db = SessionLocal()
    generated = 0
    try:
        active = db.query(RecurringInvoice).filter(RecurringInvoice.active == True).all()
        templates_dicts = [
            {
                "template_id": t.template_id,
                "active": t.active,
                "frequency": t.frequency,
                "next_date": t.next_date.isoformat() if t.next_date else None,
                "number_prefix": t.number_prefix,
                "payment_days": t.payment_days,
                "seller_name": t.seller_name,
                "seller_vat_id": t.seller_vat_id,
                "seller_address": t.seller_address,
                "buyer_name": t.buyer_name,
                "buyer_vat_id": t.buyer_vat_id,
                "buyer_address": t.buyer_address,
                "line_items": t.line_items or [],
                "tax_rate": float(t.tax_rate or 19),
                "iban": t.iban,
                "bic": t.bic,
                "payment_account_name": t.payment_account_name,
            }
            for t in active
        ]

        due = RecurringScheduler.get_due_templates(templates_dicts)

        for tmpl_dict in due:
            template_rec = next(
                (t for t in active if t.template_id == tmpl_dict["template_id"]), None
            )
            if not template_rec:
                continue

            today = date.today()
            invoice_data = RecurringScheduler.generate_invoice_data(tmpl_dict, today)

            net = sum(
                float(li.get("quantity", 1)) * float(li.get("unit_price", li.get("price", 0)))
                for li in (invoice_data.get("line_items") or [])
            )
            tax_rate = float(invoice_data.get("tax_rate", 19))
            tax = round(net * tax_rate / 100, 2)
            gross = round(net + tax, 2)

            invoice = Invoice(
                invoice_id=f"INV-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}",
                invoice_number=invoice_data["invoice_number"],
                invoice_date=date.fromisoformat(invoice_data["invoice_date"]),
                due_date=date.fromisoformat(invoice_data["due_date"]) if invoice_data.get("due_date") else None,
                seller_name=invoice_data.get("seller_name"),
                seller_vat_id=invoice_data.get("seller_vat_id"),
                seller_address=invoice_data.get("seller_address"),
                buyer_name=invoice_data.get("buyer_name"),
                buyer_vat_id=invoice_data.get("buyer_vat_id"),
                buyer_address=invoice_data.get("buyer_address"),
                net_amount=net,
                tax_amount=tax,
                gross_amount=gross,
                tax_rate=tax_rate,
                currency=invoice_data.get("currency", "EUR"),
                line_items=invoice_data.get("line_items"),
                source_type="recurring",
                payment_status="unpaid",
            )
            db.add(invoice)

            template_rec.last_generated = today
            template_rec.next_date = RecurringScheduler.calculate_next_date(
                today, template_rec.frequency
            )
            generated += 1

        db.commit()
        logger.info("daily_recurring_check: generated %d invoices", generated)
        return {"generated": generated}
    finally:
        db.close()


async def startup(ctx: Dict):
    """Worker startup hook."""
    logger.info("ARQ worker started")


async def shutdown(ctx: Dict):
    """Worker shutdown hook."""
    logger.info("ARQ worker stopped")


class WorkerSettings:
    """ARQ worker configuration."""
    functions = [
        process_ocr_batch,
        generate_zugferd_task,
        process_email_inbox,
        send_email_task,
        webhook_retry_task,
        daily_recurring_check,
    ]
    cron_jobs = [
        cron(daily_recurring_check, hour=6, minute=0),  # 06:00 UTC daily
    ]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = None  # Uses default localhost:6379
    max_jobs = 10
    job_timeout = 600  # 10 minutes
