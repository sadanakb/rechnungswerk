"""Firebase FCM push notification service — Phase 11."""
import logging
import os
from typing import List, Optional

logger = logging.getLogger(__name__)

_firebase_initialized = False


def _init_firebase() -> bool:
    """Initialize Firebase Admin SDK (idempotent). Returns True if ready."""
    global _firebase_initialized
    if _firebase_initialized:
        return True
    try:
        import firebase_admin
        from firebase_admin import credentials

        service_account_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
        if not service_account_json:
            logger.warning("[Push] FIREBASE_SERVICE_ACCOUNT_JSON not set — push disabled")
            return False

        import json
        cred = credentials.Certificate(json.loads(service_account_json))
        firebase_admin.initialize_app(cred)
        _firebase_initialized = True
        logger.info("[Push] Firebase Admin SDK initialized")
        return True
    except Exception as e:
        logger.error("[Push] Firebase init failed: %s", e)
        return False


def send_push(fcm_token: str, title: str, body: str, data: Optional[dict] = None) -> bool:
    """Send a push notification to a single FCM token. Returns True on success."""
    if not _init_firebase():
        return False
    try:
        import firebase_admin.messaging as messaging
        message = messaging.Message(
            notification=messaging.Notification(title=title, body=body),
            data=data or {},
            token=fcm_token,
        )
        messaging.send(message)
        logger.info("[Push] Sent '%s' to token ...%s", title, fcm_token[-8:])
        return True
    except Exception as e:
        logger.error("[Push] Failed to send to token ...%s: %s", fcm_token[-8:], e)
        return False


def notify_user(user_id: int, title: str, body: str, db) -> None:
    """Send push to all FCM tokens registered for this user."""
    from app.models import PushSubscription
    try:
        subscriptions = db.query(PushSubscription).filter(
            PushSubscription.user_id == user_id
        ).all()
    except Exception as e:
        logger.error("[Push] DB query failed for user %s: %s", user_id, e)
        return
    for sub in subscriptions:
        send_push(fcm_token=sub.fcm_token, title=title, body=body)


def notify_org(organization_id: int, title: str, body: str, db) -> None:
    """Send push to all FCM tokens in an organization (all members)."""
    from app.models import PushSubscription
    try:
        subscriptions = db.query(PushSubscription).filter(
            PushSubscription.organization_id == organization_id
        ).all()
    except Exception as e:
        logger.error("[Push] DB query failed for org %s: %s", organization_id, e)
        return
    for sub in subscriptions:
        send_push(fcm_token=sub.fcm_token, title=title, body=body)
