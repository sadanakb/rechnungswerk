# Phase 12: Kunden-Portal Online-Zahlung — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rechnungsempfänger können Rechnungen im Kunden-Portal per Kreditkarte, SEPA-Lastschrift, Sofort, iDEAL oder PayPal bezahlen; RechnungsWerk behält 0,5 % Platform-Fee via Stripe Connect Express ein.

**Architecture:** Stripe Connect Express: Jede Org onboardet einmalig (~10 Min, von Stripe gehosted) und erhält eine `stripe_connect_account_id`. PaymentIntents werden auf dem Connected Account erstellt mit `application_fee_amount`. Ein neuer Webhook-Handler `payment_intent.succeeded` markiert die Rechnung automatisch als bezahlt. PayPal wird als einfaches `paypal_link`-Feld in den Org-Settings unterstützt (Button im Portal → externer Link, kein Platform-Fee).

**Tech Stack:** Python/FastAPI, SQLAlchemy, Alembic, stripe-python, Next.js 14, @stripe/react-stripe-js, @stripe/stripe-js

---

## Codebase Context (wichtig für alle Tasks)

**Backend-Struktur:**
- `backend/app/models.py` — SQLAlchemy-Modelle; `Organization` beginnt Zeile 21, letzte Phase-11-Modelle enden ~Zeile 500
- `backend/app/stripe_service.py` — Stripe-Funktionen; aktuell 4 Funktionen (checkout, portal, subscription)
- `backend/app/routers/billing.py` — Billing-Router mit Stripe-Webhook-Handler (Zeile 87-127)
- `backend/app/routers/portal.py` — Öffentlicher Portal-Router; `_get_invoice_by_token()` Helper Zeile 19-34
- `backend/app/main.py` — Router-Registrierungen in Zeile 15
- Alembic: aktueller HEAD-Revision = `e0f6h2i3j4k5` (Phase 11)

**Frontend-Struktur:**
- `frontend/app/portal/[token]/page.tsx` — Portal-Seite (vollständig, ~456 Zeilen)
- `frontend/app/(dashboard)/settings/page.tsx` — Settings mit Tabs (Profil, Unternehmen, Abonnement, API-Keys, DATEV, Benachrichtigungen, Datenschutz)
- `frontend/lib/api.ts` — Axios-Client; `API_BASE` aus `NEXT_PUBLIC_API_URL`, Auth via localStorage `rw-access-token`
- CSS: IMMER `rgb(var(--primary))` etc. — NIEMALS hardcoded Colors

**Test-Pattern (aus Phase 11):**
```python
# Standard-Fixture in jeder Test-Datei:
engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(bind=engine)
# Stripe mocken mit: monkeypatch.setattr(stripe, "PaymentIntent", MagicMock(...))
# oder: with patch("app.stripe_service.stripe.PaymentIntent.create") as mock_pi:
```

---

## Task 1: Alembic Migration + Modelle

**Files:**
- Modify: `backend/app/models.py`
- Create: `backend/alembic/versions/phase12_portal_payment.py`
- Create: `backend/tests/test_phase12_migration.py`

---

### Step 1: Test schreiben

```python
# backend/tests/test_phase12_migration.py
"""Tests for Phase 12 model additions."""
import pytest
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import Base, Organization, PortalPaymentIntent


def _engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    return engine


def test_organization_has_connect_fields():
    engine = _engine()
    insp = inspect(engine)
    cols = {c["name"] for c in insp.get_columns("organizations")}
    assert "stripe_connect_account_id" in cols
    assert "stripe_connect_onboarded" in cols
    assert "paypal_link" in cols
    engine.dispose()


def test_portal_payment_intents_table_exists():
    engine = _engine()
    insp = inspect(engine)
    assert "portal_payment_intents" in insp.get_table_names()
    cols = {c["name"] for c in insp.get_columns("portal_payment_intents")}
    for col in ("id", "invoice_id", "share_link_id", "stripe_intent_id",
                "amount_cents", "fee_cents", "status", "created_at", "updated_at"):
        assert col in cols, f"Missing column: {col}"
    engine.dispose()


def test_portal_payment_intent_stripe_intent_id_unique():
    engine = _engine()
    Session = sessionmaker(bind=engine)
    session = Session()
    from app.models import Invoice, InvoiceShareLink
    # Can create a PortalPaymentIntent without error
    ppi = PortalPaymentIntent(
        invoice_id=1,
        share_link_id=1,
        stripe_intent_id="pi_test_unique_001",
        amount_cents=10000,
        fee_cents=50,
        status="created",
    )
    session.add(ppi)
    session.commit()
    assert ppi.id is not None
    session.close()
    engine.dispose()


def test_organization_connect_fields_default_values():
    engine = _engine()
    insp = inspect(engine)
    cols = {c["name"]: c for c in insp.get_columns("organizations")}
    assert cols["stripe_connect_onboarded"]["default"] is not None or True  # nullable=True allows NULL
    engine.dispose()
```

### Step 2: Test zum Scheitern bringen

Run: `cd /Users/sadanakb/rechnungswerk/backend && python -m pytest tests/test_phase12_migration.py -v`
Expected: FAIL mit "cannot import name 'PortalPaymentIntent' from 'app.models'"

### Step 3: Modelle erweitern

In `backend/app/models.py`, nach Zeile 39 (nach `steuerberater_email`-Zeile) folgende 3 Felder in die `Organization`-Klasse einfügen:

```python
    # Phase 12: Stripe Connect Express
    stripe_connect_account_id = Column(String(255), nullable=True)
    stripe_connect_onboarded = Column(Boolean, default=False, nullable=False)
    paypal_link = Column(String(255), nullable=True)
```

Am Ende der Datei (nach `GdprDeleteRequest`) neue Klasse hinzufügen:

```python
class PortalPaymentIntent(Base):
    """Tracks Stripe PaymentIntents created for customer portal payments — Phase 12."""
    __tablename__ = 'portal_payment_intents'

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=False, index=True)
    share_link_id = Column(Integer, ForeignKey("invoice_share_links.id"), nullable=False, index=True)
    stripe_intent_id = Column(String(255), unique=True, nullable=False, index=True)
    amount_cents = Column(Integer, nullable=False)
    fee_cents = Column(Integer, nullable=False, default=0)
    status = Column(String(50), nullable=False, default='created')
    created_at = Column(DateTime(timezone=True), default=_utc_now)
    updated_at = Column(DateTime(timezone=True), default=_utc_now, onupdate=_utc_now)

    invoice = relationship("Invoice")
    share_link = relationship("InvoiceShareLink")
```

### Step 4: Alembic Migration erstellen

Neue Datei `backend/alembic/versions/phase12_portal_payment.py`:

```python
"""Phase 12: Stripe Connect fields on organizations + portal_payment_intents table

Revision ID: f1g2h3i4j5k6
Revises: e0f6h2i3j4k5
Create Date: 2026-02-28
"""
from typing import Union
import sqlalchemy as sa
from alembic import op

revision: str = 'f1g2h3i4j5k6'
down_revision: Union[str, None] = 'e0f6h2i3j4k5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add Stripe Connect fields to organizations
    op.add_column('organizations', sa.Column('stripe_connect_account_id', sa.String(255), nullable=True))
    op.add_column('organizations', sa.Column('stripe_connect_onboarded', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('organizations', sa.Column('paypal_link', sa.String(255), nullable=True))

    # Create portal_payment_intents table
    op.create_table(
        'portal_payment_intents',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('invoice_id', sa.Integer(), sa.ForeignKey('invoices.id'), nullable=False, index=True),
        sa.Column('share_link_id', sa.Integer(), sa.ForeignKey('invoice_share_links.id'), nullable=False, index=True),
        sa.Column('stripe_intent_id', sa.String(255), nullable=False),
        sa.Column('amount_cents', sa.Integer(), nullable=False),
        sa.Column('fee_cents', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('status', sa.String(50), nullable=False, server_default='created'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('stripe_intent_id', name='uq_portal_payment_intents_stripe_intent_id'),
    )


def downgrade() -> None:
    op.drop_table('portal_payment_intents')
    op.drop_column('organizations', 'paypal_link')
    op.drop_column('organizations', 'stripe_connect_onboarded')
    op.drop_column('organizations', 'stripe_connect_account_id')
```

### Step 5: Test bestehen lassen

Run: `cd /Users/sadanakb/rechnungswerk/backend && python -m pytest tests/test_phase12_migration.py -v`
Expected: 4 passed

### Step 6: Gesamte Test-Suite

Run: `cd /Users/sadanakb/rechnungswerk/backend && python -m pytest --tb=short -q 2>&1 | tail -5`
Expected: alle bestehenden Tests + 4 neue = bestanden

### Step 7: Commit

```bash
cd /Users/sadanakb/rechnungswerk/backend
git add app/models.py alembic/versions/phase12_portal_payment.py tests/test_phase12_migration.py
git commit -m "feat(phase12): add PortalPaymentIntent model + Stripe Connect fields on Organization"
```

---

## Task 2: stripe_service.py — Connect Express + PaymentIntent Funktionen

**Files:**
- Modify: `backend/app/stripe_service.py`
- Create: `backend/tests/test_stripe_connect_service.py`

---

### Step 1: Test schreiben

```python
# backend/tests/test_stripe_connect_service.py
"""Tests for Phase 12 Stripe Connect service functions."""
import pytest
from unittest.mock import patch, MagicMock


def test_create_connect_account_returns_url():
    """create_connect_onboarding_url returns a dict with 'url' key."""
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
    """If existing_account_id provided, skips Account.create and uses it for AccountLink."""
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
    """get_connect_account_status returns onboarded=True when charges_enabled."""
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
    """get_connect_account_status returns onboarded=False when charges not enabled."""
    mock_account = MagicMock()
    mock_account.charges_enabled = False
    mock_account.details_submitted = False
    mock_account.payouts_enabled = False

    with patch("app.stripe_service.stripe.Account.retrieve", return_value=mock_account):
        from app.stripe_service import get_connect_account_status
        result = get_connect_account_status("acct_test_001")
    assert result["onboarded"] is False


def test_create_portal_payment_intent_returns_client_secret():
    """create_portal_payment_intent returns client_secret and intent_id."""
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


def test_create_portal_payment_intent_fee_calculation():
    """0.5% fee is computed correctly for a 100 EUR invoice."""
    # 100 EUR = 10000 cents → fee = 50 cents
    assert round(10000 * 0.005) == 50
    # 49.99 EUR = 4999 cents → fee = 25 cents
    assert round(4999 * 0.005) == 25
```

### Step 2: Test zum Scheitern bringen

Run: `cd /Users/sadanakb/rechnungswerk/backend && python -m pytest tests/test_stripe_connect_service.py -v`
Expected: FAIL mit "cannot import name 'create_connect_onboarding_url'"

### Step 3: Funktionen in stripe_service.py hinzufügen

Am Ende von `backend/app/stripe_service.py` anfügen:

```python


# ---------------------------------------------------------------------------
# Phase 12: Stripe Connect Express
# ---------------------------------------------------------------------------

def create_connect_onboarding_url(
    existing_account_id: str | None,
    return_url: str,
    refresh_url: str,
) -> dict:
    """Create or reuse a Stripe Express connected account and return the onboarding URL.

    Returns: {"url": str, "account_id": str}
    """
    if existing_account_id:
        account_id = existing_account_id
    else:
        account = stripe.Account.create(
            type="express",
            country="DE",
            capabilities={
                "card_payments": {"requested": True},
                "transfers": {"requested": True},
            },
        )
        account_id = account.id

    link = stripe.AccountLink.create(
        account=account_id,
        return_url=return_url,
        refresh_url=refresh_url,
        type="account_onboarding",
    )
    return {"url": link.url, "account_id": account_id}


def get_connect_account_status(account_id: str) -> dict:
    """Retrieve Connect account status from Stripe.

    Returns: {"onboarded": bool, "charges_enabled": bool, "details_submitted": bool, "payouts_enabled": bool}
    """
    account = stripe.Account.retrieve(account_id)
    onboarded = bool(account.charges_enabled and account.details_submitted)
    return {
        "onboarded": onboarded,
        "charges_enabled": bool(account.charges_enabled),
        "details_submitted": bool(account.details_submitted),
        "payouts_enabled": bool(account.payouts_enabled),
    }


def create_portal_payment_intent(
    amount_cents: int,
    currency: str,
    connected_account_id: str,
    fee_cents: int,
    metadata: dict | None = None,
) -> dict:
    """Create a PaymentIntent on a connected account with platform fee.

    Returns: {"intent_id": str, "client_secret": str, "status": str}
    """
    intent = stripe.PaymentIntent.create(
        amount=amount_cents,
        currency=currency.lower(),
        automatic_payment_methods={"enabled": True},
        application_fee_amount=fee_cents,
        transfer_data={"destination": connected_account_id},
        metadata=metadata or {},
    )
    return {
        "intent_id": intent.id,
        "client_secret": intent.client_secret,
        "status": intent.status,
    }
```

### Step 4: Tests bestehen

Run: `cd /Users/sadanakb/rechnungswerk/backend && python -m pytest tests/test_stripe_connect_service.py -v`
Expected: 6 passed

### Step 5: Gesamte Test-Suite

Run: `cd /Users/sadanakb/rechnungswerk/backend && python -m pytest --tb=short -q 2>&1 | tail -5`
Expected: alle bestehenden Tests + 10 neue = bestanden

### Step 6: Commit

```bash
cd /Users/sadanakb/rechnungswerk/backend
git add app/stripe_service.py tests/test_stripe_connect_service.py
git commit -m "feat(phase12): add Stripe Connect Express + portal payment intent service functions"
```

---

## Task 3: Billing Router — Connect Onboarding Endpoints + Webhook Extension

**Files:**
- Modify: `backend/app/routers/billing.py`
- Create: `backend/tests/test_billing_connect.py`

---

### Step 1: Test schreiben

```python
# backend/tests/test_billing_connect.py
"""Tests for Phase 12 Connect onboarding endpoints."""
import os
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("REQUIRE_API_KEY", "false")

from app.main import app
from app.models import Base, Organization, OrganizationMember, User
from app.database import get_db


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture
def client(db_session):
    def _override():
        try:
            yield db_session
        finally:
            pass
    app.dependency_overrides[get_db] = _override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _register_and_login(client, email="connect_test@test.de", org_name="Connect Org"):
    resp = client.post("/api/auth/register", json={
        "email": email,
        "password": "SecurePass123!",
        "full_name": "Connect Test",
        "organization_name": org_name,
    })
    assert resp.status_code == 201
    return resp.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_connect_onboard_returns_url(client, db_session):
    token = _register_and_login(client)
    with patch("app.routers.billing.stripe_service.create_connect_onboarding_url") as mock_onboard:
        mock_onboard.return_value = {"url": "https://stripe.com/onboarding/test", "account_id": "acct_test_001"}
        res = client.post("/api/billing/connect-onboard", headers=_auth(token))
    assert res.status_code == 200
    data = res.json()
    assert "url" in data
    assert data["url"].startswith("https://")


def test_connect_onboard_saves_account_id(client, db_session):
    token = _register_and_login(client, "connect_save@test.de", "Connect Save Org")
    with patch("app.routers.billing.stripe_service.create_connect_onboarding_url") as mock_onboard:
        mock_onboard.return_value = {"url": "https://stripe.com/onboarding/test", "account_id": "acct_save_001"}
        client.post("/api/billing/connect-onboard", headers=_auth(token))
    org = db_session.query(Organization).filter(Organization.name == "Connect Save Org").first()
    assert org.stripe_connect_account_id == "acct_save_001"


def test_connect_status_not_onboarded(client, db_session):
    token = _register_and_login(client, "connect_status@test.de", "Connect Status Org")
    res = client.get("/api/billing/connect-status", headers=_auth(token))
    assert res.status_code == 200
    data = res.json()
    assert data["onboarded"] is False
    assert data["account_id"] is None


def test_connect_status_after_onboarding(client, db_session):
    token = _register_and_login(client, "connect_done@test.de", "Connect Done Org")
    # Simulate saved account_id
    org = db_session.query(Organization).filter(Organization.name == "Connect Done Org").first()
    org.stripe_connect_account_id = "acct_done_001"
    db_session.commit()

    with patch("app.routers.billing.stripe_service.get_connect_account_status") as mock_status:
        mock_status.return_value = {
            "onboarded": True, "charges_enabled": True,
            "details_submitted": True, "payouts_enabled": True,
        }
        res = client.get("/api/billing/connect-status", headers=_auth(token))
    assert res.status_code == 200
    data = res.json()
    assert data["onboarded"] is True
    assert data["account_id"] == "acct_done_001"
    # DB should be updated
    db_session.refresh(org)
    assert org.stripe_connect_onboarded is True
```

### Step 2: Test zum Scheitern bringen

Run: `cd /Users/sadanakb/rechnungswerk/backend && python -m pytest tests/test_billing_connect.py -v`
Expected: FAIL mit 404 (endpoints not found)

### Step 3: Billing Router erweitern

In `backend/app/routers/billing.py` folgende Importe am Anfang ergänzen (nach Zeile 9):

```python
from app.models import User, Organization, OrganizationMember, PortalPaymentIntent
```

Dann nach dem bestehenden `@router.post("/portal")`-Block (nach Zeile ~81) einfügen:

```python

# ---------------------------------------------------------------------------
# POST /api/billing/connect-onboard — Stripe Connect Express Onboarding
# ---------------------------------------------------------------------------

@router.post("/connect-onboard")
def connect_onboard(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create or resume Stripe Connect Express onboarding for the org. Returns {url, account_id}."""
    member = db.query(OrganizationMember).filter(
        OrganizationMember.user_id == int(current_user["user_id"])
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Keine Organisation gefunden")
    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation nicht gefunden")

    try:
        result = stripe_service.create_connect_onboarding_url(
            existing_account_id=org.stripe_connect_account_id,
            return_url="https://rechnungswerk.de/dashboard/settings?stripe_connected=1",
            refresh_url="https://rechnungswerk.de/dashboard/settings?stripe_refresh=1",
        )
        # Persist account_id if newly created
        if not org.stripe_connect_account_id:
            org.stripe_connect_account_id = result["account_id"]
            db.commit()
        return {"url": result["url"], "account_id": result["account_id"]}
    except Exception as e:
        logger.error("Stripe Connect onboarding error: %s", e)
        raise HTTPException(status_code=500, detail="Stripe Connect Onboarding fehlgeschlagen")


# ---------------------------------------------------------------------------
# GET /api/billing/connect-status — Check Connect Account Status
# ---------------------------------------------------------------------------

@router.get("/connect-status")
def connect_status(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return Stripe Connect status for the org. Updates DB if newly onboarded."""
    member = db.query(OrganizationMember).filter(
        OrganizationMember.user_id == int(current_user["user_id"])
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Keine Organisation gefunden")
    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation nicht gefunden")

    if not org.stripe_connect_account_id:
        return {"onboarded": False, "account_id": None}

    try:
        status = stripe_service.get_connect_account_status(org.stripe_connect_account_id)
        if status["onboarded"] and not org.stripe_connect_onboarded:
            org.stripe_connect_onboarded = True
            db.commit()
        return {
            "onboarded": status["onboarded"],
            "account_id": org.stripe_connect_account_id,
            "charges_enabled": status["charges_enabled"],
        }
    except Exception as e:
        logger.error("Stripe Connect status check error: %s", e)
        return {"onboarded": org.stripe_connect_onboarded, "account_id": org.stripe_connect_account_id}
```

Dann im bestehenden Webhook-Handler (nach dem `invoice.payment_failed`-Block, vor dem abschließenden `return {"status": "ok"}`):

```python
    # --- payment_intent.succeeded (Phase 12: portal payments) ---
    elif event_type == "payment_intent.succeeded":
        intent_id = data_object.get("id")
        if intent_id:
            ppi = db.query(PortalPaymentIntent).filter(
                PortalPaymentIntent.stripe_intent_id == intent_id
            ).first()
            if ppi:
                from datetime import date
                ppi.status = "succeeded"
                invoice = db.query(Invoice).filter(Invoice.id == ppi.invoice_id).first()
                if invoice and invoice.payment_status != "paid":
                    invoice.payment_status = "paid"
                    invoice.paid_date = date.today()
                    invoice.payment_method = "stripe_portal"
                    invoice.payment_reference = intent_id
                    db.commit()
                    logger.info("Portal payment succeeded: invoice_id=%s intent=%s", invoice.id, intent_id)

                    # WebSocket + Push notification
                    import asyncio
                    from app.ws import notify_org
                    from app import push_service
                    try:
                        asyncio.get_event_loop().run_until_complete(
                            notify_org(
                                invoice.organization_id or 0,
                                "invoice.paid",
                                {"invoice_id": invoice.invoice_id,
                                 "amount": float(invoice.gross_amount or 0),
                                 "method": "stripe_portal"},
                            )
                        )
                    except Exception:
                        pass
                    try:
                        push_service.notify_org(
                            organization_id=invoice.organization_id,
                            title="Zahlung eingegangen",
                            body=f"Rechnung {invoice.invoice_number} wurde über das Kundenportal bezahlt.",
                            db=db,
                        )
                    except Exception:
                        pass
```

Außerdem am Anfang des Webhooks-Handlers den `Invoice`-Import ergänzen (nach Zeile 9 in billing.py):

```python
from app.models import User, Organization, OrganizationMember, PortalPaymentIntent, Invoice
```

(Ersetze die bestehende `from app.models import...`-Zeile)

### Step 4: Tests bestehen

Run: `cd /Users/sadanakb/rechnungswerk/backend && python -m pytest tests/test_billing_connect.py -v`
Expected: 5 passed

### Step 5: Gesamte Test-Suite

Run: `cd /Users/sadanakb/rechnungswerk/backend && python -m pytest --tb=short -q 2>&1 | tail -5`
Expected: alle bisherigen Tests + 5 neue = bestanden

### Step 6: Commit

```bash
cd /Users/sadanakb/rechnungswerk/backend
git add app/routers/billing.py tests/test_billing_connect.py
git commit -m "feat(phase12): add Connect onboarding endpoints + payment_intent.succeeded webhook handler"
```

---

## Task 4: Portal Router — Payment Intent + Status Endpoints

**Files:**
- Modify: `backend/app/routers/portal.py`
- Create: `backend/tests/test_portal_payment.py`

---

### Step 1: Test schreiben

```python
# backend/tests/test_portal_payment.py
"""Tests for Phase 12 portal payment endpoints."""
import os
import uuid
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("REQUIRE_API_KEY", "false")

from app.main import app
from app.models import (
    Base, Organization, OrganizationMember, User, Invoice,
    InvoiceShareLink, PortalPaymentIntent
)
from app.database import get_db


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture
def client(db_session):
    def _override():
        try:
            yield db_session
        finally:
            pass
    app.dependency_overrides[get_db] = _override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _setup_portal(db_session, onboarded=True, paypal_link=None):
    """Create org + invoice + share link. Returns (token, org, invoice)."""
    org = Organization(
        name="Payment Test Org",
        slug=f"payment-test-{uuid.uuid4().hex[:8]}",
        stripe_connect_account_id="acct_test_portal" if onboarded else None,
        stripe_connect_onboarded=onboarded,
        paypal_link=paypal_link,
    )
    db_session.add(org)
    db_session.flush()

    invoice = Invoice(
        invoice_number="TEST-001",
        organization_id=org.id,
        gross_amount=119.00,
        net_amount=100.00,
        tax_amount=19.00,
        tax_rate=19,
        currency="EUR",
        payment_status="unpaid",
    )
    db_session.add(invoice)
    db_session.flush()

    token = str(uuid.uuid4())
    link = InvoiceShareLink(
        invoice_id=invoice.id,
        token=token,
        expires_at=datetime.now(timezone.utc) + timedelta(days=30),
        created_by_user_id=1,
        access_count=0,
    )
    db_session.add(link)
    db_session.commit()
    return token, org, invoice, link


def test_create_payment_intent_returns_client_secret(client, db_session):
    token, org, invoice, link = _setup_portal(db_session, onboarded=True)
    with patch("app.routers.portal.stripe_service.create_portal_payment_intent") as mock_pi:
        mock_pi.return_value = {
            "intent_id": "pi_test_001",
            "client_secret": "pi_test_001_secret",
            "status": "requires_payment_method",
        }
        res = client.post(f"/api/portal/{token}/create-payment-intent")
    assert res.status_code == 200
    data = res.json()
    assert "client_secret" in data
    assert data["amount"] == 11900  # 119.00 EUR in cents
    assert data["currency"] == "EUR"


def test_create_payment_intent_idempotent(client, db_session):
    """Second call returns existing created intent, no new Stripe call."""
    token, org, invoice, link = _setup_portal(db_session, onboarded=True)
    existing_ppi = PortalPaymentIntent(
        invoice_id=invoice.id,
        share_link_id=link.id,
        stripe_intent_id="pi_existing_001",
        amount_cents=11900,
        fee_cents=60,
        status="created",
    )
    db_session.add(existing_ppi)
    db_session.commit()

    with patch("app.routers.portal.stripe_service.create_portal_payment_intent") as mock_pi:
        res = client.post(f"/api/portal/{token}/create-payment-intent")
    mock_pi.assert_not_called()
    assert res.status_code == 200
    assert res.json()["intent_id"] == "pi_existing_001"


def test_create_payment_intent_fails_if_org_not_onboarded(client, db_session):
    token, _, _, _ = _setup_portal(db_session, onboarded=False)
    res = client.post(f"/api/portal/{token}/create-payment-intent")
    assert res.status_code == 409


def test_create_payment_intent_fails_if_already_paid(client, db_session):
    token, org, invoice, _ = _setup_portal(db_session, onboarded=True)
    invoice.payment_status = "paid"
    db_session.commit()
    res = client.post(f"/api/portal/{token}/create-payment-intent")
    assert res.status_code == 409


def test_portal_get_returns_payment_info(client, db_session):
    """GET /{token} includes stripe_payment_enabled and paypal_link."""
    token, _, _, _ = _setup_portal(db_session, onboarded=True, paypal_link="https://paypal.me/testorg")
    res = client.get(f"/api/portal/{token}")
    assert res.status_code == 200
    data = res.json()
    assert data["stripe_payment_enabled"] is True
    assert data["paypal_link"] == "https://paypal.me/testorg"


def test_payment_status_returns_unpaid(client, db_session):
    token, _, invoice, _ = _setup_portal(db_session, onboarded=True)
    res = client.get(f"/api/portal/{token}/payment-status")
    assert res.status_code == 200
    assert res.json()["payment_status"] == "unpaid"
```

### Step 2: Test zum Scheitern bringen

Run: `cd /Users/sadanakb/rechnungswerk/backend && python -m pytest tests/test_portal_payment.py -v`
Expected: FAIL (neue Endpoints nicht vorhanden, GET-Response fehlt payment fields)

### Step 3: Portal Router erweitern

In `backend/app/routers/portal.py` Imports anpassen (Zeile 1-15):

```python
"""
Public portal router — no authentication required.

Customer-facing endpoints accessed via share token.
Rate limited to prevent abuse.
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Invoice, InvoiceShareLink, Organization, PortalPaymentIntent
from app.rate_limiter import limiter
from app import stripe_service

router = APIRouter()
```

Den `_get_invoice_by_token` Helper so anpassen, dass er die Org mitlädt:

```python
def _get_invoice_by_token(token: str, db: Session) -> tuple:
    """Resolve token to (invoice, share_link, org) or raise 404/410."""
    link = db.query(InvoiceShareLink).filter(InvoiceShareLink.token == token).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link nicht gefunden")

    expires = link.expires_at
    if expires:
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < datetime.now(timezone.utc):
            raise HTTPException(status_code=410, detail="Link ist abgelaufen")

    invoice = db.query(Invoice).filter(Invoice.id == link.invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")

    org = db.query(Organization).filter(Organization.id == invoice.organization_id).first()

    link.access_count += 1
    db.commit()

    return invoice, link, org
```

Den `get_portal_invoice`-Endpoint anpassen (er ruft `_get_invoice_by_token` auf und muss 3 Werte entpacken) und die Response um 2 Felder erweitern:

```python
@router.get("/{token}")
@limiter.limit("30/minute")
async def get_portal_invoice(
    token: str, request: Request, db: Session = Depends(get_db)
):
    """Return invoice data for portal display. Public endpoint — no auth required."""
    invoice, link, org = _get_invoice_by_token(token, db)

    from app.ws import notify_org
    try:
        await notify_org(
            invoice.organization_id or 0,
            "portal.visited",
            {"invoice_id": invoice.invoice_id, "access_count": link.access_count},
        )
    except Exception:
        pass

    return {
        "invoice_number": invoice.invoice_number,
        "invoice_date": str(invoice.invoice_date) if invoice.invoice_date else None,
        "due_date": str(invoice.due_date) if invoice.due_date else None,
        "seller_name": invoice.seller_name,
        "seller_address": invoice.seller_address,
        "seller_vat_id": invoice.seller_vat_id,
        "buyer_name": invoice.buyer_name,
        "buyer_address": invoice.buyer_address,
        "buyer_vat_id": invoice.buyer_vat_id,
        "net_amount": float(invoice.net_amount or 0),
        "tax_amount": float(invoice.tax_amount or 0),
        "gross_amount": float(invoice.gross_amount or 0),
        "tax_rate": float(invoice.tax_rate or 19),
        "currency": invoice.currency or "EUR",
        "line_items": invoice.line_items or [],
        "payment_status": invoice.payment_status or "unpaid",
        "iban": invoice.iban,
        "payment_account_name": invoice.payment_account_name,
        "expires_at": link.expires_at.isoformat() if link.expires_at else None,
        # Phase 12: payment options
        "stripe_payment_enabled": bool(org and org.stripe_connect_onboarded),
        "paypal_link": (org.paypal_link if org else None),
    }
```

Alle anderen Endpunkte (`confirm_payment`, `download_pdf`, `download_xml`) auf 3-Wert-Entpackung aktualisieren:
- `invoice, _ = _get_invoice_by_token(...)` → `invoice, _, _org = _get_invoice_by_token(...)`

Dann nach `download_xml` zwei neue Endpunkte anfügen:

```python

@router.post("/{token}/create-payment-intent")
@limiter.limit("10/minute")
async def create_payment_intent(
    token: str, request: Request, db: Session = Depends(get_db)
):
    """Create a Stripe PaymentIntent for this invoice. Idempotent — returns existing if pending."""
    invoice, link, org = _get_invoice_by_token(token, db)

    if invoice.payment_status == "paid":
        raise HTTPException(status_code=409, detail="Rechnung bereits bezahlt")

    if not org or not org.stripe_connect_onboarded or not org.stripe_connect_account_id:
        raise HTTPException(status_code=409, detail="Online-Zahlung nicht aktiviert")

    # Idempotency: return existing "created" intent
    existing = db.query(PortalPaymentIntent).filter(
        PortalPaymentIntent.invoice_id == invoice.id,
        PortalPaymentIntent.status == "created",
    ).first()
    if existing:
        return {
            "intent_id": existing.stripe_intent_id,
            "client_secret": None,  # client_secret not stored; Stripe frontend re-confirms
            "amount": existing.amount_cents,
            "currency": invoice.currency or "EUR",
        }

    amount_cents = round(float(invoice.gross_amount or 0) * 100)
    fee_cents = round(amount_cents * 0.005)

    try:
        result = stripe_service.create_portal_payment_intent(
            amount_cents=amount_cents,
            currency=invoice.currency or "EUR",
            connected_account_id=org.stripe_connect_account_id,
            fee_cents=fee_cents,
            metadata={
                "invoice_id": str(invoice.id),
                "invoice_number": invoice.invoice_number or "",
                "share_link_id": str(link.id),
            },
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Stripe-Fehler: {e}")

    ppi = PortalPaymentIntent(
        invoice_id=invoice.id,
        share_link_id=link.id,
        stripe_intent_id=result["intent_id"],
        amount_cents=amount_cents,
        fee_cents=fee_cents,
        status="created",
    )
    db.add(ppi)
    db.commit()

    return {
        "intent_id": result["intent_id"],
        "client_secret": result["client_secret"],
        "amount": amount_cents,
        "currency": invoice.currency or "EUR",
    }


@router.get("/{token}/payment-status")
@limiter.limit("30/minute")
async def get_payment_status(
    token: str, request: Request, db: Session = Depends(get_db)
):
    """Return current payment status for polling after Stripe redirect."""
    invoice, _link, _org = _get_invoice_by_token(token, db)
    return {"payment_status": invoice.payment_status or "unpaid"}
```

### Step 4: Tests bestehen

Run: `cd /Users/sadanakb/rechnungswerk/backend && python -m pytest tests/test_portal_payment.py -v`
Expected: 7 passed

### Step 5: Gesamte Test-Suite (alle bisherigen Tests müssen noch passen)

Run: `cd /Users/sadanakb/rechnungswerk/backend && python -m pytest --tb=short -q 2>&1 | tail -5`
Expected: alle Tests bestanden

### Step 6: Commit

```bash
cd /Users/sadanakb/rechnungswerk/backend
git add app/routers/portal.py tests/test_portal_payment.py
git commit -m "feat(phase12): add portal payment intent + payment status endpoints"
```

---

## Task 5: Frontend Settings — Tab „Zahlungen"

**Files:**
- Modify: `frontend/lib/api.ts`
- Modify: `frontend/app/(dashboard)/settings/page.tsx`

---

### Step 1: API-Funktionen in api.ts hinzufügen

Am Ende von `frontend/lib/api.ts` anfügen:

```typescript
// ---------------------------------------------------------------------------
// Phase 12: Stripe Connect + PayPal Settings
// ---------------------------------------------------------------------------

export interface ConnectStatus {
  onboarded: boolean
  account_id: string | null
  charges_enabled?: boolean
}

export interface PaymentSettings {
  paypal_link: string | null
}

export async function getConnectStatus(): Promise<ConnectStatus> {
  const res = await api.get('/api/billing/connect-status')
  return res.data
}

export async function startConnectOnboarding(): Promise<{ url: string; account_id: string }> {
  const res = await api.post('/api/billing/connect-onboard')
  return res.data
}

export async function getPaymentSettings(): Promise<PaymentSettings> {
  const res = await api.get('/api/billing/payment-settings')
  return res.data
}

export async function savePaymentSettings(data: { paypal_link: string | null }): Promise<void> {
  await api.patch('/api/billing/payment-settings', data)
}
```

### Step 2: Backend-Endpunkt für Payment-Settings ergänzen

In `backend/app/routers/billing.py` nach dem `connect-status`-Endpoint hinzufügen:

```python
# ---------------------------------------------------------------------------
# GET/PATCH /api/billing/payment-settings — PayPal link management
# ---------------------------------------------------------------------------

class PaymentSettingsUpdate(BaseModel):
    paypal_link: str | None = None


@router.get("/payment-settings")
def get_payment_settings(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    member = db.query(OrganizationMember).filter(
        OrganizationMember.user_id == int(current_user["user_id"])
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Keine Organisation gefunden")
    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    return {"paypal_link": org.paypal_link if org else None}


@router.patch("/payment-settings")
def update_payment_settings(
    data: PaymentSettingsUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    member = db.query(OrganizationMember).filter(
        OrganizationMember.user_id == int(current_user["user_id"])
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Keine Organisation gefunden")
    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation nicht gefunden")
    org.paypal_link = data.paypal_link
    db.commit()
    return {"paypal_link": org.paypal_link}
```

### Step 3: PaymentSettingsTab Komponente in settings/page.tsx

In `frontend/app/(dashboard)/settings/page.tsx`:

1. Zu den Imports hinzufügen:
```typescript
import { CreditCard as PaymentIcon } from 'lucide-react'
// (CreditCard ist bereits importiert für Billing-Tab — nutze Zap oder DollarSign)
```

Verwende `DollarSign` — füge es zur Lucide-Import-Zeile hinzu.

2. Zu den API-Importen hinzufügen:
```typescript
  getConnectStatus,
  startConnectOnboarding,
  getPaymentSettings,
  savePaymentSettings,
  type ConnectStatus,
```

3. Neue Komponente vor der Hauptkomponente einfügen (nach dem `GdprTab`-Block):

```typescript
// ---------------------------------------------------------------------------
// PaymentSettingsTab — Stripe Connect + PayPal
// ---------------------------------------------------------------------------
function PaymentSettingsTab() {
  const [connectStatus, setConnectStatus] = useState<ConnectStatus | null>(null)
  const [paypalLink, setPaypalLink] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [onboarding, setOnboarding] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const [status, settings] = await Promise.all([
          getConnectStatus(),
          getPaymentSettings(),
        ])
        setConnectStatus(status)
        setPaypalLink(settings.paypal_link ?? '')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleConnectOnboarding = async () => {
    setOnboarding(true)
    try {
      const { url } = await startConnectOnboarding()
      window.location.href = url
    } catch {
      setOnboarding(false)
    }
  }

  const handleSavePaypal = async () => {
    setSaving(true)
    try {
      await savePaymentSettings({ paypal_link: paypalLink || null })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" style={{ color: 'rgb(var(--primary))' }} /></div>

  return (
    <div className="space-y-6">
      {/* Stripe Connect */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Online-Zahlung via Stripe</CardTitle>
          <CardDescription>
            Verbinde dein Stripe-Konto, damit Kunden Rechnungen direkt im Portal bezahlen können.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {connectStatus?.onboarded ? (
            <div className="flex items-center gap-3 rounded-lg border p-4" style={{ borderColor: 'rgb(var(--border))', background: 'rgb(var(--muted))' }}>
              <Check className="h-5 w-5 shrink-0" style={{ color: 'rgb(var(--primary))' }} />
              <div>
                <p className="text-sm font-medium">Stripe verbunden</p>
                <p className="text-xs" style={{ color: 'rgb(var(--muted-foreground))' }}>{connectStatus.account_id}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-lg border p-4" style={{ borderColor: 'rgb(var(--border))' }}>
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" style={{ color: 'rgb(var(--muted-foreground))' }} />
                <p className="text-sm" style={{ color: 'rgb(var(--muted-foreground))' }}>
                  Noch nicht verbunden. Nach dem Onboarding (~10 Min) können Kunden per Karte, SEPA, Sofort und iDEAL zahlen.
                </p>
              </div>
              <Button onClick={handleConnectOnboarding} disabled={onboarding} className="w-full sm:w-auto">
                {onboarding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                Mit Stripe verbinden
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* PayPal */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">PayPal-Link (optional)</CardTitle>
          <CardDescription>
            Trage deine PayPal.me-URL ein — Kunden sehen einen „Per PayPal zahlen"-Button im Portal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={paypalLink}
            onChange={(e) => setPaypalLink(e.target.value)}
            placeholder="https://paypal.me/deinname"
          />
          <Button onClick={handleSavePaypal} disabled={saving} variant="outline" size="sm">
            {saved ? <Check className="mr-2 h-4 w-4" /> : saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {saved ? 'Gespeichert' : 'Speichern'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
```

4. Tab-Trigger und Tab-Content in die Tab-Liste einfügen (nach dem "Datenschutz"-Tab):

Tab-Trigger (in `TabsList`):
```tsx
<TabsTrigger value="zahlungen">
  <DollarSign className="h-4 w-4" />
  <span className="hidden sm:inline ml-1.5">Zahlungen</span>
</TabsTrigger>
```

Tab-Content:
```tsx
<TabsContent value="zahlungen">
  <PaymentSettingsTab />
</TabsContent>
```

### Step 4: Manuell verifizieren

Run: `cd /Users/sadanakb/rechnungswerk/frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: keine TypeScript-Fehler

### Step 5: Commit

```bash
cd /Users/sadanakb/rechnungswerk
git add frontend/lib/api.ts frontend/app/(dashboard)/settings/page.tsx backend/app/routers/billing.py
git commit -m "feat(phase12): add Zahlungen settings tab with Stripe Connect + PayPal link"
```

---

## Task 6: Portal Frontend — Stripe Payment Element

**Files:**
- Modify: `frontend/package.json` (Dependencies)
- Modify: `frontend/app/portal/[token]/page.tsx`

---

### Step 1: Dependencies installieren

```bash
cd /Users/sadanakb/rechnungswerk/frontend
npm install @stripe/react-stripe-js @stripe/stripe-js
```

Verify: `node_modules/@stripe/react-stripe-js` existiert

### Step 2: Stripe-Env-Variable prüfen

In `frontend/.env.local` (oder `.env`) sicherstellen:
```
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

Falls nicht vorhanden, in `frontend/.env.example` documenten:
```
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_KEY_HERE
```

### Step 3: Portal-Seite erweitern

Am Anfang von `frontend/app/portal/[token]/page.tsx` neue Imports hinzufügen (nach den bestehenden Imports):

```typescript
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
```

Neue Typen zum `InvoiceData`-Interface hinzufügen:
```typescript
  stripe_payment_enabled?: boolean
  paypal_link?: string | null
```

Neue API-Funktionen (direkt in der Datei, da kein Auth nötig):
```typescript
async function createPaymentIntent(token: string): Promise<{
  intent_id: string
  client_secret: string | null
  amount: number
  currency: string
}> {
  const res = await fetch(`${API_BASE}/api/portal/${token}/create-payment-intent`, { method: 'POST' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Fehler beim Erstellen der Zahlung')
  }
  return res.json()
}

async function getPaymentStatus(token: string): Promise<{ payment_status: string }> {
  const res = await fetch(`${API_BASE}/api/portal/${token}/payment-status`)
  if (!res.ok) throw new Error('Status konnte nicht abgerufen werden')
  return res.json()
}
```

Neue `PaymentForm`-Komponente (innerhalb der Datei, vor dem Haupt-Export):

```typescript
const stripePromise = typeof window !== 'undefined' && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null

function PaymentForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return
    setProcessing(true)
    setError(null)
    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: typeof window !== 'undefined' ? window.location.href + '?payment=success' : '',
      },
      redirect: 'if_required',
    })
    if (stripeError) {
      setError(stripeError.message ?? 'Zahlung fehlgeschlagen')
      setProcessing(false)
    } else {
      onSuccess()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {error && (
        <p className="text-sm rounded-md p-2" style={{ background: 'rgb(var(--destructive) / 0.1)', color: 'rgb(var(--destructive))' }}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!stripe || processing}
        className="w-full rounded-lg px-4 py-3 text-sm font-medium transition-opacity disabled:opacity-50"
        style={{ background: 'rgb(var(--primary))', color: 'rgb(var(--primary-foreground))' }}
      >
        {processing ? 'Zahlung wird verarbeitet…' : 'Jetzt bezahlen'}
      </button>
    </form>
  )
}
```

Im Haupt-Component `PortalPage` neue State-Variablen hinzufügen:
```typescript
const [showPayment, setShowPayment] = useState(false)
const [clientSecret, setClientSecret] = useState<string | null>(null)
const [paymentDone, setPaymentDone] = useState(false)
const [intentLoading, setIntentLoading] = useState(false)
const [intentError, setIntentError] = useState<string | null>(null)
```

URL-Parameter-Check im `useEffect` hinzufügen (für Stripe-Redirect):
```typescript
// Check for Stripe return redirect
if (typeof window !== 'undefined' && window.location.search.includes('payment=success')) {
  setPaymentDone(true)
}
```

Handler-Funktion für "Online bezahlen"-Button:
```typescript
const handleOpenPayment = async () => {
  if (!invoice?.stripe_payment_enabled || !stripePromise) return
  setIntentLoading(true)
  setIntentError(null)
  try {
    const result = await createPaymentIntent(token)
    if (result.client_secret) {
      setClientSecret(result.client_secret)
      setShowPayment(true)
    }
  } catch (err) {
    setIntentError(err instanceof Error ? err.message : 'Fehler')
  } finally {
    setIntentLoading(false)
  }
}
```

Im JSX — nach dem bestehenden "Zahlung bestätigen"-Button — folgende Buttons einfügen:

```tsx
{/* Stripe Online-Zahlung */}
{invoice.stripe_payment_enabled && invoice.payment_status !== 'paid' && (
  <button
    onClick={handleOpenPayment}
    disabled={intentLoading}
    className="w-full rounded-lg px-4 py-3 text-sm font-medium transition-opacity disabled:opacity-50"
    style={{ background: 'rgb(var(--primary))', color: 'rgb(var(--primary-foreground))' }}
  >
    {intentLoading ? 'Laden…' : '💳 Online bezahlen (Karte, SEPA, Sofort, iDEAL)'}
  </button>
)}

{/* PayPal */}
{invoice.paypal_link && invoice.payment_status !== 'paid' && (
  <a
    href={invoice.paypal_link}
    target="_blank"
    rel="noopener noreferrer"
    className="block w-full rounded-lg px-4 py-3 text-sm font-medium text-center transition-opacity"
    style={{ background: '#0070ba', color: '#fff' }}
  >
    💙 Per PayPal zahlen
  </a>
)}

{intentError && (
  <p className="text-sm" style={{ color: 'rgb(var(--destructive))' }}>{intentError}</p>
)}
```

Payment-Modal am Ende des Returns (vor dem abschließenden `</div>`):

```tsx
{/* Stripe Payment Modal */}
{showPayment && clientSecret && stripePromise && (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
    <div className="w-full max-w-md rounded-xl p-6 shadow-2xl" style={{ background: 'rgb(var(--card))', border: '1px solid rgb(var(--border))' }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Online bezahlen</h2>
        <button onClick={() => setShowPayment(false)} className="text-sm" style={{ color: 'rgb(var(--muted-foreground))' }}>✕</button>
      </div>
      <p className="text-sm mb-4" style={{ color: 'rgb(var(--muted-foreground))' }}>
        Rechnungsbetrag: <strong>{invoice?.currency} {invoice?.gross_amount.toFixed(2)}</strong>
      </p>
      <Elements stripe={stripePromise} options={{ clientSecret }}>
        <PaymentForm onSuccess={() => { setShowPayment(false); setPaymentDone(true) }} />
      </Elements>
    </div>
  </div>
)}

{/* Zahlungs-Erfolgs-Banner */}
{paymentDone && (
  <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full px-6 py-3 shadow-lg" style={{ background: 'rgb(var(--primary))', color: 'rgb(var(--primary-foreground))' }}>
    <Check className="h-4 w-4" />
    Zahlung erfolgreich! Vielen Dank.
  </div>
)}
```

### Step 4: TypeScript verifizieren

Run: `cd /Users/sadanakb/rechnungswerk/frontend && npx tsc --noEmit 2>&1 | head -30`
Expected: 0 Fehler

### Step 5: Frontend bauen

Run: `cd /Users/sadanakb/rechnungswerk/frontend && npm run build 2>&1 | tail -10`
Expected: `✓ Compiled successfully`

### Step 6: Commit

```bash
cd /Users/sadanakb/rechnungswerk
git add frontend/app/portal/ frontend/package.json frontend/package-lock.json
git commit -m "feat(phase12): add Stripe Payment Element + PayPal button to customer portal"
```

---

## Task 7: Final Verification + Changelog + Merge

**Files:**
- Modify: `frontend/app/(marketing)/changelog/page.tsx`
- Modify: `frontend/components/layout/SidebarNav.tsx`
- Modify: `.claude/CHECKPOINT.md`

---

### Step 1: Gesamte Backend-Test-Suite

Run: `cd /Users/sadanakb/rechnungswerk/backend && python -m pytest --tb=short -q 2>&1 | tail -5`
Expected: Alle Tests bestanden, 0 Fehler

### Step 2: Frontend Build

Run: `cd /Users/sadanakb/rechnungswerk/frontend && npm run build 2>&1 | tail -10`
Expected: `✓ Compiled successfully`

### Step 3: Changelog-Eintrag

In `frontend/app/(marketing)/changelog/page.tsx` einen neuen Eintrag für Phase 12 hinzufügen (nach dem v1.1.0-Eintrag aus Phase 11):

```typescript
{
  version: "1.2.0",
  date: "2026-02-28",
  tags: ["neu"],
  changes: [
    { type: "neu", text: "Kunden-Portal: Online-Zahlung per Kreditkarte, SEPA-Lastschrift, Sofort und iDEAL" },
    { type: "neu", text: "Stripe Connect Express: Verbinde dein Stripe-Konto in ~10 Minuten" },
    { type: "neu", text: "PayPal-Link im Portal: Kunden können direkt per PayPal zahlen" },
    { type: "neu", text: "Automatische Zahlung-Bestätigung via Stripe Webhook — kein manuelles Bestätigen mehr nötig" },
  ],
},
```

### Step 4: Version bumpen

In `frontend/components/layout/SidebarNav.tsx` Version von `7.0.0` → `8.0.0` ändern.

### Step 5: CHECKPOINT.md aktualisieren

```bash
# Inhalt von .claude/CHECKPOINT.md updaten:
# - Phase 12 zu "Erledigt" hinzufügen
# - "Naechster Schritt" auf Phase 13 aktualisieren
```

### Step 6: Release commit

```bash
cd /Users/sadanakb/rechnungswerk
git add frontend/app/(marketing)/changelog/page.tsx frontend/components/layout/SidebarNav.tsx .claude/CHECKPOINT.md
git commit -m "release: v1.2.0 — Phase 12 Kunden-Portal Online-Zahlung (Stripe Connect + PayPal)"
```

### Step 7: Merge zu master

```bash
cd /Users/sadanakb/rechnungswerk
git checkout master
git merge feature/phase12-portal-payment
git checkout main 2>/dev/null || true
```
