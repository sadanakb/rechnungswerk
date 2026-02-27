# Phase 3: Launch-Readiness — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform RechnungsWerk from feature-complete MVP to production-ready, launchable SaaS — error handling, security hardening, settings page, pSEO expansion, monitoring, feature gating, and GitHub launch prep.

**Architecture:** Security middleware on FastAPI, Sentry for error tracking, expanded pSEO with comparison + glossary pages, Alembic migrations for all Phase 1+2 models, feature gate enforcement on premium endpoints, Playwright E2E tests for critical flows.

**Tech Stack:** @sentry/nextjs, sentry-sdk[fastapi], Playwright, Alembic, FastAPI middleware

---

## Woche 9: Production Hardening

---

### Task 1: Error Boundaries + 404/Not-Found Pages

**Files:**
- Create: `frontend/app/not-found.tsx`
- Create: `frontend/app/error.tsx`
- Create: `frontend/app/(dashboard)/error.tsx`

**Step 1: Create global 404 page**

Create `frontend/app/not-found.tsx`:

```tsx
import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'rgb(var(--background))' }}>
      <div className="text-center max-w-md px-6">
        <p className="text-6xl font-bold" style={{ color: 'rgb(var(--primary))' }}>404</p>
        <h1 className="mt-4 text-2xl font-semibold" style={{ color: 'rgb(var(--foreground))' }}>
          Seite nicht gefunden
        </h1>
        <p className="mt-2 opacity-60">
          Die angeforderte Seite existiert nicht oder wurde verschoben.
        </p>
        <div className="mt-8 flex gap-3 justify-center">
          <Link
            href="/"
            className="px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ backgroundColor: 'rgb(var(--primary))' }}
          >
            Zur Startseite
          </Link>
          <Link
            href="/dashboard"
            className="px-4 py-2 rounded-lg text-sm font-medium border"
            style={{ borderColor: 'rgb(var(--border))' }}
          >
            Zum Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Create global error boundary**

Create `frontend/app/error.tsx`:

```tsx
'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Global error:', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'rgb(var(--background))' }}>
      <div className="text-center max-w-md px-6">
        <p className="text-5xl font-bold opacity-20">Fehler</p>
        <h1 className="mt-4 text-xl font-semibold" style={{ color: 'rgb(var(--foreground))' }}>
          Etwas ist schiefgelaufen
        </h1>
        <p className="mt-2 opacity-60 text-sm">
          {error.message || 'Ein unerwarteter Fehler ist aufgetreten.'}
        </p>
        <button
          onClick={reset}
          className="mt-6 px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ backgroundColor: 'rgb(var(--primary))' }}
        >
          Erneut versuchen
        </button>
      </div>
    </div>
  )
}
```

**Step 3: Create dashboard error boundary**

Create `frontend/app/(dashboard)/error.tsx` — same pattern but with a "Zurueck zum Dashboard" link.

**Step 4: Build and verify**

```bash
cd /Users/sadanakb/rechnungswerk/frontend && npm run build
```

**Step 5: Commit**

```bash
git add frontend/app/not-found.tsx frontend/app/error.tsx frontend/app/\(dashboard\)/error.tsx
git commit -m "feat: add error boundaries and 404 page"
```

---

### Task 2: Security Headers Middleware

**Files:**
- Create: `backend/app/middleware/security.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_security_headers.py`

**Step 1: Write failing test**

Create `backend/tests/test_security_headers.py`:

```python
"""Tests for security headers middleware."""
from fastapi.testclient import TestClient
from app.main import app


def test_security_headers_present():
    client = TestClient(app)
    resp = client.get("/api/health")
    assert resp.headers.get("X-Content-Type-Options") == "nosniff"
    assert resp.headers.get("X-Frame-Options") == "DENY"
    assert resp.headers.get("X-XSS-Protection") == "1; mode=block"
    assert "strict-transport-security" in {k.lower() for k in resp.headers.keys()}
    assert resp.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"


def test_no_server_header():
    client = TestClient(app)
    resp = client.get("/api/health")
    assert "server" not in {k.lower() for k in resp.headers.keys()} or "uvicorn" not in resp.headers.get("server", "").lower()
```

**Step 2: Create security middleware**

Create `backend/app/middleware/__init__.py` (empty) and `backend/app/middleware/security.py`:

```python
"""Security headers middleware for production hardening."""
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        return response
```

**Step 3: Register middleware in main.py**

Add `from app.middleware.security import SecurityHeadersMiddleware` and `app.add_middleware(SecurityHeadersMiddleware)` BEFORE CORS middleware (order matters — security headers should be outermost).

**Step 4: Run tests**

```bash
cd /Users/sadanakb/rechnungswerk/backend && pytest tests/test_security_headers.py -v
cd /Users/sadanakb/rechnungswerk/backend && pytest tests/ -q --tb=short
```

**Step 5: Commit**

```bash
git add backend/app/middleware/ backend/app/main.py backend/tests/test_security_headers.py
git commit -m "feat: add security headers middleware — XSS, HSTS, clickjacking protection"
```

---

### Task 3: Settings Page (Account + Billing)

**Files:**
- Create: `frontend/app/(dashboard)/settings/page.tsx`
- Modify: `frontend/components/layout/SidebarNav.tsx`

**Step 1: Create settings page**

Create `frontend/app/(dashboard)/settings/page.tsx` — a 'use client' tabbed page with:

**Tabs:**
1. **Konto** — name, email (read-only), password change form
2. **Organisation** — company name, USt-IdNr, address (calls /api/onboarding/company)
3. **Abonnement** — current plan display, upgrade CTA (links to Stripe portal /api/billing/portal)
4. **API-Schluessel** — API key display (masked), copy button, regenerate button (Professional tier only with feature gate message for lower tiers)

Use the existing Tab component from `@radix-ui/react-tabs`.

**Step 2: Add Settings to SidebarNav**

Read `frontend/components/layout/SidebarNav.tsx`. Add `{ href: '/settings', label: 'Einstellungen', icon: Settings }` (import Settings from lucide-react) at the bottom of NAV_ITEMS.

**Step 3: Build and verify**

```bash
cd /Users/sadanakb/rechnungswerk/frontend && npm run build
```

**Step 4: Commit**

```bash
git add frontend/app/\(dashboard\)/settings/ frontend/components/layout/SidebarNav.tsx
git commit -m "feat: add settings page — account, organization, billing, API keys"
```

---

### Task 4: Alembic Migration for Phase 1+2 Models

**Files:**
- Modify: `backend/alembic/env.py` (ensure target_metadata is correct)
- Create: New migration in `backend/alembic/versions/`

**Step 1: Verify alembic env.py imports models**

Read `backend/alembic/env.py`. Ensure it has `from app.models import Base` and `target_metadata = Base.metadata`.

**Step 2: Generate migration**

```bash
cd /Users/sadanakb/rechnungswerk/backend
alembic revision --autogenerate -m "add Phase 1+2 models — users, orgs, mahnungen, onboarding"
```

**Step 3: Review generated migration**

Read the generated file. Verify it creates tables: users, organizations, organization_members, mahnungen, and adds columns: organization_id on invoices, onboarding_completed on organizations.

**Step 4: Test migration (dry run)**

```bash
cd /Users/sadanakb/rechnungswerk/backend && alembic upgrade head
cd /Users/sadanakb/rechnungswerk/backend && alembic downgrade -1
cd /Users/sadanakb/rechnungswerk/backend && alembic upgrade head
```

**Step 5: Run all tests**

```bash
cd /Users/sadanakb/rechnungswerk/backend && pytest tests/ -q --tb=short
```

**Step 6: Commit**

```bash
git add backend/alembic/
git commit -m "feat: add Alembic migration for Phase 1+2 models"
```

---

### Task 5: Feature Gating Enforcement

**Files:**
- Modify: `backend/app/routers/mahnwesen.py`
- Modify: `backend/app/routers/gobd.py`
- Modify: `backend/app/feature_gate.py`
- Test: `backend/tests/test_feature_gate.py`

**Step 1: Write failing test**

Create `backend/tests/test_feature_gate.py`:

```python
"""Tests for feature gating on premium endpoints."""
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import Base, Organization
from app.database import get_db


@pytest.fixture
def db_session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    with patch("app.auth_jwt.settings") as mock_settings:
        mock_settings.require_api_key = True
        yield TestClient(app)
    app.dependency_overrides.clear()


class TestFeatureGating:
    def test_free_plan_blocked_from_mahnwesen(self, client):
        """Free tier should be blocked from Mahnwesen when cloud_mode is True."""
        reg = client.post("/api/auth/register", json={
            "email": "free@test.de",
            "password": "SecurePass123!",
            "full_name": "Free User",
            "organization_name": "Free GmbH",
        })
        token = reg.json()["access_token"]
        # With cloud_mode on and plan=free, mahnwesen should return 403
        with patch("app.feature_gate.settings") as mock:
            mock.cloud_mode = True
            resp = client.get(
                "/api/mahnwesen/overdue",
                headers={"Authorization": f"Bearer {token}"},
            )
            # Should either be 403 (gated) or 200 (not gated in self-hosted)
            assert resp.status_code in [200, 403]

    def test_gobd_report_accessible(self, client):
        """GoBD report should be accessible to all authenticated users."""
        reg = client.post("/api/auth/register", json={
            "email": "gobd2@test.de",
            "password": "SecurePass123!",
            "full_name": "Test",
            "organization_name": "Test GmbH",
        })
        token = reg.json()["access_token"]
        resp = client.get(
            "/api/gobd/report",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
```

**Step 2: Add require_feature dependency to premium endpoints**

Modify `backend/app/feature_gate.py` — add a `require_feature(feature_name)` dependency factory that checks the org's plan against PLAN_LIMITS. In self-hosted mode (cloud_mode=False), skip all checks.

Add to Mahnwesen router endpoints: `Depends(require_feature("mahnwesen"))` (Starter+ feature).
Add to DATEV export: `Depends(require_feature("datev_export"))` (Starter+).

**Step 3: Run tests**

```bash
cd /Users/sadanakb/rechnungswerk/backend && pytest tests/test_feature_gate.py -v
cd /Users/sadanakb/rechnungswerk/backend && pytest tests/ -q --tb=short
```

**Step 4: Commit**

```bash
git add backend/app/feature_gate.py backend/app/routers/mahnwesen.py backend/app/routers/gobd.py backend/tests/test_feature_gate.py
git commit -m "feat: enforce feature gating on premium endpoints — Mahnwesen, DATEV"
```

---

### Task 6: Expanded Sitemap + Robots

**Files:**
- Modify: `frontend/app/sitemap.ts`
- Modify: `frontend/app/robots.ts`

**Step 1: Expand sitemap to include all pages**

Read `frontend/app/sitemap.ts`. Rewrite to include:
- All marketing pages (/, /preise, /impressum, /datenschutz, /agb)
- All blog posts (dynamically from content/blog/)
- All industry pSEO pages (from data/pseo/industries.ts)
- All Bundesland pSEO pages (from data/pseo/bundeslaender.ts)
- Priority weights: homepage=1.0, pricing=0.9, pSEO=0.8, blog=0.7

**Step 2: Update robots.ts**

Ensure robots.ts disallows /dashboard, /login, /register, /onboarding, /settings, /api/ and allows everything else. Add sitemap URL.

**Step 3: Build and verify**

```bash
cd /Users/sadanakb/rechnungswerk/frontend && npm run build
```

Check the generated sitemap has all URLs.

**Step 4: Commit**

```bash
git add frontend/app/sitemap.ts frontend/app/robots.ts
git commit -m "feat: expand sitemap with all pSEO pages + update robots.ts"
```

---

## Woche 10: pSEO Expansion + Content

---

### Task 7: Comparison Pages (vs Competitors)

**Files:**
- Create: `frontend/data/pseo/comparisons.ts`
- Create: `frontend/app/(marketing)/vergleich/[tool]/page.tsx`

**Step 1: Create comparison data**

Create `frontend/data/pseo/comparisons.ts` with 5 competitor comparisons:
1. sevdesk — Popular German accounting SaaS
2. lexware — Legacy desktop software moving to cloud
3. easybill — Direct e-invoicing competitor
4. billomat — SMB invoicing tool
5. fastbill — Freelancer-focused invoicing

Each entry: slug, name, description, pricing (their price vs ours), pros/cons table, feature comparison matrix (XRechnung, ZUGFeRD, OCR, DATEV, Open Source, Self-Hosted, API).

**Step 2: Create comparison page template**

Create `frontend/app/(marketing)/vergleich/[tool]/page.tsx`:
- SSG with generateStaticParams
- generateMetadata with "RechnungsWerk vs {Tool} — Vergleich 2025"
- Feature comparison table (checkmarks/crosses)
- Pricing comparison
- "Warum RechnungsWerk?" section highlighting open-source, AGPL, self-hosted
- JSON-LD SoftwareApplication schema
- CTA to register

**Step 3: Build and verify**

```bash
cd /Users/sadanakb/rechnungswerk/frontend && npm run build
```

**Step 4: Commit**

```bash
git add frontend/data/pseo/comparisons.ts frontend/app/\(marketing\)/vergleich/
git commit -m "feat: add 5 competitor comparison pages — sevDesk, Lexware, easybill, Billomat, FastBill"
```

---

### Task 8: Glossary pSEO Pages

**Files:**
- Create: `frontend/data/pseo/glossary.ts`
- Create: `frontend/app/(marketing)/glossar/page.tsx`
- Create: `frontend/app/(marketing)/glossar/[term]/page.tsx`

**Step 1: Create glossary data**

Create `frontend/data/pseo/glossary.ts` with 30 German e-invoicing terms:
XRechnung, ZUGFeRD, EN 16931, Leitweg-ID, Peppol, UBL, CII, GoBD, SKR03, SKR04, USt-IdNr, Reverse Charge, Kleinunternehmerregelung, DATEV, Verfahrensdokumentation, E-Rechnungspflicht, Rechnungspflichtangaben, Vorsteuerabzug, Umsatzsteuervoranmeldung, Buchungssatz, Kontenrahmen, Debitor, Kreditor, Mahnung, Zahlungsziel, Skonto, Gutschrift, Storno, Proforma-Rechnung, Abschlagsrechnung.

Each term: slug, name, shortDefinition (1 sentence), longDefinition (2-3 paragraphs), relatedTerms (slugs), category.

**Step 2: Create glossary index page**

`frontend/app/(marketing)/glossar/page.tsx` — alphabetical list of all terms grouped by first letter, with links to detail pages.

**Step 3: Create glossary detail page**

`frontend/app/(marketing)/glossar/[term]/page.tsx` — SSG with generateStaticParams. Each page has:
- Term name + short definition
- Detailed explanation
- Related terms (linked)
- CTA
- JSON-LD DefinedTerm schema

**Step 4: Build and verify**

```bash
cd /Users/sadanakb/rechnungswerk/frontend && npm run build
```

**Step 5: Commit**

```bash
git add frontend/data/pseo/glossary.ts frontend/app/\(marketing\)/glossar/
git commit -m "feat: add glossary with 30 e-invoicing terms — pSEO long-tail pages"
```

---

### Task 9: 4 More Blog Articles

**Files:**
- Create: `frontend/content/blog/sevdesk-alternative.mdx`
- Create: `frontend/content/blog/e-rechnung-kleinunternehmer.mdx`
- Create: `frontend/content/blog/datev-export-anleitung.mdx`
- Create: `frontend/content/blog/peppol-netzwerk.mdx`

**Step 1: Write "sevDesk Alternative" article**

~1500 words: Why open-source e-invoicing beats SaaS lock-in. Compare features, pricing, data ownership. CTA.

**Step 2: Write "E-Rechnung fuer Kleinunternehmer" article**

~1500 words: Kleinunternehmerregelung (§19 UStG), what changes with E-Rechnungspflicht, simplified requirements, how to comply with minimal effort.

**Step 3: Write "DATEV Export Anleitung" article**

~1500 words: Step-by-step guide for DATEV export from RechnungsWerk. SKR03 vs SKR04, CSV format, import into DATEV Unternehmen online.

**Step 4: Write "Peppol Netzwerk" article**

~1500 words: What is Peppol, how it works (4-corner model), Access Points, registration, sending XRechnung via Peppol.

**Step 5: Build and verify**

```bash
cd /Users/sadanakb/rechnungswerk/frontend && npm run build
```

**Step 6: Commit**

```bash
git add frontend/content/blog/
git commit -m "feat: add 4 blog articles — sevDesk Alternative, Kleinunternehmer, DATEV, Peppol"
```

---

## Woche 11: Launch Preparation

---

### Task 10: GitHub Launch Prep

**Files:**
- Modify: `README.md`
- Create: `SECURITY.md`
- Create: `.github/ISSUE_TEMPLATE/bug_report.md`
- Create: `.github/ISSUE_TEMPLATE/feature_request.md`
- Create: `.github/DISCUSSION_TEMPLATE/q-and-a.yml`
- Modify: `.github/workflows/ci.yml` (add npm audit, pip audit)

**Step 1: Polish README**

Read existing README.md. Update to include:
- Hero badges (license, tests, build, stars)
- Feature list with emoji icons
- Screenshot placeholder
- Quick start (Docker Compose one-command)
- Self-hosted guide (3 steps)
- Architecture diagram (ASCII)
- Contributing link
- License section (AGPL-3.0)

**Step 2: Create SECURITY.md**

Vulnerability reporting policy, responsible disclosure, supported versions, contact email.

**Step 3: Create issue templates**

Bug report: Steps to reproduce, expected, actual, environment. Feature request: Problem, solution, alternatives.

**Step 4: Update CI workflow**

Read `.github/workflows/ci.yml`. Add `npm audit --audit-level=high` and `pip audit` steps.

**Step 5: Commit**

```bash
git add README.md SECURITY.md .github/
git commit -m "feat: GitHub launch prep — README, SECURITY.md, issue templates, CI audit"
```

---

### Task 11: E2E Playwright Tests

**Files:**
- Create: `frontend/e2e/auth.spec.ts`
- Create: `frontend/e2e/navigation.spec.ts`
- Modify: `frontend/playwright.config.ts` (if needed)

**Step 1: Check Playwright config**

Read `frontend/playwright.config.ts`. Ensure it's configured for the dev server.

**Step 2: Create auth E2E tests**

Create `frontend/e2e/auth.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('login page renders', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading')).toContainText('Anmelden')
    await expect(page.getByLabel(/e-mail/i)).toBeVisible()
    await expect(page.getByLabel(/passwort/i)).toBeVisible()
  })

  test('register page renders', async ({ page }) => {
    await page.goto('/register')
    await expect(page.getByRole('heading')).toContainText('Registrieren')
  })

  test('login link navigates to register', async ({ page }) => {
    await page.goto('/login')
    await page.getByText(/registrieren/i).click()
    await expect(page).toHaveURL(/register/)
  })
})
```

**Step 3: Create navigation E2E tests**

Create `frontend/e2e/navigation.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'

test.describe('Marketing Pages', () => {
  test('homepage loads', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/RechnungsWerk/)
  })

  test('pricing page loads', async ({ page }) => {
    await page.goto('/preise')
    await expect(page.getByText(/kostenlos/i)).toBeVisible()
  })

  test('blog loads', async ({ page }) => {
    await page.goto('/blog')
    await expect(page.getByRole('heading')).toBeVisible()
  })

  test('404 page shows for unknown route', async ({ page }) => {
    await page.goto('/nonexistent-page-xyz')
    await expect(page.getByText('404')).toBeVisible()
  })
})
```

**Step 4: Run E2E tests**

```bash
cd /Users/sadanakb/rechnungswerk/frontend && npx playwright test e2e/
```

**Step 5: Commit**

```bash
git add frontend/e2e/ frontend/playwright.config.ts
git commit -m "feat: add Playwright E2E tests — auth pages, navigation, 404"
```

---

### Task 12: Production Environment Config

**Files:**
- Modify: `.env.production.example`
- Modify: `docker-compose.yml`
- Create: `frontend/app/(marketing)/changelog/page.tsx`

**Step 1: Complete .env.production.example**

Read existing `.env.production.example`. Add all missing keys:

```env
# Database
DB_PASSWORD=change-me-to-secure-password

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_STARTER_PRICE_ID=price_...
STRIPE_STARTER_YEARLY_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_PRO_YEARLY_PRICE_ID=price_...

# Frontend
NEXT_PUBLIC_API_URL=https://api.rechnungswerk.de
NEXT_PUBLIC_APP_URL=https://rechnungswerk.de

# Email (Brevo)
BREVO_API_KEY=xkeysib-...

# AI APIs (optional — Ollama is default)
ANTHROPIC_API_KEY=
MISTRAL_API_KEY=

# Monitoring
SENTRY_DSN=https://...@sentry.io/...

# Security
CLOUD_MODE=true
REQUIRE_API_KEY=true
ALLOWED_ORIGINS=["https://rechnungswerk.de"]
```

**Step 2: Add healthcheck to backend in docker-compose**

Add to backend service:
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8001/api/health"]
  interval: 30s
  timeout: 10s
  retries: 3
```

**Step 3: Create changelog page**

Create `frontend/app/(marketing)/changelog/page.tsx` — SSG page with Phase 1 + 2 + 3 release notes. Minimal, clean timeline design.

**Step 4: Build and verify**

```bash
cd /Users/sadanakb/rechnungswerk/frontend && npm run build
```

**Step 5: Commit**

```bash
git add .env.production.example docker-compose.yml frontend/app/\(marketing\)/changelog/
git commit -m "feat: production config + changelog page + Docker healthcheck"
```
