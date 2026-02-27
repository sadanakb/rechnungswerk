"""Transactional email service via Brevo (formerly Sendinblue)."""
import logging
from app.config import settings

logger = logging.getLogger(__name__)

SENDER = {"email": "noreply@rechnungswerk.io", "name": "RechnungsWerk"}


def _get_transactional_api():
    """Get Brevo TransactionalEmailsApi instance."""
    import sib_api_v3_sdk

    configuration = sib_api_v3_sdk.Configuration()
    configuration.api_key["api-key"] = settings.brevo_api_key
    return sib_api_v3_sdk.TransactionalEmailsApi(
        sib_api_v3_sdk.ApiClient(configuration)
    )


def send_password_reset_email(to_email: str, reset_url: str) -> bool:
    """Send a password reset link via Brevo transactional API.

    Returns True on success, False on failure or if API key not configured.
    """
    if not settings.brevo_api_key:
        logger.warning("Brevo API key not configured, skipping password reset email to %s", to_email)
        return False

    import sib_api_v3_sdk

    api = _get_transactional_api()

    html_content = (
        "<html><body>"
        "<h2>Passwort zuruecksetzen</h2>"
        "<p>Du hast angefordert, dein Passwort bei RechnungsWerk zurueckzusetzen.</p>"
        "<p>Klicke auf den folgenden Link, um ein neues Passwort zu setzen:</p>"
        f'<p><a href="{reset_url}">{reset_url}</a></p>'
        "<p>Dieser Link ist 1 Stunde gueltig.</p>"
        "<p>Falls du diese Anfrage nicht gestellt hast, kannst du diese E-Mail ignorieren.</p>"
        "<br><p>Dein RechnungsWerk Team</p>"
        "</body></html>"
    )

    email = sib_api_v3_sdk.SendSmtpEmail(
        to=[{"email": to_email}],
        sender=SENDER,
        subject="Passwort zuruecksetzen - RechnungsWerk",
        html_content=html_content,
    )

    try:
        api.send_transac_email(email)
        logger.info("Password reset email sent to %s", to_email)
        return True
    except Exception as e:
        logger.error("Failed to send password reset email to %s: %s", to_email, e)
        return False


def send_email_verification(to_email: str, verification_url: str) -> bool:
    """Send an email verification link via Brevo transactional API.

    Returns True on success, False on failure or if API key not configured.
    """
    if not settings.brevo_api_key:
        logger.warning("Brevo API key not configured, skipping verification email to %s", to_email)
        return False

    import sib_api_v3_sdk

    api = _get_transactional_api()

    html_content = (
        "<html><body>"
        "<h2>E-Mail-Adresse bestaetigen</h2>"
        "<p>Willkommen bei RechnungsWerk!</p>"
        "<p>Bitte bestaetigt deine E-Mail-Adresse, indem du auf den folgenden Link klickst:</p>"
        f'<p><a href="{verification_url}">{verification_url}</a></p>'
        "<p>Dieser Link ist 24 Stunden gueltig.</p>"
        "<br><p>Dein RechnungsWerk Team</p>"
        "</body></html>"
    )

    email = sib_api_v3_sdk.SendSmtpEmail(
        to=[{"email": to_email}],
        sender=SENDER,
        subject="E-Mail bestaetigen - RechnungsWerk",
        html_content=html_content,
    )

    try:
        api.send_transac_email(email)
        logger.info("Verification email sent to %s", to_email)
        return True
    except Exception as e:
        logger.error("Failed to send verification email to %s: %s", to_email, e)
        return False
