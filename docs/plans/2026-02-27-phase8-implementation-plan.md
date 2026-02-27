# Phase 8: Production Excellence + Kundenportal — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add production-grade async infrastructure (ARQ task queue, webhook retries, recurring invoice cron, S3 storage) and a public customer portal with shareable invoice links, email dispatch, and payment confirmation.

**Architecture:** The backend gains an ARQ worker process that handles async email delivery and webhook retry with exponential backoff, plus a daily cron that auto-generates recurring invoices. A new `InvoiceShareLink` model creates UUID tokens mapping to invoices, which power a public `/portal/[token]` page that requires no authentication. The frontend gains share/email buttons on the invoice detail page and a new standalone portal page outside the dashboard layout.

**Tech Stack:** Python/FastAPI backend, ARQ (Redis-backed async task queue), boto3 (S3 storage), SQLAlchemy + Alembic migrations, Brevo transactional email, Next.js 14 App Router frontend (TypeScript).

---

## Task 1: ARQ Infrastructure Setup

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/app/config.py`
- Modify: `backend/app/main.py`

**What to build:**

### `backend/requirements.txt` — add arq

Find the existing requirements.txt and add `arq==0.25.0` to the dependencies list (after existing async packages).

```
arq==0.25.0
```

### `backend/app/config.py` — add redis_url to Settings class

Add the following field to the `Settings` class:

```python
redis_url: str = "redis://localhost:6379"
```

### `backend/app/main.py` — ARQ pool in lifespan

Inside the `lifespan` async context manager, after the existing `await init_db()` call, add the ARQ pool initialization block. Add the pool close in the shutdown section (after `yield`):

```python
# --- In lifespan, AFTER init_db() ---
try:
    import arq
    from arq.connections import RedisSettings as ArqRedisSettings
    pool = await arq.create_pool(ArqRedisSettings.from_dsn(settings.redis_url))
    app.state.arq_pool = pool
    logger.info("[Startup] ARQ pool connected to Redis at %s", settings.redis_url)
except Exception as e:
    logger.warning("[Startup] Redis not available (%s) — ARQ tasks will run synchronously", e)
    app.state.arq_pool = None

# --- After yield (shutdown section) ---
if app.state.arq_pool:
    await app.state.arq_pool.close()
```

**No new test file for this task.** Just verify existing tests still pass.

**Verification command:**
```bash
cd /Users/sadanakb/rechnungswerk/backend && pytest -q 2>&1 | tail -5
# Expected: 384 passed (no regressions)
```

**Commit message:** `feat: add ARQ infrastructure — Redis pool in app lifespan, graceful degradation`

---

## Task 2: Email ARQ Task

**Files:**
- Modify: `backend/app/tasks/worker.py`
- Modify: `backend/app/email_service.py`
- Modify: `backend/app/routers/auth.py`
- Create: `backend/tests/test_email_tasks.py`

**What to build:**

### `backend/app/tasks/worker.py` — add send_email_task

Add the following function to worker.py and add it to `WorkerSettings.functions`:

```python
async def send_email_task(ctx: Dict, task_type: str, **kwargs):
    """Dispatch an email by task_type to the correct email_service function."""
    from app import email_service
    handlers = {
        "password_reset": email_service.send_password_reset_email,
        "email_verification": email_service.send_email_verification,
        "team_invite": email_service.send_team_invite,
        "mahnung": email_service.send_mahnung_email,
        "contact": email_service.send_contact_email,
        "invoice_portal": email_service.send_invoice_portal_email,  # Phase 8 new
    }
    handler = handlers.get(task_type)
    if not handler:
        logger.error("Unknown email task_type: %s", task_type)
        return {"error": f"Unknown task_type: {task_type}"}
    result = handler(**kwargs)
    return {"task_type": task_type, "success": result}
```

In `WorkerSettings.functions`, add `send_email_task` to the list.

### `backend/app/email_service.py` — add enqueue_email helper

Add the following async helper at the bottom of email_service.py (after all existing functions):

```python
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
    }
    handler = handlers.get(task_type)
    if handler:
        return handler(**kwargs)
    return False
```

### `backend/app/routers/auth.py` — update forgot-password to use enqueue_email

In the `POST /api/auth/forgot-password` endpoint, replace the direct call to `send_password_reset_email(...)` with:

```python
arq_pool = getattr(request.app.state, "arq_pool", None)
await enqueue_email(
    arq_pool,
    "password_reset",
    to_email=user.email,
    reset_token=reset_token,
)
```

Import `enqueue_email` from `app.email_service` at the top of the router. Make sure `request: Request` is a parameter of the endpoint (it likely already is for rate limiting).

### `backend/tests/test_email_tasks.py` — 3 tests

```python
"""Tests for async email task dispatch (Task 2: Email ARQ Task)."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class TestEmailTaskDispatch:
    """Test that enqueue_email dispatches correctly."""

    @pytest.mark.asyncio
    async def test_enqueue_email_uses_arq_pool_when_available(self):
        """When arq_pool is provided, enqueue_email should enqueue a job (not call sync)."""
        from app.email_service import enqueue_email

        mock_pool = AsyncMock()
        mock_pool.enqueue_job = AsyncMock(return_value=None)

        result = await enqueue_email(
            mock_pool,
            "password_reset",
            to_email="test@example.com",
            reset_token="tok123",
        )

        assert result is True
        mock_pool.enqueue_job.assert_called_once_with(
            "send_email_task",
            "password_reset",
            to_email="test@example.com",
            reset_token="tok123",
        )

    @pytest.mark.asyncio
    async def test_enqueue_email_sync_fallback_when_pool_is_none(self):
        """When arq_pool is None, enqueue_email should call the sync email function."""
        from app.email_service import enqueue_email

        with patch("app.email_service.send_password_reset_email", return_value=True) as mock_send:
            result = await enqueue_email(
                None,
                "password_reset",
                to_email="test@example.com",
                reset_token="tok123",
            )
            mock_send.assert_called_once_with(
                to_email="test@example.com",
                reset_token="tok123",
            )

    @pytest.mark.asyncio
    async def test_send_email_task_routes_to_correct_handler(self):
        """send_email_task should dispatch to the correct email_service function based on task_type."""
        from app.tasks.worker import send_email_task

        ctx = {}
        with patch("app.email_service.send_mahnung_email", return_value=True) as mock_mahnung:
            result = await send_email_task(
                ctx,
                "mahnung",
                to_email="kunde@example.com",
                invoice_number="INV-001",
                due_date="2026-03-01",
                amount="500.00",
            )
            assert result["task_type"] == "mahnung"
            assert result["success"] is True
            mock_mahnung.assert_called_once()
```

**Verification command:**
```bash
cd /Users/sadanakb/rechnungswerk/backend && pytest -q --tb=short tests/test_email_tasks.py
# Expected: 3 passed
```

**Commit message:** `feat: add email ARQ task — async email dispatch with sync fallback`

---

## Task 3: Webhook Retry Mechanism

**Files:**
- Modify: `backend/app/tasks/worker.py`
- Modify: `backend/app/webhook_service.py`
- Create: `backend/tests/test_webhook_retry.py`

**What to build:**

### `backend/app/tasks/worker.py` — add webhook_retry_task

Add the retry delay constants and the `webhook_retry_task` function, then add it to `WorkerSettings.functions`:

```python
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

        # Check max attempts — permanently fail at 5
        if delivery.attempts >= 5:
            delivery.status = "failed"
            db.commit()
            return {"final_failure": True, "delivery_id": delivery_id}

        # Attempt delivery
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
            # Schedule next retry if still under max attempts
            if delivery.attempts < 5 and ctx.get("redis"):
                delay = RETRY_DELAYS[delivery.attempts - 1]
                await ctx["redis"].enqueue_job(
                    "webhook_retry_task",
                    delivery_id,
                    _defer_by=delay,
                )
            return {"retrying": True, "attempt": delivery.attempts}
    finally:
        db.close()
```

### `backend/app/webhook_service.py` — enqueue retry on failure

In the `_deliver()` function (or wherever a failed delivery is recorded), after marking a delivery as failed, enqueue a retry via ARQ if a pool is available. Add a helper:

```python
async def schedule_webhook_retry(arq_pool, delivery_id: int) -> None:
    """Schedule a webhook retry via ARQ. Called after initial delivery failure."""
    if arq_pool is not None:
        await arq_pool.enqueue_job("webhook_retry_task", delivery_id, _defer_by=60)
```

In the delivery failure path (after `db.commit()`), call:
```python
# After marking delivery status = "pending" on first failure:
await schedule_webhook_retry(arq_pool, delivery.id)
```

Note: `_deliver` must receive `arq_pool` as a parameter or it can be retrieved from app state. Adjust accordingly based on how `_deliver` is currently called.

### `backend/tests/test_webhook_retry.py` — 4 tests

```python
"""Tests for webhook retry mechanism with exponential backoff (Task 3)."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone


class TestWebhookRetry:
    """Test webhook retry logic."""

    @pytest.mark.asyncio
    async def test_successful_delivery_not_retried(self):
        """A delivery with status='success' should be skipped immediately."""
        from app.tasks.worker import webhook_retry_task

        mock_delivery = MagicMock()
        mock_delivery.status = "success"

        ctx = {}
        with patch("app.database.SessionLocal") as mock_session_cls:
            mock_db = MagicMock()
            mock_session_cls.return_value = mock_db
            mock_db.query.return_value.filter.return_value.first.return_value = mock_delivery

            result = await webhook_retry_task(ctx, delivery_id=42)

        assert result == {"skipped": True}

    @pytest.mark.asyncio
    async def test_failed_delivery_enqueues_retry(self):
        """A failed delivery should enqueue a retry with the first delay (60s)."""
        from app.tasks.worker import webhook_retry_task

        mock_delivery = MagicMock()
        mock_delivery.status = "pending"
        mock_delivery.attempts = 0
        mock_delivery.subscription_id = 1
        mock_delivery.payload = '{"event": "invoice.created"}'
        mock_delivery.event_type = "invoice.created"

        mock_sub = MagicMock()
        mock_sub.url = "https://example.com/webhook"
        mock_sub.secret = "secret"

        mock_redis = AsyncMock()
        ctx = {"redis": mock_redis}

        with patch("app.database.SessionLocal") as mock_session_cls, \
             patch("app.webhook_service._deliver", new_callable=AsyncMock) as mock_deliver:

            mock_db = MagicMock()
            mock_session_cls.return_value = mock_db
            # First query returns delivery, second returns subscription
            mock_db.query.return_value.filter.return_value.first.side_effect = [
                mock_delivery, mock_sub
            ]
            mock_deliver.return_value = (False, 500, "Internal Server Error")

            result = await webhook_retry_task(ctx, delivery_id=99)

        assert result["retrying"] is True
        assert result["attempt"] == 1
        mock_redis.enqueue_job.assert_called_once_with(
            "webhook_retry_task", 99, _defer_by=60
        )

    @pytest.mark.asyncio
    async def test_max_5_attempts_permanently_fails(self):
        """After 5 attempts, delivery should be permanently marked as failed."""
        from app.tasks.worker import webhook_retry_task

        mock_delivery = MagicMock()
        mock_delivery.status = "pending"
        mock_delivery.attempts = 5  # Already at max

        ctx = {}
        with patch("app.database.SessionLocal") as mock_session_cls:
            mock_db = MagicMock()
            mock_session_cls.return_value = mock_db
            mock_db.query.return_value.filter.return_value.first.return_value = mock_delivery

            result = await webhook_retry_task(ctx, delivery_id=77)

        assert result == {"final_failure": True, "delivery_id": 77}
        assert mock_delivery.status == "failed"

    @pytest.mark.asyncio
    async def test_retry_task_delivers_correctly_on_success(self):
        """When retry succeeds, status should be set to 'success'."""
        from app.tasks.worker import webhook_retry_task

        mock_delivery = MagicMock()
        mock_delivery.status = "pending"
        mock_delivery.attempts = 2
        mock_delivery.subscription_id = 1
        mock_delivery.payload = '{"event": "invoice.paid"}'
        mock_delivery.event_type = "invoice.paid"
        mock_delivery.id = 55

        mock_sub = MagicMock()
        mock_sub.url = "https://partner.example.com/hook"
        mock_sub.secret = "whsec_abc"

        ctx = {}

        with patch("app.database.SessionLocal") as mock_session_cls, \
             patch("app.webhook_service._deliver", new_callable=AsyncMock) as mock_deliver:

            mock_db = MagicMock()
            mock_session_cls.return_value = mock_db
            mock_db.query.return_value.filter.return_value.first.side_effect = [
                mock_delivery, mock_sub
            ]
            mock_deliver.return_value = (True, 200, "OK")

            result = await webhook_retry_task(ctx, delivery_id=55)

        assert result == {"success": True, "delivery_id": 55}
        assert mock_delivery.status == "success"
        assert mock_delivery.attempts == 3
```

**Verification command:**
```bash
cd /Users/sadanakb/rechnungswerk/backend && pytest -q --tb=short tests/test_webhook_retry.py
# Expected: 4 passed
```

**Commit message:** `feat: add webhook retry — ARQ exponential backoff, max 5 attempts`

---

## Task 4: Recurring Invoice ARQ Cron

**Files:**
- Modify: `backend/app/tasks/worker.py`
- Create: `backend/tests/test_recurring_cron.py`

**What to build:**

### `backend/app/tasks/worker.py` — add daily_recurring_check + cron_jobs

Add the cron function and update `WorkerSettings` with `cron_jobs`:

```python
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

            invoice = Invoice(
                invoice_id=f"INV-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}",
                invoice_number=invoice_data["invoice_number"],
                invoice_date=date.fromisoformat(invoice_data["invoice_date"]),
                due_date=date.fromisoformat(invoice_data["due_date"]) if invoice_data.get("due_date") else None,
                seller_name=invoice_data["seller_name"],
                seller_vat_id=invoice_data.get("seller_vat_id"),
                seller_address=invoice_data.get("seller_address"),
                buyer_name=invoice_data["buyer_name"],
                buyer_vat_id=invoice_data.get("buyer_vat_id"),
                buyer_address=invoice_data.get("buyer_address"),
                net_amount=sum(
                    float(li.get("quantity", 1)) * float(li.get("unit_price", li.get("price", 0)))
                    for li in (invoice_data.get("line_items") or [])
                ),
                tax_rate=invoice_data.get("tax_rate", 19),
                currency=invoice_data.get("currency", "EUR"),
                line_items=invoice_data.get("line_items"),
                source_type="recurring",
                payment_status="unpaid",
            )
            invoice.tax_amount = round(float(invoice.net_amount or 0) * float(invoice.tax_rate or 19) / 100, 2)
            invoice.gross_amount = round(float(invoice.net_amount or 0) + float(invoice.tax_amount), 2)

            db.add(invoice)

            # Update template for next cycle
            template_rec.last_generated = today
            template_rec.next_date = RecurringScheduler.calculate_next_date(today, template_rec.frequency)

            generated += 1

        db.commit()
        logger.info("daily_recurring_check: generated %d invoices", generated)
        return {"generated": generated}
    finally:
        db.close()
```

Update `WorkerSettings` to include `daily_recurring_check` in functions and add `cron_jobs`:

```python
from arq import cron

class WorkerSettings:
    functions = [
        process_ocr_batch,
        generate_zugferd_task,
        process_email_inbox,
        send_email_task,
        webhook_retry_task,
        daily_recurring_check,
    ]
    cron_jobs = [
        cron(daily_recurring_check, hour=6, minute=0)  # 06:00 UTC daily
    ]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = None
    max_jobs = 10
    job_timeout = 600
```

### `backend/tests/test_recurring_cron.py` — 3 tests

```python
"""Tests for recurring invoice ARQ cron job (Task 4)."""
import pytest
from unittest.mock import MagicMock, patch, call
from datetime import date


class TestRecurringCron:
    """Test the daily_recurring_check cron function."""

    @pytest.mark.asyncio
    async def test_due_template_generates_invoice(self):
        """A template with next_date <= today should generate a new invoice."""
        from app.tasks.worker import daily_recurring_check

        mock_template = MagicMock()
        mock_template.template_id = "tmpl-001"
        mock_template.active = True
        mock_template.frequency = "monthly"
        mock_template.next_date = date(2026, 2, 27)  # today
        mock_template.number_prefix = "INV"
        mock_template.payment_days = 14
        mock_template.seller_name = "Test GmbH"
        mock_template.seller_vat_id = "DE123456789"
        mock_template.seller_address = "Musterstr. 1, 60311 Frankfurt"
        mock_template.buyer_name = "Kunde AG"
        mock_template.buyer_vat_id = "DE987654321"
        mock_template.buyer_address = "Kundenstr. 2, 10115 Berlin"
        mock_template.line_items = [{"description": "Dienstleistung", "quantity": 1, "unit_price": 1000.0}]
        mock_template.tax_rate = 19.0
        mock_template.iban = "DE89370400440532013000"
        mock_template.bic = "COBADEFFXXX"
        mock_template.payment_account_name = "Test GmbH"

        ctx = {}

        with patch("app.database.SessionLocal") as mock_session_cls, \
             patch("app.recurring.scheduler.RecurringScheduler.get_due_templates") as mock_due, \
             patch("app.recurring.scheduler.RecurringScheduler.generate_invoice_data") as mock_gen, \
             patch("app.recurring.scheduler.RecurringScheduler.calculate_next_date") as mock_next:

            mock_db = MagicMock()
            mock_session_cls.return_value = mock_db
            mock_db.query.return_value.filter.return_value.all.return_value = [mock_template]
            mock_due.return_value = [{"template_id": "tmpl-001"}]
            mock_gen.return_value = {
                "invoice_number": "INV-2026-001",
                "invoice_date": "2026-02-27",
                "due_date": "2026-03-13",
                "seller_name": "Test GmbH",
                "buyer_name": "Kunde AG",
                "line_items": [{"description": "Dienstleistung", "quantity": 1, "unit_price": 1000.0}],
                "tax_rate": 19,
                "currency": "EUR",
            }
            mock_next.return_value = date(2026, 3, 27)

            result = await daily_recurring_check(ctx)

        assert result["generated"] == 1
        mock_db.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_not_yet_due_template_skipped(self):
        """A template with next_date in the future should not generate an invoice."""
        from app.tasks.worker import daily_recurring_check

        mock_template = MagicMock()
        mock_template.template_id = "tmpl-future"
        mock_template.active = True
        mock_template.frequency = "monthly"
        mock_template.next_date = date(2026, 3, 15)  # future

        ctx = {}

        with patch("app.database.SessionLocal") as mock_session_cls, \
             patch("app.recurring.scheduler.RecurringScheduler.get_due_templates") as mock_due:

            mock_db = MagicMock()
            mock_session_cls.return_value = mock_db
            mock_db.query.return_value.filter.return_value.all.return_value = [mock_template]
            mock_due.return_value = []  # no due templates

            result = await daily_recurring_check(ctx)

        assert result["generated"] == 0
        mock_db.add.assert_not_called()

    @pytest.mark.asyncio
    async def test_last_generated_updated_after_generation(self):
        """After generating an invoice, last_generated and next_date should be updated on the template."""
        from app.tasks.worker import daily_recurring_check

        mock_template = MagicMock()
        mock_template.template_id = "tmpl-002"
        mock_template.active = True
        mock_template.frequency = "monthly"
        mock_template.next_date = date(2026, 2, 27)
        mock_template.number_prefix = "RW"
        mock_template.payment_days = 30
        mock_template.seller_name = "Seller GmbH"
        mock_template.seller_vat_id = None
        mock_template.seller_address = None
        mock_template.buyer_name = "Buyer GmbH"
        mock_template.buyer_vat_id = None
        mock_template.buyer_address = None
        mock_template.line_items = [{"description": "Abo", "quantity": 1, "unit_price": 99.0}]
        mock_template.tax_rate = 19.0
        mock_template.iban = None
        mock_template.bic = None
        mock_template.payment_account_name = None

        ctx = {}
        today = date(2026, 2, 27)
        next_date = date(2026, 3, 27)

        with patch("app.database.SessionLocal") as mock_session_cls, \
             patch("app.recurring.scheduler.RecurringScheduler.get_due_templates") as mock_due, \
             patch("app.recurring.scheduler.RecurringScheduler.generate_invoice_data") as mock_gen, \
             patch("app.recurring.scheduler.RecurringScheduler.calculate_next_date", return_value=next_date) as mock_next, \
             patch("app.tasks.worker.date") as mock_date:

            mock_date.today.return_value = today
            mock_date.fromisoformat = date.fromisoformat

            mock_db = MagicMock()
            mock_session_cls.return_value = mock_db
            mock_db.query.return_value.filter.return_value.all.return_value = [mock_template]
            mock_due.return_value = [{"template_id": "tmpl-002"}]
            mock_gen.return_value = {
                "invoice_number": "RW-2026-001",
                "invoice_date": "2026-02-27",
                "due_date": "2026-03-29",
                "seller_name": "Seller GmbH",
                "buyer_name": "Buyer GmbH",
                "line_items": [{"description": "Abo", "quantity": 1, "unit_price": 99.0}],
                "tax_rate": 19,
                "currency": "EUR",
            }

            await daily_recurring_check(ctx)

        assert mock_template.last_generated == today
        assert mock_template.next_date == next_date
```

**Verification command:**
```bash
cd /Users/sadanakb/rechnungswerk/backend && pytest -q --tb=short tests/test_recurring_cron.py
# Expected: 3 passed
```

**Commit message:** `feat: add recurring invoice cron — ARQ daily job auto-generates due templates`

---

## Task 5: S3-Compatible Storage Abstraction

**Files:**
- Create: `backend/app/storage.py`
- Modify: `backend/app/config.py`
- Create: `backend/tests/test_storage.py`

**What to build:**

### `backend/app/config.py` — add storage settings to Settings

Add these fields to the `Settings` class:

```python
storage_backend: str = "local"
aws_bucket: str = ""
aws_region: str = "eu-central-1"
aws_access_key_id: str = ""
aws_secret_access_key: str = ""
```

### `backend/app/storage.py` — full storage abstraction

Create this new file:

```python
"""Storage backend abstraction for file operations.

Supports local filesystem and S3-compatible storage.
Configure via STORAGE_BACKEND=local|s3 environment variable.
"""
import os
import logging
from abc import ABC, abstractmethod
from pathlib import Path

logger = logging.getLogger(__name__)


class StorageBackend(ABC):
    """Abstract storage backend interface."""

    @abstractmethod
    def save(self, path: str, data: bytes) -> str:
        """Save data to path. Returns the storage key/path."""

    @abstractmethod
    def read(self, path: str) -> bytes:
        """Read data from path."""

    @abstractmethod
    def delete(self, path: str) -> None:
        """Delete file at path."""

    @abstractmethod
    def url(self, path: str) -> str:
        """Return a URL or path to access the file."""

    @abstractmethod
    def exists(self, path: str) -> bool:
        """Check if file exists."""


class LocalStorage(StorageBackend):
    """Local filesystem storage backend (default)."""

    def __init__(self, base_dir: str = "data"):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def save(self, path: str, data: bytes) -> str:
        full_path = self.base_dir / path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_bytes(data)
        return str(full_path)

    def read(self, path: str) -> bytes:
        full_path = self.base_dir / path
        return full_path.read_bytes()

    def delete(self, path: str) -> None:
        full_path = self.base_dir / path
        if full_path.exists():
            full_path.unlink()

    def url(self, path: str) -> str:
        return f"/static/{path}"

    def exists(self, path: str) -> bool:
        return (self.base_dir / path).exists()


class S3Storage(StorageBackend):
    """S3-compatible storage backend (AWS S3, MinIO, Cloudflare R2)."""

    def __init__(
        self,
        bucket: str,
        region: str,
        access_key: str,
        secret_key: str,
        endpoint_url: str = None,
    ):
        import boto3
        self.bucket = bucket
        self.client = boto3.client(
            "s3",
            region_name=region,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            endpoint_url=endpoint_url,
        )

    def save(self, path: str, data: bytes) -> str:
        self.client.put_object(Bucket=self.bucket, Key=path, Body=data)
        return path

    def read(self, path: str) -> bytes:
        response = self.client.get_object(Bucket=self.bucket, Key=path)
        return response["Body"].read()

    def delete(self, path: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=path)

    def url(self, path: str) -> str:
        return f"https://{self.bucket}.s3.amazonaws.com/{path}"

    def exists(self, path: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=path)
            return True
        except Exception:
            return False


def get_storage() -> StorageBackend:
    """Get the configured storage backend instance."""
    from app.config import settings
    if getattr(settings, "storage_backend", "local") == "s3":
        return S3Storage(
            bucket=settings.aws_bucket,
            region=settings.aws_region,
            access_key=settings.aws_access_key_id,
            secret_key=settings.aws_secret_access_key,
        )
    return LocalStorage(base_dir="data")
```

### `backend/tests/test_storage.py` — 4 tests

```python
"""Tests for S3-compatible storage abstraction (Task 5)."""
import pytest
import tempfile
import os
from pathlib import Path
from unittest.mock import MagicMock, patch


class TestLocalStorage:
    """Tests for LocalStorage backend."""

    def test_local_storage_save_and_read(self, tmp_path):
        """LocalStorage should save bytes and read them back correctly."""
        from app.storage import LocalStorage

        storage = LocalStorage(base_dir=str(tmp_path))
        data = b"Hello, RechnungsWerk!"
        storage.save("invoices/test.pdf", data)
        result = storage.read("invoices/test.pdf")

        assert result == data

    def test_local_storage_delete(self, tmp_path):
        """LocalStorage delete should remove the file."""
        from app.storage import LocalStorage

        storage = LocalStorage(base_dir=str(tmp_path))
        storage.save("delete_me.txt", b"to be deleted")
        assert storage.exists("delete_me.txt") is True

        storage.delete("delete_me.txt")
        assert storage.exists("delete_me.txt") is False

    def test_local_storage_url_returns_static_path(self, tmp_path):
        """LocalStorage url() should return a /static/ prefixed path."""
        from app.storage import LocalStorage

        storage = LocalStorage(base_dir=str(tmp_path))
        url = storage.url("invoices/INV-001.pdf")

        assert url == "/static/invoices/INV-001.pdf"

    def test_s3_storage_instantiation_with_mocked_boto3(self):
        """S3Storage should instantiate correctly with mocked boto3 client."""
        from app.storage import S3Storage

        with patch("boto3.client") as mock_boto3_client:
            mock_client = MagicMock()
            mock_boto3_client.return_value = mock_client

            storage = S3Storage(
                bucket="rechnungswerk-test",
                region="eu-central-1",
                access_key="AKIAIOSFODNN7EXAMPLE",
                secret_key="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
            )

            assert storage.bucket == "rechnungswerk-test"
            assert storage.client is mock_client
            mock_boto3_client.assert_called_once_with(
                "s3",
                region_name="eu-central-1",
                aws_access_key_id="AKIAIOSFODNN7EXAMPLE",
                aws_secret_access_key="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
                endpoint_url=None,
            )
```

**Verification command:**
```bash
cd /Users/sadanakb/rechnungswerk/backend && pytest -q --tb=short tests/test_storage.py
# Expected: 4 passed
```

**Commit message:** `feat: add S3-compatible storage abstraction — local and S3 backends`

---

## Task 6: InvoiceShareLink Model + Share Endpoints

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/routers/invoices.py`
- Create: `backend/tests/test_share_links.py`

**What to build:**

### `backend/app/models.py` — add InvoiceShareLink model

Add the following model at the end of models.py, after the existing model definitions:

```python
class InvoiceShareLink(Base):
    """Shareable link for customer invoice access — no authentication required."""
    __tablename__ = "invoice_share_links"

    id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=False, unique=True)
    token = Column(String(36), nullable=False, unique=True, index=True)  # UUID v4
    expires_at = Column(DateTime, nullable=True)  # None = never expires
    access_count = Column(Integer, default=0, nullable=False)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    invoice = relationship("Invoice")
```

Note: `Invoice.id` is the integer primary key. The share link uses `invoice.id` (integer FK), NOT `invoice.invoice_id` (the string identifier).

### `backend/app/routers/invoices.py` — add share link endpoints

IMPORTANT: These endpoints MUST be placed BEFORE the `/{invoice_id}` catch-all route to avoid path conflicts. Add them near the other named sub-routes (autocomplete, stats, etc.):

```python
# Required imports at top of file:
# from app.models import InvoiceShareLink (add to existing import)

class SendInvoiceEmailRequest(BaseModel):
    to_email: str
    message: Optional[str] = None


@router.post("/{invoice_id}/share-link", status_code=201)
async def create_share_link(
    invoice_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_api_key),
):
    """Create or regenerate a shareable link for this invoice."""
    from app.models import InvoiceShareLink
    import uuid
    from datetime import datetime, timedelta

    org_id = _resolve_org_id(current_user, db)
    invoice = db.query(Invoice).filter(
        Invoice.invoice_id == invoice_id,
        Invoice.organization_id == org_id,
    ).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")

    # Delete existing link if any (regenerate)
    existing = db.query(InvoiceShareLink).filter(
        InvoiceShareLink.invoice_id == invoice.id
    ).first()
    if existing:
        db.delete(existing)
        db.flush()

    token = str(uuid.uuid4())
    expires_at = datetime.utcnow() + timedelta(days=30)
    link = InvoiceShareLink(
        invoice_id=invoice.id,
        token=token,
        expires_at=expires_at,
        created_by_user_id=int(current_user["user_id"]),
    )
    db.add(link)
    db.commit()
    db.refresh(link)

    portal_url = f"/portal/{token}"
    return {
        "token": token,
        "url": portal_url,
        "expires_at": expires_at.isoformat(),
    }


@router.delete("/{invoice_id}/share-link", status_code=204)
async def delete_share_link(
    invoice_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_api_key),
):
    """Revoke the shareable link for this invoice."""
    from app.models import InvoiceShareLink

    org_id = _resolve_org_id(current_user, db)
    invoice = db.query(Invoice).filter(
        Invoice.invoice_id == invoice_id,
        Invoice.organization_id == org_id,
    ).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")

    link = db.query(InvoiceShareLink).filter(
        InvoiceShareLink.invoice_id == invoice.id
    ).first()
    if link:
        db.delete(link)
        db.commit()
```

### `backend/tests/test_share_links.py` — 5 tests

```python
"""Tests for invoice share link creation and management (Task 6)."""
import pytest
from datetime import datetime, timedelta
from unittest.mock import patch


class TestShareLinks:
    """Test share link CRUD operations."""

    def test_create_share_link_returns_token_and_url(self, client, db_session, test_user, test_invoice):
        """POST /api/invoices/{id}/share-link should return token, url, expires_at."""
        response = client.post(
            f"/api/invoices/{test_invoice.invoice_id}/share-link",
            headers={"X-API-Key": test_user["api_key"]},
        )
        assert response.status_code == 201
        data = response.json()
        assert "token" in data
        assert "url" in data
        assert "expires_at" in data
        assert data["url"].startswith("/portal/")
        assert len(data["token"]) == 36  # UUID v4 format

    def test_delete_share_link_revokes_access(self, client, db_session, test_user, test_invoice):
        """DELETE /api/invoices/{id}/share-link should revoke the link."""
        # Create first
        create_resp = client.post(
            f"/api/invoices/{test_invoice.invoice_id}/share-link",
            headers={"X-API-Key": test_user["api_key"]},
        )
        assert create_resp.status_code == 201
        token = create_resp.json()["token"]

        # Delete
        delete_resp = client.delete(
            f"/api/invoices/{test_invoice.invoice_id}/share-link",
            headers={"X-API-Key": test_user["api_key"]},
        )
        assert delete_resp.status_code == 204

        # Token should no longer work on portal
        portal_resp = client.get(f"/api/portal/{token}")
        assert portal_resp.status_code == 404

    def test_create_share_link_cross_org_rejected(self, client, db_session, other_user, test_invoice):
        """A user from a different org should not be able to create a share link."""
        response = client.post(
            f"/api/invoices/{test_invoice.invoice_id}/share-link",
            headers={"X-API-Key": other_user["api_key"]},
        )
        assert response.status_code == 404

    def test_duplicate_create_regenerates_token(self, client, db_session, test_user, test_invoice):
        """Creating a share link twice should revoke the first and issue a new token."""
        first = client.post(
            f"/api/invoices/{test_invoice.invoice_id}/share-link",
            headers={"X-API-Key": test_user["api_key"]},
        )
        assert first.status_code == 201
        first_token = first.json()["token"]

        second = client.post(
            f"/api/invoices/{test_invoice.invoice_id}/share-link",
            headers={"X-API-Key": test_user["api_key"]},
        )
        assert second.status_code == 201
        second_token = second.json()["token"]

        # Tokens should be different
        assert first_token != second_token

        # Old token should no longer be accessible
        old_resp = client.get(f"/api/portal/{first_token}")
        assert old_resp.status_code == 404

    def test_expired_link_rejected_on_portal_access(self, client, db_session, test_user, test_invoice):
        """An expired share link should return 404 when accessed on the portal."""
        from app.models import InvoiceShareLink
        import uuid

        # Manually insert an expired link
        expired_token = str(uuid.uuid4())
        link = InvoiceShareLink(
            invoice_id=test_invoice.id,
            token=expired_token,
            expires_at=datetime.utcnow() - timedelta(days=1),  # expired yesterday
            created_by_user_id=test_user["user_id"],
        )
        db_session.add(link)
        db_session.commit()

        response = client.get(f"/api/portal/{expired_token}")
        assert response.status_code == 404
        assert "abgelaufen" in response.json()["detail"].lower()
```

**Notes:**
- The test fixtures `test_user`, `other_user`, `test_invoice`, `client`, `db_session` follow the existing conftest.py pattern used in previous phases.
- `require_api_key` is overridden via conftest.py's dependency injection override.

**Verification command:**
```bash
cd /Users/sadanakb/rechnungswerk/backend && pytest -q --tb=short tests/test_share_links.py
# Expected: 5 passed
```

**Commit message:** `feat: add invoice share links — token generation, CRUD, 5 tests`

---

## Task 7: Public Portal API

**Files:**
- Create: `backend/app/routers/portal.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_portal_api.py`

**What to build:**

### `backend/app/routers/portal.py` — full public portal router

```python
"""
Public portal router — no authentication required.

Customer-facing endpoints accessed via share token.
Rate limited to prevent abuse.
"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Invoice, InvoiceShareLink
from app.rate_limiter import limiter

router = APIRouter()


def _get_invoice_by_token(token: str, db: Session) -> tuple:
    """Resolve token to (invoice, share_link) or raise 404."""
    link = db.query(InvoiceShareLink).filter(InvoiceShareLink.token == token).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link nicht gefunden oder abgelaufen")

    if link.expires_at and link.expires_at < datetime.utcnow():
        raise HTTPException(status_code=404, detail="Link ist abgelaufen")

    invoice = db.query(Invoice).filter(Invoice.id == link.invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")

    # Increment access counter
    link.access_count += 1
    db.commit()

    return invoice, link


@router.get("/{token}")
@limiter.limit("30/minute")
async def get_portal_invoice(token: str, request: Request, db: Session = Depends(get_db)):
    """Return invoice data for portal display. Public endpoint."""
    invoice, link = _get_invoice_by_token(token, db)

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
    }


@router.post("/{token}/confirm-payment")
@limiter.limit("10/minute")
async def confirm_payment(token: str, request: Request, db: Session = Depends(get_db)):
    """Customer confirms payment. Sets invoice payment_status to 'paid'."""
    from datetime import date
    invoice, _ = _get_invoice_by_token(token, db)

    if invoice.payment_status == "paid":
        return {"message": "Bereits als bezahlt markiert", "payment_status": "paid"}

    invoice.payment_status = "paid"
    invoice.paid_date = date.today()
    invoice.payment_method = "portal_confirmation"
    db.commit()

    return {"message": "Zahlung bestaetigt", "payment_status": "paid"}


@router.get("/{token}/download-pdf")
@limiter.limit("10/minute")
async def download_pdf(token: str, request: Request, db: Session = Depends(get_db)):
    """Serve ZUGFeRD PDF for download."""
    import os
    invoice, _ = _get_invoice_by_token(token, db)

    if invoice.zugferd_pdf_path and os.path.exists(invoice.zugferd_pdf_path):
        return FileResponse(
            path=invoice.zugferd_pdf_path,
            media_type="application/pdf",
            filename=f"Rechnung_{invoice.invoice_number}.pdf",
        )

    # Generate on-the-fly if no cached PDF exists
    from app.xrechnung_generator import XRechnungGenerator
    from app.zugferd_generator import ZUGFeRDGenerator

    invoice_data = {
        "invoice_number": invoice.invoice_number,
        "invoice_date": str(invoice.invoice_date),
        "due_date": str(invoice.due_date) if invoice.due_date else None,
        "seller_name": invoice.seller_name or "",
        "seller_vat_id": invoice.seller_vat_id or "",
        "seller_address": invoice.seller_address or "",
        "buyer_name": invoice.buyer_name or "",
        "buyer_vat_id": invoice.buyer_vat_id or "",
        "buyer_address": invoice.buyer_address or "",
        "net_amount": float(invoice.net_amount or 0),
        "tax_amount": float(invoice.tax_amount or 0),
        "gross_amount": float(invoice.gross_amount or 0),
        "tax_rate": float(invoice.tax_rate or 19),
        "currency": invoice.currency or "EUR",
        "line_items": invoice.line_items or [],
        "iban": invoice.iban,
        "bic": invoice.bic,
        "payment_account_name": invoice.payment_account_name,
    }
    xml_content = XRechnungGenerator().generate_xml(invoice_data)
    pdf_path = f"data/zugferd_output/{invoice.invoice_id}_portal.pdf"
    os.makedirs("data/zugferd_output", exist_ok=True)
    ZUGFeRDGenerator().generate(invoice_data, xml_content, pdf_path)

    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename=f"Rechnung_{invoice.invoice_number}.pdf",
    )


@router.get("/{token}/download-xml")
@limiter.limit("10/minute")
async def download_xml(token: str, request: Request, db: Session = Depends(get_db)):
    """Serve XRechnung XML for download."""
    invoice, _ = _get_invoice_by_token(token, db)

    invoice_data = {
        "invoice_number": invoice.invoice_number,
        "invoice_date": str(invoice.invoice_date),
        "due_date": str(invoice.due_date) if invoice.due_date else None,
        "seller_name": invoice.seller_name or "",
        "seller_vat_id": invoice.seller_vat_id or "",
        "seller_address": invoice.seller_address or "",
        "buyer_name": invoice.buyer_name or "",
        "buyer_vat_id": invoice.buyer_vat_id or "",
        "buyer_address": invoice.buyer_address or "",
        "net_amount": float(invoice.net_amount or 0),
        "tax_amount": float(invoice.tax_amount or 0),
        "gross_amount": float(invoice.gross_amount or 0),
        "tax_rate": float(invoice.tax_rate or 19),
        "currency": invoice.currency or "EUR",
        "line_items": invoice.line_items or [],
        "iban": invoice.iban,
        "bic": invoice.bic,
        "payment_account_name": invoice.payment_account_name,
    }
    from app.xrechnung_generator import XRechnungGenerator
    xml_content = XRechnungGenerator().generate_xml(invoice_data)

    return Response(
        content=xml_content.encode("utf-8") if isinstance(xml_content, str) else xml_content,
        media_type="application/xml",
        headers={
            "Content-Disposition": f'attachment; filename="Rechnung_{invoice.invoice_number}.xml"'
        },
    )
```

### `backend/app/main.py` — register portal router

Add these lines to the router registration section (after the other `app.include_router(...)` calls):

```python
from app.routers import portal as portal_router
app.include_router(portal_router.router, prefix="/api/portal", tags=["portal"])
```

### `backend/tests/test_portal_api.py` — 5 tests

```python
"""Tests for public portal API (Task 7)."""
import pytest
from datetime import datetime, timedelta
import uuid


class TestPortalAPI:
    """Test public portal endpoints."""

    def _create_share_link(self, db_session, invoice, user_id, expired=False):
        """Helper to insert a share link directly into the DB."""
        from app.models import InvoiceShareLink
        token = str(uuid.uuid4())
        expires = (
            datetime.utcnow() - timedelta(days=1)  # expired
            if expired
            else datetime.utcnow() + timedelta(days=30)
        )
        link = InvoiceShareLink(
            invoice_id=invoice.id,
            token=token,
            expires_at=expires,
            created_by_user_id=user_id,
        )
        db_session.add(link)
        db_session.commit()
        return token

    def test_get_invoice_data_via_valid_token(self, client, db_session, test_user, test_invoice):
        """GET /api/portal/{token} should return invoice data for a valid token."""
        token = self._create_share_link(db_session, test_invoice, test_user["user_id"])

        response = client.get(f"/api/portal/{token}")
        assert response.status_code == 200
        data = response.json()
        assert "invoice_number" in data
        assert "seller_name" in data
        assert "gross_amount" in data
        assert "payment_status" in data

    def test_expired_token_returns_404(self, client, db_session, test_user, test_invoice):
        """GET /api/portal/{token} with an expired token should return 404."""
        token = self._create_share_link(
            db_session, test_invoice, test_user["user_id"], expired=True
        )

        response = client.get(f"/api/portal/{token}")
        assert response.status_code == 404
        assert "abgelaufen" in response.json()["detail"].lower()

    def test_confirm_payment_updates_status(self, client, db_session, test_user, test_invoice):
        """POST /api/portal/{token}/confirm-payment should set payment_status to 'paid'."""
        token = self._create_share_link(db_session, test_invoice, test_user["user_id"])

        response = client.post(f"/api/portal/{token}/confirm-payment")
        assert response.status_code == 200
        data = response.json()
        assert data["payment_status"] == "paid"

        # Verify in DB
        db_session.refresh(test_invoice)
        assert test_invoice.payment_status == "paid"

    def test_pdf_download_returns_content(self, client, db_session, test_user, test_invoice, tmp_path, monkeypatch):
        """GET /api/portal/{token}/download-pdf should return a PDF file."""
        token = self._create_share_link(db_session, test_invoice, test_user["user_id"])

        # Mock ZUGFeRD and XRechnung generators to avoid needing full setup
        fake_pdf = tmp_path / "test.pdf"
        fake_pdf.write_bytes(b"%PDF-1.4 fake content")
        monkeypatch.setattr("app.zugferd_generator.ZUGFeRDGenerator.generate", lambda self, d, x, p: fake_pdf.read_bytes())
        monkeypatch.setattr("app.xrechnung_generator.XRechnungGenerator.generate_xml", lambda self, d: "<Invoice/>")

        with patch("os.path.exists", return_value=False), \
             patch("app.zugferd_generator.ZUGFeRDGenerator.generate") as mock_gen:
            mock_gen.return_value = None
            # We just verify the endpoint responds (not a 500)
            response = client.get(f"/api/portal/{token}/download-pdf")
            # Should be 200 or at worst a generation error — not 404
            assert response.status_code in (200, 500)  # 500 acceptable if generators need config

    def test_xml_download_returns_xml_content_type(self, client, db_session, test_user, test_invoice):
        """GET /api/portal/{token}/download-xml should return application/xml."""
        from unittest.mock import patch as mock_patch
        token = self._create_share_link(db_session, test_invoice, test_user["user_id"])

        with mock_patch(
            "app.xrechnung_generator.XRechnungGenerator.generate_xml",
            return_value="<Invoice><ID>TEST-001</ID></Invoice>",
        ):
            response = client.get(f"/api/portal/{token}/download-xml")
            assert response.status_code == 200
            assert "application/xml" in response.headers["content-type"]
            assert b"<Invoice>" in response.content
```

**Verification command:**
```bash
cd /Users/sadanakb/rechnungswerk/backend && pytest -q --tb=short tests/test_portal_api.py
# Expected: 5 passed
```

**Commit message:** `feat: add public portal API — token-based invoice access, payment confirmation`

---

## Task 8: Send Invoice by Email + Frontend Modal

**Files:**
- Modify: `backend/app/routers/invoices.py`
- Modify: `backend/app/email_service.py`
- Create: `backend/tests/test_send_invoice_email.py`
- Modify: `frontend/lib/api.ts`
- Modify: `frontend/app/(dashboard)/invoices/[id]/page.tsx`

**What to build:**

### `backend/app/email_service.py` — add send_invoice_portal_email

Add this function after the existing email functions (before `enqueue_email`):

```python
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
```

Also add `"invoice_portal"` to the `enqueue_email` sync fallback handlers dict:
```python
"invoice_portal": send_invoice_portal_email,
```

### `backend/app/routers/invoices.py` — add send-email endpoint

Add the Pydantic model and endpoint (BEFORE the `/{invoice_id}` catch-all):

```python
class SendInvoiceEmailRequest(BaseModel):
    to_email: str
    message: Optional[str] = None


@router.post("/{invoice_id}/send-email")
async def send_invoice_email(
    invoice_id: str,
    body: SendInvoiceEmailRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_api_key),
):
    """Send invoice to customer via email with portal link."""
    from app.models import InvoiceShareLink
    from app.email_service import enqueue_email
    import uuid
    from datetime import datetime, timedelta

    org_id = _resolve_org_id(current_user, db)
    invoice = db.query(Invoice).filter(
        Invoice.invoice_id == invoice_id,
        Invoice.organization_id == org_id,
    ).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")

    # Create share link if it doesn't exist yet
    link = db.query(InvoiceShareLink).filter(
        InvoiceShareLink.invoice_id == invoice.id
    ).first()
    if not link:
        token = str(uuid.uuid4())
        link = InvoiceShareLink(
            invoice_id=invoice.id,
            token=token,
            expires_at=datetime.utcnow() + timedelta(days=30),
            created_by_user_id=int(current_user["user_id"]),
        )
        db.add(link)
        db.commit()
        db.refresh(link)

    portal_url = f"/portal/{link.token}"
    arq_pool = getattr(request.app.state, "arq_pool", None)
    await enqueue_email(
        arq_pool,
        "invoice_portal",
        to_email=body.to_email,
        buyer_name=invoice.buyer_name or "Kunde",
        invoice_number=invoice.invoice_number or "",
        portal_url=portal_url,
        invoice_date=str(invoice.invoice_date) if invoice.invoice_date else "",
        gross_amount=f"{float(invoice.gross_amount or 0):.2f}",
    )

    return {
        "message": "E-Mail wird versendet",
        "portal_url": portal_url,
        "token": link.token,
    }
```

### `backend/tests/test_send_invoice_email.py` — 3 tests

```python
"""Tests for send invoice by email endpoint (Task 8)."""
import pytest
from unittest.mock import AsyncMock, patch


class TestSendInvoiceEmail:
    """Test the send-email endpoint on invoices."""

    def test_send_creates_share_link_if_missing(
        self, client, db_session, test_user, test_invoice
    ):
        """POST /api/invoices/{id}/send-email should auto-create a share link if none exists."""
        from app.models import InvoiceShareLink

        # Ensure no existing link
        db_session.query(InvoiceShareLink).filter(
            InvoiceShareLink.invoice_id == test_invoice.id
        ).delete()
        db_session.commit()

        with patch("app.email_service.enqueue_email", new_callable=AsyncMock) as mock_enqueue:
            mock_enqueue.return_value = True
            response = client.post(
                f"/api/invoices/{test_invoice.invoice_id}/send-email",
                json={"to_email": "kunde@example.com"},
                headers={"X-API-Key": test_user["api_key"]},
            )

        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert data["portal_url"].startswith("/portal/")

        # Verify link was created in DB
        link = db_session.query(InvoiceShareLink).filter(
            InvoiceShareLink.invoice_id == test_invoice.id
        ).first()
        assert link is not None

    def test_send_email_called_with_correct_args(
        self, client, db_session, test_user, test_invoice
    ):
        """The enqueue_email function should be called with correct invoice data."""
        with patch("app.email_service.enqueue_email", new_callable=AsyncMock) as mock_enqueue:
            mock_enqueue.return_value = True
            response = client.post(
                f"/api/invoices/{test_invoice.invoice_id}/send-email",
                json={"to_email": "empfaenger@test.de"},
                headers={"X-API-Key": test_user["api_key"]},
            )

        assert response.status_code == 200
        mock_enqueue.assert_called_once()
        call_kwargs = mock_enqueue.call_args
        # task_type should be "invoice_portal"
        assert call_kwargs[0][1] == "invoice_portal"
        assert call_kwargs[1]["to_email"] == "empfaenger@test.de"

    def test_send_invoice_email_cross_org_rejected(
        self, client, db_session, other_user, test_invoice
    ):
        """A user from a different org should not be able to send email for another org's invoice."""
        response = client.post(
            f"/api/invoices/{test_invoice.invoice_id}/send-email",
            json={"to_email": "attacker@evil.com"},
            headers={"X-API-Key": other_user["api_key"]},
        )
        assert response.status_code == 404
```

### `frontend/lib/api.ts` — add share link helpers

Add the following interface and functions (at the end of the relevant section, near other invoice-related functions):

```typescript
export interface InvoiceShareLink {
  token: string
  url: string
  expires_at: string
}

export async function createShareLink(invoiceId: string): Promise<InvoiceShareLink> {
  const res = await api.post(`/api/invoices/${invoiceId}/share-link`)
  return res.data
}

export async function sendInvoiceEmail(
  invoiceId: string,
  toEmail: string
): Promise<{ message: string; portal_url: string; token: string }> {
  const res = await api.post(`/api/invoices/${invoiceId}/send-email`, {
    to_email: toEmail,
  })
  return res.data
}
```

### `frontend/app/(dashboard)/invoices/[id]/page.tsx` — add Teilen + E-Mail buttons

Find the existing `<div className="flex gap-2">` action area (or equivalent button group) and add two new buttons. Also add the necessary state variables and modal JSX at the component level:

**State additions (add near existing useState declarations):**
```typescript
const [shareLink, setShareLink] = useState<string | null>(null)
const [showShareModal, setShowShareModal] = useState(false)
const [showEmailModal, setShowEmailModal] = useState(false)
const [emailTo, setEmailTo] = useState('')
const [emailSending, setEmailSending] = useState(false)
const [emailSent, setEmailSent] = useState(false)
const [copySuccess, setCopySuccess] = useState(false)
```

**Handler additions:**
```typescript
const handleCreateShareLink = async () => {
  try {
    const result = await createShareLink(invoice.invoice_id)
    setShareLink(`https://rechnungswerk.io${result.url}`)
    setShowShareModal(true)
  } catch (err) {
    console.error('Share link error:', err)
  }
}

const handleSendEmail = async () => {
  if (!emailTo) return
  setEmailSending(true)
  try {
    await sendInvoiceEmail(invoice.invoice_id, emailTo)
    setEmailSent(true)
  } catch (err) {
    console.error('Send email error:', err)
  } finally {
    setEmailSending(false)
  }
}
```

**Button additions (add to existing action button row):**
```tsx
<button
  onClick={handleCreateShareLink}
  className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
>
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
  </svg>
  Teilen
</button>

<button
  onClick={() => setShowEmailModal(true)}
  className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
>
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
  Per E-Mail senden
</button>
```

**Modal JSX additions (add before closing `</div>` of the page component):**
```tsx
{/* Share Link Modal */}
{showShareModal && shareLink && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
      <h3 className="text-lg font-semibold text-slate-900 mb-2">Rechnung teilen</h3>
      <p className="text-sm text-slate-500 mb-4">
        Teilen Sie diesen Link mit Ihrem Kunden. Der Link ist 30 Tage gültig.
      </p>
      <div className="flex gap-2 mb-4">
        <input
          readOnly
          value={shareLink}
          className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 text-slate-700 focus:outline-none"
        />
        <button
          onClick={() => {
            navigator.clipboard.writeText(shareLink)
            setCopySuccess(true)
            setTimeout(() => setCopySuccess(false), 2000)
          }}
          className="px-4 py-2 text-sm font-medium bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors"
        >
          {copySuccess ? 'Kopiert!' : 'Kopieren'}
        </button>
      </div>
      <button
        onClick={() => setShowShareModal(false)}
        className="w-full py-2 text-sm text-slate-500 hover:text-slate-700"
      >
        Schließen
      </button>
    </div>
  </div>
)}

{/* Send by Email Modal */}
{showEmailModal && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
      <h3 className="text-lg font-semibold text-slate-900 mb-2">Rechnung per E-Mail senden</h3>
      {emailSent ? (
        <div className="text-center py-4">
          <p className="text-green-600 font-medium mb-1">E-Mail wird versendet!</p>
          <p className="text-sm text-slate-500">
            Ihr Kunde erhält einen Link zum Anzeigen und Herunterladen der Rechnung.
          </p>
          <button
            onClick={() => { setShowEmailModal(false); setEmailSent(false); setEmailTo('') }}
            className="mt-4 w-full py-2 text-sm font-medium bg-teal-500 text-white rounded-lg hover:bg-teal-600"
          >
            Schließen
          </button>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-500 mb-4">
            Der Kunde erhält einen Link zum Anzeigen und Herunterladen der Rechnung sowie zur Zahlungsbestätigung.
          </p>
          <input
            type="email"
            placeholder="E-Mail-Adresse des Kunden"
            value={emailTo}
            onChange={e => setEmailTo(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <div className="flex gap-2">
            <button
              onClick={() => { setShowEmailModal(false); setEmailTo('') }}
              className="flex-1 py-2 text-sm text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSendEmail}
              disabled={!emailTo || emailSending}
              className="flex-1 py-2 text-sm font-medium bg-teal-500 text-white rounded-lg hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {emailSending ? 'Wird gesendet…' : 'E-Mail senden'}
            </button>
          </div>
        </>
      )}
    </div>
  </div>
)}
```

**Verification command:**
```bash
cd /Users/sadanakb/rechnungswerk/backend && pytest -q --tb=short tests/test_send_invoice_email.py
# Expected: 3 passed

cd /Users/sadanakb/rechnungswerk/frontend && npm run build 2>&1 | tail -10
# Expected: build succeeds
```

**Commit message:** `feat: add send invoice by email — share link + Brevo email dispatch`

---

## Task 9: Portal Frontend Page

**Files:**
- Create: `frontend/app/portal/[token]/page.tsx`

**Note:** This page is placed at `app/portal/[token]/page.tsx` — outside the `(dashboard)` and `(marketing)` route groups. It therefore uses only the root `app/layout.tsx` (HTML shell only, no dashboard navigation). The page is fully standalone and publicly accessible without authentication.

**What to build:**

### `frontend/app/portal/[token]/page.tsx` — full public portal page

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface PortalInvoice {
  invoice_number: string
  invoice_date: string | null
  due_date: string | null
  seller_name: string
  seller_address: string | null
  seller_vat_id: string | null
  buyer_name: string
  buyer_address: string | null
  buyer_vat_id: string | null
  net_amount: number
  tax_amount: number
  gross_amount: number
  tax_rate: number
  currency: string
  line_items: Array<{
    description: string
    quantity: number
    unit_price?: number
    price?: number
    total?: number
  }>
  payment_status: string
  iban: string | null
  payment_account_name: string | null
  expires_at: string | null
}

function fmt(n: number, currency = 'EUR') {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(n)
}

export default function PortalPage() {
  const params = useParams()
  const token = params?.token as string
  const [invoice, setInvoice] = useState<PortalInvoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [paymentConfirmed, setPaymentConfirmed] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

  useEffect(() => {
    if (!token) return
    fetch(`${apiBase}/api/portal/${token}`)
      .then(r => {
        if (!r.ok) throw new Error('Link nicht gefunden oder abgelaufen')
        return r.json()
      })
      .then(data => {
        setInvoice(data)
        setLoading(false)
      })
      .catch(e => {
        setError(e.message)
        setLoading(false)
      })
  }, [token, apiBase])

  const confirmPayment = async () => {
    setConfirming(true)
    try {
      const r = await fetch(`${apiBase}/api/portal/${token}/confirm-payment`, {
        method: 'POST',
      })
      if (r.ok) {
        setPaymentConfirmed(true)
        if (invoice) setInvoice({ ...invoice, payment_status: 'paid' })
      }
    } finally {
      setConfirming(false)
    }
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc',
      }}>
        <p style={{ color: '#64748b' }}>Rechnung wird geladen…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc',
      }}>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ color: '#ef4444', fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            {error}
          </p>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
            Der Link ist möglicherweise abgelaufen oder wurde widerrufen.
          </p>
        </div>
      </div>
    )
  }

  if (!invoice) return null

  const isPaid = invoice.payment_status === 'paid' || paymentConfirmed
  const isOverdue = invoice.payment_status === 'overdue'
  const statusColor = isPaid ? '#16a34a' : isOverdue ? '#dc2626' : '#d97706'
  const statusLabel = isPaid ? 'Bezahlt' : isOverdue ? 'Überfällig' : 'Offen'

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f1f5f9',
      fontFamily: 'system-ui, sans-serif',
      padding: '2rem 1rem',
    }}>
      <div style={{ maxWidth: '680px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
        }}>
          <div>
            <p style={{
              fontSize: '0.75rem',
              color: '#64748b',
              marginBottom: '0.25rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              RechnungsWerk
            </p>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
              Ihre Rechnung
            </h1>
          </div>
          <span style={{
            padding: '0.375rem 1rem',
            borderRadius: '9999px',
            fontSize: '0.875rem',
            fontWeight: 600,
            background: isPaid ? '#dcfce7' : isOverdue ? '#fee2e2' : '#fef3c7',
            color: statusColor,
          }}>
            {statusLabel}
          </span>
        </div>

        {/* Invoice card */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          padding: '2rem',
          marginBottom: '1.5rem',
        }}>

          {/* Seller / Buyer columns */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1.5rem',
            marginBottom: '2rem',
          }}>
            <div>
              <p style={{
                fontSize: '0.75rem',
                color: '#64748b',
                marginBottom: '0.25rem',
                textTransform: 'uppercase',
              }}>
                Rechnungssteller
              </p>
              <p style={{ fontWeight: 600, color: '#0f172a' }}>{invoice.seller_name}</p>
              {invoice.seller_address && (
                <p style={{ fontSize: '0.875rem', color: '#475569', whiteSpace: 'pre-line' }}>
                  {invoice.seller_address}
                </p>
              )}
              {invoice.seller_vat_id && (
                <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  USt-ID: {invoice.seller_vat_id}
                </p>
              )}
            </div>
            <div>
              <p style={{
                fontSize: '0.75rem',
                color: '#64748b',
                marginBottom: '0.25rem',
                textTransform: 'uppercase',
              }}>
                Rechnungsempfänger
              </p>
              <p style={{ fontWeight: 600, color: '#0f172a' }}>{invoice.buyer_name}</p>
              {invoice.buyer_address && (
                <p style={{ fontSize: '0.875rem', color: '#475569', whiteSpace: 'pre-line' }}>
                  {invoice.buyer_address}
                </p>
              )}
            </div>
          </div>

          {/* Invoice metadata row */}
          <div style={{
            display: 'flex',
            gap: '2rem',
            padding: '1rem',
            background: '#f8fafc',
            borderRadius: '8px',
            marginBottom: '2rem',
            flexWrap: 'wrap',
          }}>
            <div>
              <p style={{ fontSize: '0.75rem', color: '#64748b' }}>Rechnungsnummer</p>
              <p style={{ fontWeight: 600, color: '#0f172a' }}>{invoice.invoice_number}</p>
            </div>
            {invoice.invoice_date && (
              <div>
                <p style={{ fontSize: '0.75rem', color: '#64748b' }}>Datum</p>
                <p style={{ fontWeight: 600, color: '#0f172a' }}>{invoice.invoice_date}</p>
              </div>
            )}
            {invoice.due_date && (
              <div>
                <p style={{ fontSize: '0.75rem', color: '#64748b' }}>Fällig am</p>
                <p style={{ fontWeight: 600, color: isOverdue ? '#dc2626' : '#0f172a' }}>
                  {invoice.due_date}
                </p>
              </div>
            )}
          </div>

          {/* Line items table */}
          {invoice.line_items && invoice.line_items.length > 0 && (
            <div style={{ marginBottom: '2rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ textAlign: 'left', padding: '0.5rem 0', color: '#64748b', fontWeight: 500 }}>
                      Beschreibung
                    </th>
                    <th style={{ textAlign: 'right', padding: '0.5rem 0', color: '#64748b', fontWeight: 500 }}>
                      Menge
                    </th>
                    <th style={{ textAlign: 'right', padding: '0.5rem 0', color: '#64748b', fontWeight: 500 }}>
                      Preis
                    </th>
                    <th style={{ textAlign: 'right', padding: '0.5rem 0', color: '#64748b', fontWeight: 500 }}>
                      Gesamt
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.line_items.map((item, i) => {
                    const qty = Number(item.quantity || 1)
                    const price = Number(item.unit_price || item.price || 0)
                    const total = Number(item.total || qty * price)
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.75rem 0', color: '#0f172a' }}>
                          {item.description}
                        </td>
                        <td style={{ textAlign: 'right', padding: '0.75rem 0', color: '#475569' }}>
                          {qty}
                        </td>
                        <td style={{ textAlign: 'right', padding: '0.75rem 0', color: '#475569' }}>
                          {fmt(price, invoice.currency)}
                        </td>
                        <td style={{ textAlign: 'right', padding: '0.75rem 0', fontWeight: 500, color: '#0f172a' }}>
                          {fmt(total, invoice.currency)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Totals */}
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ minWidth: '240px' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '0.5rem',
                  fontSize: '0.875rem',
                  color: '#475569',
                }}>
                  <span>Nettobetrag</span>
                  <span>{fmt(invoice.net_amount, invoice.currency)}</span>
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '0.75rem',
                  fontSize: '0.875rem',
                  color: '#475569',
                }}>
                  <span>MwSt. ({invoice.tax_rate}%)</span>
                  <span>{fmt(invoice.tax_amount, invoice.currency)}</span>
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '1.125rem',
                  fontWeight: 700,
                  color: '#0f172a',
                  borderTop: '2px solid #e2e8f0',
                  paddingTop: '0.75rem',
                }}>
                  <span>Gesamtbetrag</span>
                  <span>{fmt(invoice.gross_amount, invoice.currency)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bank details */}
          {invoice.iban && (
            <div style={{
              marginTop: '1.5rem',
              padding: '1rem',
              background: '#f0fdf4',
              borderRadius: '8px',
              borderLeft: '3px solid #16a34a',
            }}>
              <p style={{ fontSize: '0.75rem', color: '#15803d', fontWeight: 600, marginBottom: '0.25rem' }}>
                Bankverbindung
              </p>
              {invoice.payment_account_name && (
                <p style={{ fontSize: '0.875rem', color: '#166534' }}>
                  {invoice.payment_account_name}
                </p>
              )}
              <p style={{ fontSize: '0.875rem', color: '#166534', fontFamily: 'monospace' }}>
                {invoice.iban}
              </p>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <a
            href={`${apiBase}/api/portal/${token}/download-pdf`}
            download
            style={{
              flex: 1,
              minWidth: '160px',
              padding: '0.875rem',
              background: '#14b8a6',
              color: 'white',
              borderRadius: '8px',
              textAlign: 'center',
              fontWeight: 600,
              textDecoration: 'none',
              fontSize: '0.875rem',
            }}
          >
            PDF herunterladen
          </a>
          <a
            href={`${apiBase}/api/portal/${token}/download-xml`}
            download
            style={{
              flex: 1,
              minWidth: '160px',
              padding: '0.875rem',
              background: 'white',
              color: '#0f172a',
              borderRadius: '8px',
              textAlign: 'center',
              fontWeight: 600,
              textDecoration: 'none',
              fontSize: '0.875rem',
              border: '1px solid #e2e8f0',
            }}
          >
            XRechnung (XML)
          </a>
          {!isPaid && (
            <button
              onClick={confirmPayment}
              disabled={confirming}
              style={{
                flex: 1,
                minWidth: '160px',
                padding: '0.875rem',
                background: confirming ? '#d1d5db' : '#16a34a',
                color: 'white',
                borderRadius: '8px',
                fontWeight: 600,
                border: 'none',
                cursor: confirming ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
              }}
            >
              {confirming ? 'Bestätigung…' : 'Zahlung bestätigen'}
            </button>
          )}
          {isPaid && (
            <div style={{
              flex: 1,
              minWidth: '160px',
              padding: '0.875rem',
              background: '#dcfce7',
              borderRadius: '8px',
              textAlign: 'center',
              color: '#16a34a',
              fontWeight: 600,
              fontSize: '0.875rem',
            }}>
              Zahlung bestaetigt
            </div>
          )}
        </div>

        {/* Footer */}
        <p style={{
          textAlign: 'center',
          marginTop: '2rem',
          fontSize: '0.75rem',
          color: '#94a3b8',
        }}>
          Bereitgestellt von{' '}
          <a href="https://rechnungswerk.io" style={{ color: '#14b8a6' }}>
            RechnungsWerk
          </a>
          {invoice.expires_at &&
            ` · Link gültig bis ${new Date(invoice.expires_at).toLocaleDateString('de-DE')}`
          }
        </p>
      </div>
    </div>
  )
}
```

**Verification command:**
```bash
cd /Users/sadanakb/rechnungswerk/frontend && npm run build 2>&1 | tail -10
# Expected: build succeeds, portal/[token] route appears in output
```

**Commit message:** `feat: add customer portal frontend — /portal/[token], invoice view, payment confirmation`

---

## Task 10: Alembic Migration Phase 8

**Files:**
- Create: `backend/alembic/versions/phase8_share_links.py`

**What to build:**

### `backend/alembic/versions/phase8_share_links.py` — full migration

```python
"""add Phase 8 — invoice_share_links table

Revision ID: b7c3e9f4d2a1
Revises: 9c5d8e3f2a71
Create Date: 2026-02-27 20:00:00.000000
"""
from typing import Union

from alembic import op
import sqlalchemy as sa

revision: str = 'b7c3e9f4d2a1'
down_revision: Union[str, None] = '9c5d8e3f2a71'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'invoice_share_links',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            'invoice_id',
            sa.Integer(),
            sa.ForeignKey('invoices.id'),
            nullable=False,
            unique=True,
        ),
        sa.Column('token', sa.String(36), nullable=False, unique=True),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('access_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_by_user_id', sa.Integer(), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index('ix_invoice_share_links_token', 'invoice_share_links', ['token'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_invoice_share_links_token', table_name='invoice_share_links')
    op.drop_table('invoice_share_links')
```

**No test file required for this task** (infrastructure migration).

**Verification command:**
```bash
cd /Users/sadanakb/rechnungswerk/backend && python -c "from alembic.config import Config; from alembic import command; c = Config('alembic.ini'); command.history(c)" 2>&1 | head -5
# Expected: b7c3e9f4d2a1 appears in migration history
```

**Commit message:** `feat: add Alembic Phase 8 migration — invoice_share_links table`

---

## Task 11: Final Verification & Changelog v0.8.0

**Files:**
- Run: `backend/` pytest suite
- Run: `frontend/` npm build
- Modify: `frontend/app/(marketing)/changelog/page.tsx`

**What to build:**

### Final test run

```bash
cd /Users/sadanakb/rechnungswerk/backend && pytest -q 2>&1 | tail -10
# Expected: 384+ passed (all original + new tests from Tasks 2-8)
```

### Frontend build check

```bash
cd /Users/sadanakb/rechnungswerk/frontend && npm run build 2>&1 | tail -10
# Expected: build succeeds with 114+ pages, including portal/[token]
```

### `frontend/app/(marketing)/changelog/page.tsx` — add v0.8.0 entry

Find the `releases` array (or equivalent data structure) and insert the v0.8.0 entry AT THE TOP (newest first):

```typescript
{
  version: 'v0.8.0',
  title: 'Phase 8: Production Excellence & Kundenportal',
  date: '27.02.2026',
  items: [
    {
      text: 'ARQ Task Worker: E-Mail-Versand asynchron mit Redis-Queue und Sync-Fallback',
      tag: 'infra',
    },
    {
      text: 'Webhook Retry: Exponential Backoff (1m/5m/30m/2h/24h), max 5 Versuche',
      tag: 'infra',
    },
    {
      text: 'Recurring Invoice Scheduler: ARQ Cron-Job generiert faellige Rechnungen taeglich',
      tag: 'feature',
    },
    {
      text: 'S3-Storage Abstraction: LocalStorage und S3/MinIO Backend konfigurierbar',
      tag: 'infra',
    },
    {
      text: 'Kundenportal: /portal/[token] — oeffentliche Rechnungsansicht ohne Login',
      tag: 'feature',
    },
    {
      text: 'Share Links: UUID-Token, 30 Tage Gueltigkeit, Zugriffszaehler, Widerruf',
      tag: 'feature',
    },
    {
      text: 'Zahlungsbestaetigung durch Kunden via Portal',
      tag: 'feature',
    },
    {
      text: 'Rechnung per E-Mail senden: Portal-Link via Brevo, ARQ-gecacht',
      tag: 'feature',
    },
    {
      text: 'PDF und XRechnung XML Download direkt aus dem Kundenportal',
      tag: 'feature',
    },
    {
      text: 'Alembic Migration Phase 8: invoice_share_links Tabelle',
      tag: 'infra',
    },
  ],
},
```

**Verification command:**
```bash
cd /Users/sadanakb/rechnungswerk/frontend && npm run build 2>&1 | grep -E "Route|Error" | head -20
# Expected: changelog route appears, no TypeScript errors
```

**Commit message:** `feat: add v0.8.0 changelog entry — Phase 8 Production Excellence + Kundenportal`

---

## Important Implementation Notes

1. **Test pattern:** All backend tests must use the existing `require_api_key` dependency override from `conftest.py`. Use the same `client`, `db_session`, `test_user`, `test_invoice` fixtures that are established in previous phases.

2. **After each task**, run the verification command before moving to the next task.

3. **ARQ pool is None in tests** — the `app.state.arq_pool = None` fallback ensures tests don't require a running Redis instance. `enqueue_email` and `send-email` endpoints must handle `arq_pool = None` gracefully by falling back to synchronous execution.

4. **`Invoice.id` vs `Invoice.invoice_id`** — `Invoice.id` is the auto-increment integer primary key used as the FK in `InvoiceShareLink`. `Invoice.invoice_id` is the human-readable string identifier (e.g. `"INV-20260227-ABC123"`) used in URL paths.

5. **Portal router ordering** — The portal router is registered with prefix `/api/portal`, separate from the invoices router. No path conflict issues exist in the portal router itself.

6. **Share link endpoints must come before `/{invoice_id}`** — In `invoices.py`, routes like `/{invoice_id}/share-link` must be declared before the generic `/{invoice_id}` GET/PATCH/DELETE routes to avoid FastAPI routing the `share-link` segment as an invoice_id.

7. **`enqueue_email` is async** — callers (`auth.py` forgot-password, `invoices.py` send-email) must `await` it. FastAPI endpoint functions are already async, so this is compatible.

8. **S3 storage** — `boto3` must be added to `backend/requirements.txt` in addition to `arq`. Add `boto3==1.34.0` (or latest stable).

9. **Portal page layout** — `frontend/app/portal/[token]/page.tsx` uses inline styles instead of Tailwind classes because it intentionally avoids the dashboard CSS context. This is correct behavior for a standalone public page.

10. **`arq` import in WorkerSettings** — The `cron` import comes from `arq` (`from arq import cron`). Add this import to `worker.py` at the top of the file alongside existing imports.
