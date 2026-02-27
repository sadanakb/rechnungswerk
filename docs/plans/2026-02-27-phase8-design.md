# Phase 8: Production Excellence + Kundenportal — Design

**Date:** 2026-02-27
**Status:** Approved

## Goal

Make RechnungsWerk truly production-ready (reliable async task execution, automatic recurring invoices, webhook retries, email queueing) and add a customer-facing invoice portal (shareable link, PDF/XML download, payment confirmation) that differentiates the product from Lexware and sevDesk.

---

## Part A: Production Infrastructure

### A1 — ARQ Task Worker (fully wired)

The ARQ worker (`app/tasks/worker.py`) and Redis infrastructure already exist but are not fully integrated. Phase 8 wires them up end-to-end.

**Changes:**
- `email_service.py` — All email sends become ARQ-enqueued tasks (not synchronous API calls). Retry up to 3 times on Brevo API failure.
- `webhooks.py` — Failed HTTP deliveries enqueue an ARQ retry task with exponential backoff: 1 min, 5 min, 30 min, 2 h, 24 h (max 5 attempts). `WebhookDelivery.status` tracks each attempt.
- New background task: `daily_recurring_check()` — runs once per day via ARQ cron, generates invoices from `RecurringInvoice` templates that are due.

**Architecture:**
```
Redis ──► ARQ Worker Process
          ├── email_task(to, subject, body, template_id)
          ├── webhook_delivery_task(delivery_id)
          └── [cron daily] recurring_invoice_check()
```

### A2 — Recurring Invoice Scheduler

`app/recurring/scheduler.py` has the `RecurringScheduler` class but it's manually triggered. Phase 8 activates it as an ARQ cron job.

- `RecurringInvoice.next_due` date field drives scheduling
- On each daily cron run: find all `RecurringInvoice` records where `next_due <= today` and `is_active = True`
- Generate invoice, update `next_due` to next period, create in-app notification
- Frontend: `recurring/` page shows next scheduled date per template

### A3 — S3-Compatible Storage Abstraction

All file writes (logos, PDFs, XML, ZUGFeRD) go through a `StorageBackend` interface.

```python
class StorageBackend:
    def save(self, path: str, data: bytes) -> str: ...
    def read(self, path: str) -> bytes: ...
    def delete(self, path: str) -> None: ...
    def url(self, path: str) -> str: ...

class LocalStorage(StorageBackend): ...   # default (current behavior)
class S3Storage(StorageBackend): ...      # boto3, configured via env vars
```

**Config:** `STORAGE_BACKEND=local` (default) or `s3`; `AWS_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.

---

## Part B: Customer Portal

### B1 — Share Token System

**New model:** `InvoiceShareLink`
```python
id            Integer PK
invoice_id    Integer FK → invoices.id
token         String(36) UUID v4, unique, indexed
expires_at    DateTime nullable (default: now + 30 days)
access_count  Integer default 0
created_by    Integer FK → users.id
created_at    DateTime
```

**Endpoints:**
- `POST /api/invoices/{id}/share-link` — create/regenerate token, return `{url, token, expires_at}`
- `DELETE /api/invoices/{id}/share-link` — revoke token
- `GET /api/portal/{token}` — public, returns invoice data (no auth)
- `POST /api/portal/{token}/confirm-payment` — customer marks as paid
- `GET /api/portal/{token}/download-pdf` — serve ZUGFeRD PDF
- `GET /api/portal/{token}/download-xml` — serve XRechnung XML

All `/api/portal/*` endpoints are rate-limited (10 req/min per token via slowapi).

### B2 — Public Portal Page

**Route:** `/portal/[token]` — Next.js dynamic route, **outside** the `(dashboard)` layout.

**Page sections:**
1. **Header** — RechnungsWerk logo, "Ihre Rechnung" heading
2. **Seller/Buyer block** — Rechnungssteller (seller), Rechnungsempfänger (buyer)
3. **Invoice metadata** — Rechnungsnummer, Datum, Fälligkeitsdatum, Status-Badge
4. **Line items table** — Pos, Beschreibung, Menge, Einzelpreis, Gesamt
5. **Totals** — Netto, MwSt, Brutto
6. **Action bar** — PDF herunterladen, XML herunterladen, „Zahlung bestätigen" (if unpaid/overdue)
7. **Footer** — „Powered by RechnungsWerk", legal disclaimer

**Design:** No sidebar, no topbar. Clean A4-like centered card. Mobile-responsive. Uses CSS variables (`--primary`, `--foreground`, etc.).

### B3 — Send Invoice by Email

On the invoice detail page (`/invoices/[id]`): **"Per E-Mail senden"** button opens a modal:
- Email input (pre-filled from buyer contact if available)
- Subject line (pre-filled: "Ihre Rechnung {invoice_number}")
- Optional message text
- On submit: `POST /api/invoices/{id}/send-email` → generates share link if none exists, sends email via ARQ email task with portal URL

---

## Data Flow

```
Invoice Detail Page
  → "Teilen" / "Per E-Mail senden"
  → POST /api/invoices/{id}/share-link
  → UUID token stored in InvoiceShareLink
  → Email queued via ARQ → Brevo sends portal URL

Customer receives email
  → Opens /portal/{token}
  → GET /api/portal/{token} → returns invoice data (no auth)
  → Downloads PDF/XML OR clicks "Zahlung bestätigen"
  → POST /api/portal/{token}/confirm-payment → invoice.payment_status = 'paid'
  → In-app notification created for org
```

---

## Testing Strategy

- Backend: pytest for all new endpoints (share link CRUD, portal data, payment confirmation)
- Security tests: expired token rejected (422), wrong token 404, cross-org token blocked
- Infrastructure tests: ARQ task enqueue verified (mock Redis), email task retry logic
- Frontend: build check (no TypeScript errors), 114+ pages generated

---

## What is NOT in Phase 8

- Real-time WebSockets (deferred to Phase 9 if needed)
- OAuth / SSO login
- Mobile native app
- Advanced AI features
- Multi-currency support
