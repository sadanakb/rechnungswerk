"""
Notification service — thin helper to create in-app notifications.

Usage:
    from app.notification_service import create_notification
    create_notification(db, org_id=1, type="invoice_created",
                        title="Neue Rechnung", message="RE-001 erstellt.",
                        link="/invoices/42")

Failures are intentionally silent: a notification write must never break
the primary business operation that triggered it.
"""
import logging

from app.models import Notification

logger = logging.getLogger(__name__)


def create_notification(
    db,
    org_id: int,
    type: str,
    title: str,
    message: str,
    link: str = None,
    user_id: int = None,
) -> None:
    """
    Persist a Notification row for the given organisation.

    Never raises — any DB error is caught, rolled back, and logged as a warning.
    """
    try:
        n = Notification(
            org_id=org_id,
            user_id=user_id,
            type=type,
            title=title,
            message=message,
            link=link,
        )
        db.add(n)
        db.commit()
    except Exception as exc:
        logger.warning("create_notification failed (org_id=%s): %s", org_id, exc)
        db.rollback()
