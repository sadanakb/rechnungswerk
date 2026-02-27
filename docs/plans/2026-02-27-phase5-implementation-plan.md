# Phase 5: Integrations, Compliance & Growth — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the integration ecosystem (outbound webhooks, API key management), add GoBD-compliant audit logging, invoice templates, bulk operations, enhanced reporting, CI/CD pipeline, self-hosting docs, FAQ page, and expand SEO blog content.

**Architecture:** Event-driven webhooks with HMAC-SHA256 signatures; audit log as append-only DB table; invoice templates as org-scoped customization layer; GitHub Actions for CI/CD.

**Tech Stack:** Python 3.13 + FastAPI + SQLAlchemy, Next.js 16 + React 19, Alembic, GitHub Actions, MkDocs (optional)

---

## Task 1: Outbound Webhook System (Backend)

**Files:**
- Create: `backend/app/models.py` (add WebhookSubscription, WebhookDelivery models)
- Create: `backend/app/routers/webhooks.py`
- Create: `backend/app/webhook_service.py` (event publishing, HMAC signing, retry logic)
- Modify: `backend/app/main.py` (register router)
- Create: `backend/tests/test_webhooks.py`

**What to build:**
- `WebhookSubscription` model: id, org_id, url, events (JSON array), secret, is_active, created_at
- `WebhookDelivery` model: id, subscription_id, event_type, payload, status, attempts, last_attempted_at, response_code
- Events: `invoice.created`, `invoice.validated`, `invoice.exported`, `mahnung.sent`, `supplier.created`
- `webhook_service.py`: `publish_event(org_id, event_type, payload)` — find subscriptions, sign with HMAC-SHA256, POST with 5s timeout, log delivery
- Endpoints:
  - `GET /api/webhooks` — List subscriptions
  - `POST /api/webhooks` — Create subscription
  - `DELETE /api/webhooks/{id}` — Delete
  - `POST /api/webhooks/{id}/test` — Send test ping
  - `GET /api/webhooks/{id}/deliveries` — Delivery log
- Trigger `invoice.created` from invoices router
- Tests: create/list/delete subscription, test ping, delivery log

---

## Task 2: API Key Management UI

**Files:**
- Create: `backend/app/routers/api_keys.py`
- Create: `backend/app/models.py` (add ApiKey model)
- Modify: `frontend/app/(dashboard)/settings/page.tsx` (API Keys tab)
- Create: `backend/tests/test_api_keys.py`

**What to build:**
- `ApiKey` model: id, org_id, user_id, name, key_prefix (first 8 chars), key_hash, scopes (JSON), last_used_at, expires_at, is_active, created_at
- On create: generate `rw_` prefixed key (secrets.token_urlsafe(32)), store hashed, return plaintext only once
- Endpoints:
  - `GET /api/api-keys` — List (show prefix, name, scopes, created_at, last_used_at — NOT the full key)
  - `POST /api/api-keys` — Create (name, scopes, optional expiry)
  - `DELETE /api/api-keys/{id}` — Revoke
- Frontend: Complete the Settings "API-Schluessel" tab — list existing keys, create form, delete button, "Wird nur einmal angezeigt" warning on create
- Tests: create, list, revoke, duplicate name rejected

---

## Task 3: Audit Log (Backend + Frontend)

**Files:**
- Create: `backend/app/models.py` (add AuditLog model)
- Create: `backend/app/audit_service.py`
- Create: `backend/app/routers/audit.py`
- Modify: `backend/app/routers/invoices.py` (add audit log calls)
- Modify: `backend/app/routers/users.py` (log profile changes)
- Create: `frontend/app/(dashboard)/audit/page.tsx`
- Modify: `frontend/components/layout/SidebarNav.tsx` (add Audit link)
- Create: `backend/tests/test_audit.py`

**What to build:**
- `AuditLog` model: id, org_id, user_id, action (str), resource_type (str), resource_id (str), details (JSON), ip_address (str), created_at — append-only
- `audit_service.py`: `log_action(db, org_id, user_id, action, resource_type, resource_id, details, request)` — non-blocking
- Actions to log: invoice_created, invoice_deleted, invoice_exported, user_profile_updated, password_changed, member_invited, member_removed, api_key_created, api_key_revoked
- Endpoint: `GET /api/audit` — paginated, filterable by action/resource/date (owner/admin only)
- Frontend: Table with timestamp, user, action badge, resource, details — export to CSV

---

## Task 4: Invoice Templates

**Files:**
- Create: `backend/app/models.py` (add InvoiceTemplate model)
- Create: `backend/app/routers/templates.py`
- Create: `backend/app/schemas_templates.py`
- Create: `frontend/app/(dashboard)/templates/page.tsx`
- Modify: `frontend/components/layout/SidebarNav.tsx` (add Templates link)
- Modify: `frontend/app/(dashboard)/manual/page.tsx` (apply template option)
- Create: `backend/tests/test_templates.py`

**What to build:**
- `InvoiceTemplate` model: id, org_id, name, logo_url, primary_color, footer_text, payment_terms (int days), bank_iban, bank_bic, bank_name, default_vat_rate, notes_template, is_default, created_at
- Endpoints: CRUD for templates
- Frontend: Template list + creation form with live preview panel (shows how the template affects invoice appearance)
- Apply template: Dropdown on manual invoice form to pre-fill seller info, payment terms, notes

---

## Task 5: Bulk Operations on Invoices

**Files:**
- Modify: `backend/app/routers/invoices.py` (add bulk endpoints)
- Modify: `frontend/app/(dashboard)/invoices/page.tsx` (add checkbox selection + bulk action bar)
- Create: `backend/tests/test_bulk_operations.py`

**What to build:**
- `POST /api/invoices/bulk-delete` — Accept list of IDs, delete all (with org isolation check)
- `POST /api/invoices/bulk-export` — Accept list of IDs + format, return ZIP with XRechnung XMLs
- `POST /api/invoices/bulk-validate` — Run KoSIT validation on all selected invoices
- Frontend: Add checkbox column to invoice table, floating bulk action bar appears when items selected (Delete, Export ZIP, Validate)
- Tests: bulk-delete, bulk-export, cross-org isolation check

---

## Task 6: Tax Summary & Reporting

**Files:**
- Modify: `backend/app/routers/invoices.py` (add tax-summary, cashflow endpoints)
- Create: `frontend/app/(dashboard)/berichte/page.tsx`
- Modify: `frontend/components/layout/SidebarNav.tsx` (add Berichte link)
- Modify: `frontend/lib/api.ts` (add report API functions)
- Create: `backend/tests/test_reports.py`

**What to build:**
- `GET /api/analytics/tax-summary?year=2026` — Total by rate: 0%, 7%, 19%, reverse charge. For each: count, net, VAT, gross. Export as CSV.
- `GET /api/analytics/cashflow?months=6` — Monthly incoming (based on invoice dates + amounts) projection
- `GET /api/analytics/overdue-aging` — Aged receivables: 0-30, 31-60, 61-90, 90+ days. By customer.
- Frontend `/berichte`: 3 report cards — Steuerauswertung, Cashflow, Faelligkeitsanalyse. Each with chart + CSV export.

---

## Task 7: GitHub Actions CI/CD Pipeline

**Files:**
- Create: `.github/workflows/tests.yml`
- Create: `.github/workflows/docker-build.yml`
- Modify: `.github/workflows/ci.yml` (add test jobs)

**What to build:**
- `tests.yml`: On push/PR — checkout, setup Python 3.13, install deps, run `pytest -v --tb=short`, fail on any test failure. Plus Node.js setup + `npm ci` + `vitest run`.
- `docker-build.yml`: On push to master — build backend + frontend Docker images, tag with commit SHA + `latest`.
- Add badge to README.md showing test status.

---

## Task 8: Alembic Migration for Phase 5

**Files:**
- Create: `backend/alembic/versions/phase5_webhooks_audit_templates.py`

**What to build:**
- Add `webhook_subscriptions` table
- Add `webhook_deliveries` table
- Add `audit_logs` table
- Add `invoice_templates` table
- Add `api_keys` table
- Use batch_alter_table for any alterations. down_revision = Phase 4 migration ID.

---

## Task 9: FAQ & Documentation Pages

**Files:**
- Create: `frontend/app/(marketing)/faq/page.tsx`
- Create: `frontend/app/(marketing)/docs/page.tsx` (self-hosting guide)
- Modify: `frontend/app/sitemap.ts` (add new pages)
- Modify: `frontend/components/layout/MarketingNav.tsx` or equivalent (add FAQ link)

**What to build:**
- FAQ page: 15 common questions with accordion UI and FAQ schema (JSON-LD)
  - Questions: E-Rechnungspflicht dates, XRechnung vs ZUGFeRD, Peppol, self-hosting, pricing, data privacy, DATEV, GoBD
- Docs/self-hosting page: Step-by-step Docker deployment guide, env variables table, backup instructions, update procedure

---

## Task 10: Blog SEO Expansion (5 New Articles)

**Files:**
- Create: `frontend/content/blog/e-rechnung-pflicht-2025.mdx`
- Create: `frontend/content/blog/xrechnung-vs-zugferd.mdx`
- Create: `frontend/content/blog/gobd-checkliste.mdx`
- Create: `frontend/content/blog/rechnungspflichtangaben.mdx`
- Create: `frontend/content/blog/umsatzsteuer-kleinunternehmer.mdx`

**What to build:**
- 5 long-form SEO articles (1500-2500 words each) targeting high-value keywords:
  1. "E-Rechnungspflicht 2025: Was Unternehmen jetzt wissen müssen" — timeline, B2B obligation, exceptions
  2. "XRechnung vs ZUGFeRD: Welches Format ist das richtige für Ihr Unternehmen?" — comparison, use cases
  3. "GoBD-Checkliste 2025: So bleiben Sie compliant" — 10-point checklist
  4. "Rechnungspflichtangaben: Was muss auf eine Rechnung?" — §14 UStG requirements
  5. "Umsatzsteuer für Kleinunternehmer: §19 UStG verständlich erklärt" — Kleinunternehmerregelung
- Each with proper frontmatter (title, description, date, author)

---

## Task 11: Webhook Management UI

**Files:**
- Create: `frontend/app/(dashboard)/webhooks/page.tsx`
- Modify: `frontend/components/layout/SidebarNav.tsx` (add Webhooks under Integrationen)
- Modify: `frontend/lib/api.ts` (add webhook API functions)

**What to build:**
- Webhook subscriptions list with status badge (active/inactive)
- "Neuen Webhook" button → form: URL, event checkboxes (invoice.created, mahnung.sent, etc.), test button
- Delivery log per webhook: timestamp, event, status (success/failed), response code
- "Test senden" button for each webhook
- Copy webhook secret button (shown only on creation)

---

## Task 12: Final Verification & Changelog v0.5.0

**Files:**
- Modify: `frontend/app/(marketing)/changelog/page.tsx`
- Run all tests + build

**What to build:**
- Add v0.5.0 changelog entry with all Phase 5 items
- Run full test suite (backend + frontend)
- Run production build
- Verify all new routes render correctly
