"""
Audit log service — append-only, non-blocking.

Usage:
    from app.audit_service import log_action
    log_action(db, org_id=1, user_id=42, action="invoice_created",
               resource_type="invoice", resource_id="INV-20260227-abc12345",
               details={"invoice_number": "RE-2026-001"}, ip_address="1.2.3.4")
"""
import logging

from sqlalchemy.orm import Session

from app.models import AuditLog

logger = logging.getLogger(__name__)


def log_action(
    db: Session,
    org_id: int,
    user_id: int | None,
    action: str,
    resource_type: str | None = None,
    resource_id: str | None = None,
    details: dict | None = None,
    ip_address: str | None = None,
) -> None:
    """Append-only audit log entry.

    Non-blocking — catches all exceptions silently so that audit failures
    never interrupt the main request flow.
    """
    try:
        entry = AuditLog(
            org_id=org_id,
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details,
            ip_address=ip_address,
        )
        db.add(entry)
        db.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Audit log write failed (non-fatal): %s", exc)
        try:
            db.rollback()
        except Exception:
            pass
