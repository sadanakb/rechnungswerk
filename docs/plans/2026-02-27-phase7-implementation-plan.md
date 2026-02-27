# Phase 7: Business Logic & Performance Hardening — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add invoice payment status lifecycle, customer/contact management, configurable invoice number sequences, global rate limiting, DB performance indexes, CSV import, autocomplete search, marketing contact/about pages, dashboard aggregate stats, and final production hardening.

**Architecture:** Payment status as enum column on Invoice; Contact as separate model with FK from Invoice; InvoiceNumberSequence as org-scoped config; aggregate stats via dedicated endpoint; rate limiting via slowapi middleware.

**Tech Stack:** Python 3.13 + FastAPI + SQLAlchemy + slowapi, Next.js 16 + React 19

---

### Task 1: Invoice Payment Status Lifecycle

**Files:**
- Modify: `backend/app/models.py` (add payment_status, paid_date, payment_method, payment_reference to Invoice)
- Modify: `backend/app/routers/invoices.py` (add PATCH /api/invoices/{id}/payment-status, GET /api/invoices?payment_status=...)
- Modify: `backend/app/schemas.py` (add payment status fields to InvoiceResponse)
- Modify: `frontend/app/(dashboard)/invoices/page.tsx` (show payment status badge)
- Modify: `frontend/app/(dashboard)/invoices/[id]/page.tsx` (show/update payment status)
- Modify: `frontend/lib/api.ts` (add updatePaymentStatus function)
- Create: `backend/tests/test_payment_status.py`

**What to build:**
- Add to Invoice model: `payment_status = Column(String(20), default='unpaid')` — values: `unpaid`, `paid`, `partial`, `overdue`, `cancelled`
- Add: `paid_date = Column(Date, nullable=True)`, `payment_method = Column(String(50), nullable=True)`, `payment_reference = Column(String(255), nullable=True)`
- `PATCH /api/invoices/{id}/payment-status` — body: `{status, paid_date, payment_method, payment_reference}`, validates status enum
- Add `?payment_status=` filter to GET /api/invoices (alongside existing filters)
- Frontend invoice list: colored payment status badge per row (unpaid=gray, paid=green, overdue=red, partial=yellow, cancelled=muted)
- Invoice detail page: payment status section with "Als bezahlt markieren" button → opens mini-form (date, method: Überweisung/Lastschrift/Bar/Sonstiges, reference)
- 5 tests: set paid, set overdue, partial payment, cross-org rejected, filter by payment_status

---

### Task 2: Customer/Contact Management

**Files:**
- Modify: `backend/app/models.py` (add Contact model)
- Create: `backend/app/routers/contacts.py`
- Modify: `backend/app/main.py` (register router)
- Create: `frontend/app/(dashboard)/contacts/page.tsx`
- Modify: `frontend/components/layout/SidebarNav.tsx` (add Contacts link with Users2 icon)
- Modify: `frontend/lib/api.ts` (add contact API functions)
- Create: `backend/tests/test_contacts.py`

**What to build:**
- `Contact` model: id, org_id, type (customer/supplier), name, email, phone, address_line1, address_line2, city, zip, country (default 'DE'), vat_id, payment_terms (int, default 30), notes, is_active (default True), created_at
- Endpoints:
  - `GET /api/contacts` — list, filter by type (customer/supplier), search by name
  - `POST /api/contacts` — create
  - `GET /api/contacts/{id}` — detail with invoice count/total
  - `PATCH /api/contacts/{id}` — update
  - `DELETE /api/contacts/{id}` — soft delete (set is_active=False)
- Frontend: table with name, type badge, email, phone, invoice count, total volume, actions
- Search bar + type filter (Alle / Kunden / Lieferanten)
- "Neuer Kontakt" modal with full form
- 6 tests: create, list by type, search, update, delete, cross-org isolation

---

### Task 3: Invoice Number Sequence Configuration

**Files:**
- Modify: `backend/app/models.py` (add InvoiceNumberSequence model)
- Create: `backend/app/routers/invoice_sequences.py`
- Modify: `backend/app/main.py` (register router)
- Modify: `backend/app/routers/invoices.py` (use sequence when creating invoices)
- Modify: `frontend/app/(dashboard)/settings/page.tsx` (add Nummernkreis tab or section)
- Modify: `frontend/lib/api.ts` (add sequence API functions)
- Create: `backend/tests/test_invoice_sequences.py`

**What to build:**
- `InvoiceNumberSequence` model: id, org_id, prefix (str, e.g. "RE"), separator (str, e.g. "-"), year_format (str, e.g. "YYYY"), padding (int, default 4), current_counter (int, default 0), reset_yearly (bool, default True), created_at
- `generate_next_number(db, org_id)` function: atomically increments counter, formats as `{prefix}{separator}{year}{separator}{counter:0{padding}}` → e.g. `RE-2026-0001`
- Endpoints: `GET/POST /api/invoice-sequences` (create/get config), format preview endpoint
- In invoice creation: if org has a sequence configured, use it for invoice_number instead of UUID-based number
- Frontend: new "Nummernkreis" section in Settings → Rechnungen tab with:
  - Prefix input (max 10 chars)
  - Separator dropdown (-, /, empty)
  - Format preview: "RE-2026-0001"
  - "Jährlicher Reset" toggle
  - Current counter display
  - "Speichern" button
- 4 tests: create sequence, generate sequential numbers, yearly reset, concurrent generation (no duplicates)

---

### Task 4: Global Rate Limiting

**Files:**
- Modify: `backend/app/main.py` (add slowapi rate limiting middleware)
- Modify: `backend/requirements.txt` (add slowapi)
- Create: `backend/tests/test_rate_limiting.py`

**What to build:**
Install: `pip install slowapi` (add to requirements.txt)

```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)
```

Add specific limits to sensitive endpoints:
- `POST /api/auth/login` → `@limiter.limit("10/minute")`
- `POST /api/auth/forgot-password` → `@limiter.limit("5/minute")`
- `POST /api/auth/register` → `@limiter.limit("5/minute")`

Add `X-RateLimit-Limit` and `X-RateLimit-Remaining` to response headers via middleware.

3 tests: normal request passes, rate limit exceeded returns 429, auth endpoint limited

---

### Task 5: Database Performance Indexes

**Files:**
- Create: `backend/alembic/versions/phase7_performance_indexes.py`

**What to build:**
Revision ID: `9c5d8e3f2a71`
down_revision: `8b4e2f7a1c93`

Add these indexes using `op.create_index()`:
1. `ix_invoices_org_created` — on `invoices(organization_id, created_at DESC)` — for list queries
2. `ix_invoices_org_status` — on `invoices(organization_id, validation_status)` — for status filter
3. `ix_invoices_org_date` — on `invoices(organization_id, invoice_date)` — for date range
4. `ix_invoices_payment_status` — on `invoices(organization_id, payment_status)` — for payment filter (if column exists)
5. `ix_invoices_buyer_name` — on `invoices(buyer_name)` — for supplier search
6. `ix_audit_logs_org_created` — on `audit_logs(org_id, created_at DESC)`
7. `ix_notifications_org_read` — on `notifications(org_id, is_read)` — for unread count

Also add `payment_status`, `paid_date`, `payment_method`, `payment_reference` columns to `invoices` table via `op.batch_alter_table`.

And add Contact and InvoiceNumberSequence tables.

Use `op.create_index(op.f('ix_...'), 'table_name', ['col1', 'col2'], unique=False)` syntax.

---

### Task 6: CSV Invoice Import

**Files:**
- Create: `backend/app/routers/import_invoices.py`
- Modify: `backend/app/main.py` (register router)
- Create: `frontend/app/(dashboard)/ocr/page.tsx` enhancement OR new `frontend/app/(dashboard)/import/page.tsx`
- Modify: `frontend/components/layout/SidebarNav.tsx` (update OCR to "Import" or add Import link)
- Modify: `frontend/lib/api.ts` (add importCsv function)
- Create: `backend/tests/test_csv_import.py`

**What to build:**
Backend `POST /api/import/csv`:
- Accepts multipart CSV file upload
- Expected columns (flexible mapping): `invoice_number`, `invoice_date`, `due_date`, `buyer_name`, `buyer_vat_id`, `seller_name`, `seller_vat_id`, `net_amount`, `tax_rate`, `gross_amount`, `currency`, `payment_status`
- Returns: `{imported: N, skipped: M, errors: [{row: N, error: "..."}]}`
- Duplicate detection: skip if invoice_number already exists for org
- Use Python `csv.DictReader` (no external deps)

Backend `GET /api/import/template`:
- Returns a sample CSV with headers and 2 example rows

Frontend: New page `/import` with:
- Tab 1: "CSV Import" — file upload zone, column mapping preview, import button, results display (N importiert, M übersprungen, errors table)
- Tab 2: "Vorlage herunterladen" — button to download the CSV template
- Add "Import" to SidebarNav with `FileInput` icon (lucide-react)

4 tests: valid CSV imports correctly, duplicate skipped, invalid row reported, template download returns CSV

---

### Task 7: Invoice Autocomplete & Search Enhancement

**Files:**
- Modify: `backend/app/routers/invoices.py` (add GET /api/invoices/autocomplete)
- Modify: `frontend/app/(dashboard)/invoices/page.tsx` (enhance search with autocomplete dropdown)
- Modify: `frontend/lib/api.ts` (add autocomplete function)

**What to build:**
Backend `GET /api/invoices/autocomplete?q=ACME&field=buyer_name`:
- Returns top 10 distinct values for `buyer_name` (or `invoice_number`) matching the prefix
- Uses `DISTINCT` + `ILIKE` + `LIMIT 10`
- Fields: `buyer_name`, `invoice_number`, `seller_name`
- Must be defined BEFORE `/{invoice_id}` route

Frontend: When user types in the search box on /invoices, after 300ms debounce:
- Show a dropdown below the search input with up to 10 autocomplete suggestions
- Click a suggestion to apply it as search filter
- Keyboard navigation (up/down arrows, Enter to select, Escape to close)
- Small spinner during fetch

2 tests: autocomplete returns matching names, empty for no match

---

### Task 8: Dashboard Aggregate Stats Endpoint

**Files:**
- Modify: `backend/app/routers/invoices.py` (add GET /api/invoices/stats)
- Modify: `frontend/app/(dashboard)/dashboard/page.tsx` (use stats endpoint instead of loading all invoices)
- Modify: `frontend/lib/api.ts` (add getDashboardStats function)

**What to build:**
Backend `GET /api/invoices/stats`:
- Must be defined BEFORE `/{invoice_id}` route
- Returns single JSON object:
```json
{
  "total_invoices": 142,
  "invoices_this_month": 23,
  "revenue_this_month": 45231.50,
  "revenue_last_month": 38120.00,
  "overdue_count": 5,
  "overdue_amount": 12450.00,
  "paid_count": 89,
  "unpaid_count": 48,
  "validation_rate": 0.87,
  "monthly_revenue": [
    {"month": "2025-09", "amount": 32000},
    ...6 months...
  ]
}
```
- Single SQL query per metric using SQLAlchemy aggregate functions (func.count, func.sum)
- Use `func.date_trunc('month', Invoice.created_at)` for monthly grouping

Frontend: Update dashboard/page.tsx to call `getDashboardStats()` instead of `listInvoices()`. Display:
- KPI cards: Rechnungen diesen Monat, Umsatz diesen Monat, Überfällig (count + amount), Validierungsrate
- Revenue trend chart uses `monthly_revenue` array
- Add "Überfällig" alert card (red) if overdue_count > 0

2 tests: stats returns correct totals, empty org returns zeros

---

### Task 9: Marketing Pages — Kontakt & Über uns

**Files:**
- Create: `frontend/app/(marketing)/kontakt/page.tsx`
- Create: `frontend/app/(marketing)/ueber-uns/page.tsx`
- Modify: `frontend/app/sitemap.ts` (add new pages)
- Modify: `frontend/app/(marketing)/layout.tsx` or nav component (add links)

**What to build:**

**`/kontakt` page:**
- Metadata: "Kontakt – RechnungsWerk"
- Contact form: Name, E-Mail, Betreff (dropdown: Allgemeine Anfrage / Support / Partnerschaft / Presse), Nachricht
- 'use client' for form state
- On submit: POST to `/api/contact` (see below) OR `mailto:` fallback
- Add `POST /api/contact` backend endpoint in a new `backend/app/routers/contact.py` that calls `email_service.send_contact_email(name, email, subject, message)` — add that email function
- Also show: contact@rechnungswerk.de, GitHub Issues link, Response time: "Wir antworten innerhalb von 24 Stunden"
- JSON-LD: Organization schema with contactPoint

**`/ueber-uns` page:**
- Metadata: "Über uns – RechnungsWerk"
- Mission statement: "Wir machen E-Rechnungen für deutsche Unternehmen einfach"
- Story: Founded to solve E-Rechnungspflicht complexity
- Values: Open Source, Privacy-first, German compliance
- Tech stack section: Python, FastAPI, Next.js, PostgreSQL, XRechnung/ZUGFeRD
- GitHub CTA: "Open Source auf GitHub"
- Team section: placeholder for 1-3 team members (name, role, avatar placeholder)

Update sitemap.ts to add both pages (priority 0.6).

---

### Task 10: Invoice Overdue Detection & Auto-Status

**Files:**
- Create: `backend/app/routers/invoices.py` (add GET /api/invoices/check-overdue background utility)
- Modify: `backend/app/routers/invoices.py` (in list endpoint: auto-mark overdue based on due_date)
- Create: `backend/tests/test_overdue_detection.py`

**What to build:**
Overdue logic: When listing invoices (GET /api/invoices), for any invoice where:
- `payment_status == 'unpaid'` AND
- `invoice_date` + `payment_terms` days < today

→ automatically set `payment_status = 'overdue'` in-place before returning

This is a lazy evaluation approach — no background job needed. On every list request, update overdue status for the org's invoices.

Also add `GET /api/invoices/check-overdue` endpoint (defined BEFORE `/{invoice_id}`) that:
- Finds all unpaid invoices past due date
- Updates their status to 'overdue'
- Returns `{updated: N}` count

Add a "Mahnwesen" integration: when creating a Mahnung, also set the referenced invoice's payment_status to 'overdue'.

3 tests: invoice past due becomes overdue on list, not-yet-due stays unpaid, already-paid not changed

---

### Task 11: Alembic Migration Phase 7 (consolidation)

**Files:**
- Create: `backend/alembic/versions/phase7_contacts_sequences_payment.py`

**What to build:**
Revision ID: `9c5d8e3f2a71`
down_revision: `8b4e2f7a1c93`

This is the MASTER migration for Phase 7. Include ALL schema changes:

1. Add to `invoices` table (via `op.batch_alter_table`):
   - `payment_status` String(20) default 'unpaid'
   - `paid_date` Date nullable
   - `payment_method` String(50) nullable
   - `payment_reference` String(255) nullable

2. Create `contacts` table:
   - id, org_id (idx), type String(20), name String(255), email String(255) nullable, phone String(50) nullable, address_line1 String(255) nullable, address_line2 String(255) nullable, city String(100) nullable, zip String(20) nullable, country String(2) default 'DE', vat_id String(50) nullable, payment_terms Integer default 30, notes Text nullable, is_active Boolean default True, created_at DateTime

3. Create `invoice_number_sequences` table:
   - id, org_id (unique idx), prefix String(20) default 'RE', separator String(5) default '-', year_format String(10) default 'YYYY', padding Integer default 4, current_counter Integer default 0, reset_yearly Boolean default True, last_reset_year Integer nullable, created_at DateTime

4. Add performance indexes:
   - `ix_invoices_org_created` on invoices(organization_id, created_at)
   - `ix_invoices_org_status` on invoices(organization_id, validation_status)
   - `ix_invoices_buyer` on invoices(buyer_name)
   - `ix_notifications_org_read` on notifications(org_id, is_read)

Note: Task 5 (performance indexes) is merged INTO this migration. Remove the separate Task 5 migration reference if it conflicts.

---

### Task 12: Final Verification & Changelog v0.7.0

**Files:**
- Modify: `frontend/app/(marketing)/changelog/page.tsx`
- Run backend tests, frontend tests, build

**What to build:**
- Add v0.7.0 changelog entry
- Run `pytest -q` and `npx vitest run`
- Run `npm run build`
- Fix any TypeScript/build errors
- Final commit
