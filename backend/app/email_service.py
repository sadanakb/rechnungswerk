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


# ---------------------------------------------------------------------------
# Mahnung (Dunning) Email Templates
# ---------------------------------------------------------------------------

_MAHNUNG_TEMPLATES = {
    1: {
        "subject": "Freundliche Zahlungserinnerung - Rechnung {invoice_number}",
        "html": (
            "<html><body>"
            "<h2>Zahlungserinnerung</h2>"
            "<p>Sehr geehrte/r {customer_name},</p>"
            "<p>wir moechten Sie freundlich daran erinnern, dass die Zahlung fuer die "
            "Rechnung <strong>{invoice_number}</strong> ueber <strong>{amount} EUR</strong> "
            "seit dem <strong>{due_date}</strong> aussteht.</p>"
            "<p>Sollte sich Ihre Zahlung mit diesem Schreiben gekreuzt haben, "
            "betrachten Sie diese Erinnerung bitte als gegenstandslos.</p>"
            "<p>Bitte ueberweisen Sie den offenen Betrag zeitnah.</p>"
            "<br><p>Mit freundlichen Gruessen,<br>Ihr RechnungsWerk Team</p>"
            "</body></html>"
        ),
    },
    2: {
        "subject": "1. Mahnung - Rechnung {invoice_number}",
        "html": (
            "<html><body>"
            "<h2>1. Mahnung</h2>"
            "<p>Sehr geehrte/r {customer_name},</p>"
            "<p>trotz unserer Zahlungserinnerung konnten wir fuer die "
            "Rechnung <strong>{invoice_number}</strong> noch keinen Zahlungseingang feststellen.</p>"
            "<p>Der urspruengliche Rechnungsbetrag betraegt <strong>{amount} EUR</strong> "
            "(faellig seit {due_date}). Zuzueglich Mahngebuehren und Verzugszinsen ergibt sich "
            "ein Gesamtbetrag von <strong>{total_with_fees} EUR</strong>.</p>"
            "<p>Wir bitten Sie, den ausstehenden Betrag innerhalb von 10 Tagen zu ueberweisen.</p>"
            "<br><p>Mit freundlichen Gruessen,<br>Ihr RechnungsWerk Team</p>"
            "</body></html>"
        ),
    },
    3: {
        "subject": "2. Mahnung (Letzte Aufforderung) - Rechnung {invoice_number}",
        "html": (
            "<html><body>"
            "<h2>2. Mahnung — Letzte Aufforderung vor weiteren Massnahmen</h2>"
            "<p>Sehr geehrte/r {customer_name},</p>"
            "<p>leider ist die Zahlung fuer die Rechnung <strong>{invoice_number}</strong> "
            "trotz mehrfacher Aufforderung weiterhin offen.</p>"
            "<p>Der urspruengliche Rechnungsbetrag betraegt <strong>{amount} EUR</strong> "
            "(faellig seit {due_date}). Inklusive Mahngebuehren ({fees} EUR) und Verzugszinsen "
            "belaeuft sich der Gesamtbetrag auf <strong>{total_with_fees} EUR</strong>.</p>"
            "<p><strong>Wir fordern Sie letztmalig auf, den Gesamtbetrag innerhalb von "
            "7 Tagen zu begleichen.</strong> Andernfalls behalten wir uns vor, "
            "den Vorgang an ein Inkassobuero weiterzuleiten oder rechtliche Schritte einzuleiten.</p>"
            "<br><p>Mit freundlichen Gruessen,<br>Ihr RechnungsWerk Team</p>"
            "</body></html>"
        ),
    },
}


def send_team_invite(
    to_email: str,
    org_name: str,
    inviter_name: str,
    invite_url: str,
) -> bool:
    """Send a team invitation email via Brevo transactional API.

    Returns True on success, False on failure or if API key not configured.
    """
    if not settings.brevo_api_key:
        logger.warning(
            "Brevo API key not configured, skipping team invite email to %s",
            to_email,
        )
        return False

    import sib_api_v3_sdk

    api = _get_transactional_api()

    html_content = (
        "<html><body>"
        "<h2>Team-Einladung</h2>"
        f"<p><strong>{inviter_name}</strong> hat Sie eingeladen, dem Team "
        f"<strong>{org_name}</strong> bei RechnungsWerk beizutreten.</p>"
        "<p>Klicken Sie auf den folgenden Link, um die Einladung anzunehmen:</p>"
        f'<p><a href="{invite_url}">{invite_url}</a></p>'
        "<p>Dieser Link ist 7 Tage gueltig.</p>"
        "<br><p>Ihr RechnungsWerk Team</p>"
        "</body></html>"
    )

    email = sib_api_v3_sdk.SendSmtpEmail(
        to=[{"email": to_email}],
        sender=SENDER,
        subject=f"Einladung zum Team {org_name} - RechnungsWerk",
        html_content=html_content,
    )

    try:
        api.send_transac_email(email)
        logger.info("Team invite email sent to %s for org %s", to_email, org_name)
        return True
    except Exception as e:
        logger.error("Failed to send team invite email to %s: %s", to_email, e)
        return False


def send_contact_email(name: str, email: str, subject: str, message: str) -> bool:
    """Send contact form submission to admin. Silent if not configured."""
    if not settings.brevo_api_key:
        logger.warning("Brevo API key not configured, skipping contact email from %s", email)
        return False

    import sib_api_v3_sdk

    api = _get_transactional_api()

    html_content = (
        "<html><body>"
        "<h2>Neue Kontaktanfrage ueber RechnungsWerk</h2>"
        f"<p><strong>Name:</strong> {name}</p>"
        f"<p><strong>E-Mail:</strong> {email}</p>"
        f"<p><strong>Betreff:</strong> {subject}</p>"
        "<hr>"
        f"<p>{message.replace(chr(10), '<br>')}</p>"
        "</body></html>"
    )

    email_obj = sib_api_v3_sdk.SendSmtpEmail(
        to=[{"email": "contact@rechnungswerk.de", "name": "RechnungsWerk Support"}],
        reply_to={"email": email, "name": name},
        sender=SENDER,
        subject=f"[Kontaktformular] {subject} — von {name}",
        html_content=html_content,
    )

    try:
        api.send_transac_email(email_obj)
        logger.info("Contact email sent from %s (%s)", name, email)
        return True
    except Exception as e:
        logger.error("Failed to send contact email from %s: %s", email, e)
        return False


def send_mahnung_email(
    to_email: str,
    customer_name: str,
    invoice_number: str,
    level: int,
    amount: float,
    due_date: str,
    fees: float,
) -> bool:
    """Send a dunning email via Brevo transactional API.

    Different tone templates based on level:
      - Level 1 (Zahlungserinnerung): Friendly reminder
      - Level 2 (1. Mahnung): Formal demand
      - Level 3 (2. Mahnung): Urgent with fees notice

    Returns True on success, False on failure or if API key not configured.
    """
    if not settings.brevo_api_key:
        logger.warning(
            "Brevo API key not configured, skipping Mahnung email (level %d) to %s",
            level, to_email,
        )
        return False

    template = _MAHNUNG_TEMPLATES.get(level)
    if not template:
        logger.error("No Mahnung email template for level %d", level)
        return False

    import sib_api_v3_sdk

    api = _get_transactional_api()

    total_with_fees = amount + fees
    replacements = {
        "customer_name": customer_name,
        "invoice_number": invoice_number,
        "amount": f"{amount:.2f}",
        "due_date": due_date,
        "fees": f"{fees:.2f}",
        "total_with_fees": f"{total_with_fees:.2f}",
    }

    subject = template["subject"].format(**replacements)
    html_content = template["html"].format(**replacements)

    email = sib_api_v3_sdk.SendSmtpEmail(
        to=[{"email": to_email}],
        sender=SENDER,
        subject=subject,
        html_content=html_content,
    )

    try:
        api.send_transac_email(email)
        logger.info("Mahnung email (level %d) sent to %s for invoice %s", level, to_email, invoice_number)
        return True
    except Exception as e:
        logger.error("Failed to send Mahnung email (level %d) to %s: %s", level, to_email, e)
        return False


def send_invoice_portal_email(
    to_email: str,
    buyer_name: str,
    invoice_number: str,
    portal_url: str,
    invoice_date: str = "",
    gross_amount: str = "",
) -> bool:
    """Send invoice portal link to customer via Brevo."""
    if not settings.brevo_api_key:
        logger.warning(
            "Brevo API key not configured, skipping invoice portal email to %s", to_email
        )
        return False

    import sib_api_v3_sdk
    api = _get_transactional_api()

    html_content = (
        "<html><body>"
        f"<p>Sehr geehrte/r {buyer_name},</p>"
        f"<p>anbei finden Sie Ihre Rechnung <strong>{invoice_number}</strong>"
        + (f" vom {invoice_date}" if invoice_date else "")
        + (f" über <strong>{gross_amount} EUR</strong>" if gross_amount else "")
        + ".</p>"
        "<p>Sie können Ihre Rechnung über den folgenden Link einsehen, "
        "herunterladen und Ihre Zahlung bestätigen:</p>"
        f'<p><a href="https://rechnungswerk.io{portal_url}" '
        'style="background:#14b8a6;color:white;padding:12px 24px;border-radius:6px;'
        'text-decoration:none;font-weight:bold;">Rechnung ansehen</a></p>'
        "<p>Der Link ist 30 Tage gültig.</p>"
        "<br><p>Mit freundlichen Grüßen,<br>Ihr RechnungsWerk Team</p>"
        "</body></html>"
    )

    email = sib_api_v3_sdk.SendSmtpEmail(
        to=[{"email": to_email}],
        sender=SENDER,
        subject=f"Ihre Rechnung {invoice_number}",
        html_content=html_content,
    )

    try:
        api.send_transac_email(email)
        logger.info(
            "Invoice portal email sent to %s for invoice %s", to_email, invoice_number
        )
        return True
    except Exception as e:
        logger.error(
            "Failed to send invoice portal email to %s: %s", to_email, e
        )
        return False


async def enqueue_email(arq_pool, task_type: str, **kwargs) -> bool:
    """Enqueue an email task via ARQ if pool is available, else send synchronously."""
    if arq_pool is not None:
        await arq_pool.enqueue_job("send_email_task", task_type, **kwargs)
        return True
    # Synchronous fallback
    handlers = {
        "password_reset": send_password_reset_email,
        "email_verification": send_email_verification,
        "team_invite": send_team_invite,
        "mahnung": send_mahnung_email,
        "contact": send_contact_email,
        "invoice_portal": send_invoice_portal_email,
    }
    handler = handlers.get(task_type)
    if handler:
        return handler(**kwargs)
    return False
