"""Tests for Phase 12 Stripe Connect service functions."""
import pytest
from unittest.mock import patch, MagicMock


def test_create_connect_account_returns_url():
    """create_connect_onboarding_url creates account + link, returns url and account_id."""
    mock_account = MagicMock()
    mock_account.id = "acct_test_001"
    mock_account_link = MagicMock()
    mock_account_link.url = "https://connect.stripe.com/setup/e/acct_test_001/abc"

    with patch("app.stripe_service.stripe.Account.create", return_value=mock_account), \
         patch("app.stripe_service.stripe.AccountLink.create", return_value=mock_account_link):
        from app.stripe_service import create_connect_onboarding_url
        result = create_connect_onboarding_url(
            existing_account_id=None,
            return_url="https://rechnungswerk.de/dashboard/settings?stripe_connected=1",
            refresh_url="https://rechnungswerk.de/dashboard/settings?stripe_refresh=1",
        )
    assert result["url"] == "https://connect.stripe.com/setup/e/acct_test_001/abc"
    assert result["account_id"] == "acct_test_001"


def test_create_connect_account_reuses_existing_id():
    """If existing_account_id provided, skips Account.create."""
    mock_account_link = MagicMock()
    mock_account_link.url = "https://connect.stripe.com/setup/e/acct_existing/xyz"

    with patch("app.stripe_service.stripe.Account.create") as mock_create, \
         patch("app.stripe_service.stripe.AccountLink.create", return_value=mock_account_link):
        from app.stripe_service import create_connect_onboarding_url
        result = create_connect_onboarding_url(
            existing_account_id="acct_existing",
            return_url="https://rechnungswerk.de/dashboard/settings?stripe_connected=1",
            refresh_url="https://rechnungswerk.de/dashboard/settings?stripe_refresh=1",
        )
    mock_create.assert_not_called()
    assert result["account_id"] == "acct_existing"


def test_get_connect_account_status_onboarded():
    """Returns onboarded=True when charges_enabled and details_submitted."""
    mock_account = MagicMock()
    mock_account.charges_enabled = True
    mock_account.details_submitted = True
    mock_account.payouts_enabled = True

    with patch("app.stripe_service.stripe.Account.retrieve", return_value=mock_account):
        from app.stripe_service import get_connect_account_status
        result = get_connect_account_status("acct_test_001")
    assert result["onboarded"] is True
    assert result["charges_enabled"] is True


def test_get_connect_account_status_not_onboarded():
    """Returns onboarded=False when charges not enabled."""
    mock_account = MagicMock()
    mock_account.charges_enabled = False
    mock_account.details_submitted = False
    mock_account.payouts_enabled = False

    with patch("app.stripe_service.stripe.Account.retrieve", return_value=mock_account):
        from app.stripe_service import get_connect_account_status
        result = get_connect_account_status("acct_test_001")
    assert result["onboarded"] is False


def test_create_portal_payment_intent_returns_client_secret():
    """Returns client_secret and intent_id."""
    mock_intent = MagicMock()
    mock_intent.id = "pi_test_001"
    mock_intent.client_secret = "pi_test_001_secret_abc"
    mock_intent.status = "requires_payment_method"

    with patch("app.stripe_service.stripe.PaymentIntent.create", return_value=mock_intent):
        from app.stripe_service import create_portal_payment_intent
        result = create_portal_payment_intent(
            amount_cents=10000,
            currency="EUR",
            connected_account_id="acct_test_001",
            fee_cents=50,
            metadata={"invoice_id": "123"},
        )
    assert result["client_secret"] == "pi_test_001_secret_abc"
    assert result["intent_id"] == "pi_test_001"
    assert result["status"] == "requires_payment_method"


def test_create_portal_payment_intent_passes_correct_params():
    """Verifies application_fee_amount and transfer_data are passed to Stripe."""
    mock_intent = MagicMock()
    mock_intent.id = "pi_test_002"
    mock_intent.client_secret = "pi_test_002_secret"
    mock_intent.status = "requires_payment_method"

    with patch("app.stripe_service.stripe.PaymentIntent.create", return_value=mock_intent) as mock_create:
        from app.stripe_service import create_portal_payment_intent
        create_portal_payment_intent(
            amount_cents=11900,
            currency="EUR",
            connected_account_id="acct_dest_001",
            fee_cents=60,
            metadata={"invoice_id": "456"},
        )
    call_kwargs = mock_create.call_args[1]
    assert call_kwargs["amount"] == 11900
    assert call_kwargs["application_fee_amount"] == 60
    assert call_kwargs["transfer_data"] == {"destination": "acct_dest_001"}
    assert call_kwargs["currency"] == "eur"
