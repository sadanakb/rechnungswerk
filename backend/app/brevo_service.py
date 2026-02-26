"""Brevo (formerly Sendinblue) email marketing integration."""
import logging
from app.config import settings

logger = logging.getLogger(__name__)

NEWSLETTER_LIST_ID = 2


def add_contact(email: str, attributes: dict = None) -> bool:
    """Add or update a contact in Brevo newsletter list."""
    if not settings.brevo_api_key:
        logger.warning("Brevo API key not configured, skipping")
        return False

    import sib_api_v3_sdk

    configuration = sib_api_v3_sdk.Configuration()
    configuration.api_key["api-key"] = settings.brevo_api_key
    api = sib_api_v3_sdk.ContactsApi(sib_api_v3_sdk.ApiClient(configuration))

    contact = sib_api_v3_sdk.CreateContact(
        email=email,
        list_ids=[NEWSLETTER_LIST_ID],
        attributes=attributes or {},
        update_enabled=True,
    )
    try:
        api.create_contact(contact)
        return True
    except Exception as e:
        logger.error("Brevo contact creation failed: %s", e)
        return False
