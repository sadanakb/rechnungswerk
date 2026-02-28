"""ARQ cron task: daily overdue push notifications — Phase 11."""
import logging
from datetime import date
from typing import Dict

logger = logging.getLogger(__name__)


async def send_overdue_push_cron(ctx: Dict) -> dict:
    """
    Daily cron (08:00): notify organizations with overdue invoices.
    ARQ signature: async def task(ctx: Dict) -> result
    """
    from app.database import SessionLocal
    from app.models import Invoice
    from app import push_service

    db = SessionLocal()
    try:
        today = date.today()
        overdue = (
            db.query(Invoice)
            .filter(
                Invoice.due_date < today,
                Invoice.payment_status.notin_(["paid", "cancelled"]),
                Invoice.organization_id.isnot(None),
            )
            .all()
        )

        # Group by organization
        org_counts: dict[int, int] = {}
        for inv in overdue:
            org_counts[inv.organization_id] = org_counts.get(inv.organization_id, 0) + 1

        notified = 0
        for org_id, count in org_counts.items():
            try:
                push_service.notify_org(
                    organization_id=org_id,
                    title=f"{count} überfällige Rechnung{'n' if count > 1 else ''}",
                    body="Bitte prüfe offene Rechnungen in RechnungsWerk.",
                    db=db,
                )
                notified += 1
            except Exception:
                logger.warning("[PushCron] notify_org failed for org %d", org_id)

        logger.info("[PushCron] Overdue push sent to %d organisations", notified)
        return {"notified_orgs": notified, "overdue_invoices": len(overdue)}
    finally:
        db.close()
