# Phase 2: Features + SEO — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add revenue features (Mahnwesen, DATEV polish), power-user UX (TanStack Table, cmdk, Onboarding), KI-API migration, and programmatic SEO engine — transforming RechnungsWerk from MVP to feature-rich product.

**Architecture:** Mahnwesen as 3-level state machine with Brevo email delivery. TanStack Table replaces custom invoice table. cmdk for Cmd+K navigation. pSEO via Next.js dynamic routes with generateStaticParams. KI migration adds Mistral/Claude API clients alongside Ollama fallback.

**Tech Stack:** @tanstack/react-table 8, cmdk 1.0, sib-api-v3-sdk (Brevo), anthropic SDK, mistralai SDK, reportlab (PDF), gray-matter (MDX)

**Timeline:** 4 weeks (Woche 5-8, April 2026)

---

## Woche 5-6: Revenue Features + UX

---

### Task 1: Install Phase 2 Dependencies

**Files:**
- Modify: `frontend/package.json`
- Modify: `backend/requirements.txt`

**Step 1: Install frontend dependencies**

Run:
```bash
cd /Users/sadanakb/rechnungswerk/frontend
npm install @tanstack/react-table cmdk
```

**Step 2: Install backend dependencies**

Add to `backend/requirements.txt`:
```
# Email (Brevo Transactional)
sib-api-v3-sdk>=7.6.0

# KI APIs (Phase 2 migration)
anthropic>=0.50.0
mistralai>=1.0.0

# PDF Generation (GoBD docs)
reportlab>=4.2.0
```

Run:
```bash
cd /Users/sadanakb/rechnungswerk/backend
pip install -r requirements.txt
```

**Step 3: Verify nothing breaks**

Run:
```bash
cd /Users/sadanakb/rechnungswerk/backend && pytest tests/ -q --tb=short
cd /Users/sadanakb/rechnungswerk/frontend && npx vitest run
```
Expected: All 198 backend + 71 frontend tests pass.

**Step 4: Commit**

```bash
git add backend/requirements.txt frontend/package.json frontend/package-lock.json
git commit -m "chore: install Phase 2 deps — TanStack Table, cmdk, Brevo, Anthropic, reportlab"
```

---

### Task 2: Mahnwesen Backend (Dunning System)

**Files:**
- Create: `backend/app/models.py` (add Mahnung model)
- Create: `backend/app/routers/mahnwesen.py`
- Create: `backend/app/schemas_mahnwesen.py`
- Modify: `backend/app/main.py` (add router)
- Test: `backend/tests/test_mahnwesen.py`

**Step 1: Write the failing tests**

Create `backend/tests/test_mahnwesen.py`:

```python
"""Tests for Mahnwesen (dunning) system."""
import pytest
from unittest.mock import patch
from datetime import date, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import Base, Invoice, Organization, User, OrganizationMember
from app.database import get_db


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
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


def register_and_get_token(client, email="mahn@test.de"):
    resp = client.post("/api/auth/register", json={
        "email": email,
        "password": "SecurePass123!",
        "full_name": "Test",
        "organization_name": "Mahn GmbH",
    })
    return resp.json()["access_token"]


def create_overdue_invoice(client, token, days_overdue=30):
    """Create an invoice with a past due date."""
    due = date.today() - timedelta(days=days_overdue)
    resp = client.post(
        "/api/invoices",
        json={
            "invoice_number": f"INV-OVERDUE-{days_overdue}",
            "seller_name": "Seller",
            "buyer_name": "Buyer",
            "buyer_address": "Test Str. 1, 12345 Berlin",
            "net_amount": 1000.0,
            "tax_amount": 190.0,
            "gross_amount": 1190.0,
            "due_date": due.isoformat(),
            "line_items": [{"description": "Test", "quantity": 1, "unit_price": 1000, "net_amount": 1000, "tax_rate": 19}],
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    return resp.json()


class TestCreateMahnung:
    def test_create_mahnung_for_overdue_invoice(self, client):
        token = register_and_get_token(client)
        inv = create_overdue_invoice(client, token, days_overdue=30)

        resp = client.post(
            f"/api/mahnwesen/{inv['invoice_id']}/mahnung",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["level"] == 1
        assert data["invoice_id"] == inv["invoice_id"]

    def test_second_mahnung_increments_level(self, client):
        token = register_and_get_token(client)
        inv = create_overdue_invoice(client, token, days_overdue=60)

        # First Mahnung
        client.post(
            f"/api/mahnwesen/{inv['invoice_id']}/mahnung",
            headers={"Authorization": f"Bearer {token}"},
        )
        # Second Mahnung
        resp = client.post(
            f"/api/mahnwesen/{inv['invoice_id']}/mahnung",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 201
        assert resp.json()["level"] == 2

    def test_max_three_levels(self, client):
        token = register_and_get_token(client)
        inv = create_overdue_invoice(client, token, days_overdue=90)

        for _ in range(3):
            client.post(
                f"/api/mahnwesen/{inv['invoice_id']}/mahnung",
                headers={"Authorization": f"Bearer {token}"},
            )
        # Fourth should fail
        resp = client.post(
            f"/api/mahnwesen/{inv['invoice_id']}/mahnung",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 400


class TestListMahnungen:
    def test_list_mahnungen_for_invoice(self, client):
        token = register_and_get_token(client, "list@test.de")
        inv = create_overdue_invoice(client, token, days_overdue=30)

        client.post(
            f"/api/mahnwesen/{inv['invoice_id']}/mahnung",
            headers={"Authorization": f"Bearer {token}"},
        )

        resp = client.get(
            f"/api/mahnwesen/{inv['invoice_id']}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_list_all_overdue(self, client):
        token = register_and_get_token(client, "overdue@test.de")
        create_overdue_invoice(client, token, days_overdue=30)

        resp = client.get(
            "/api/mahnwesen/overdue",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert len(resp.json()) >= 1
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/sadanakb/rechnungswerk/backend && pytest tests/test_mahnwesen.py -v`
Expected: FAIL — router not found.

**Step 3: Add Mahnung model to models.py**

Add to `backend/app/models.py` (after ArchiveEntry class):

```python
class Mahnung(Base):
    """Dunning/reminder record for overdue invoices"""
    __tablename__ = 'mahnungen'

    id = Column(Integer, primary_key=True)
    mahnung_id = Column(String, unique=True, index=True)
    invoice_id = Column(String, ForeignKey('invoices.invoice_id'), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey('organizations.id'), nullable=False)
    level = Column(Integer, nullable=False)  # 1, 2, or 3
    fee = Column(Numeric(8, 2), default=0)  # Mahngebuehr
    interest = Column(Numeric(8, 2), default=0)  # Verzugszinsen
    total_due = Column(Numeric(12, 2))  # Original amount + fees + interest
    status = Column(String(20), default="created")  # created, sent, paid, cancelled
    sent_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utc_now)

    invoice = relationship("Invoice")
```

**Step 4: Create schemas**

Create `backend/app/schemas_mahnwesen.py`:

```python
"""Mahnwesen (dunning) schemas."""
from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class MahnungResponse(BaseModel):
    mahnung_id: str
    invoice_id: str
    level: int
    fee: float
    interest: float
    total_due: float
    status: str
    sent_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class OverdueInvoiceResponse(BaseModel):
    invoice_id: str
    invoice_number: str
    buyer_name: str
    gross_amount: float
    due_date: str
    days_overdue: int
    mahnung_count: int
```

**Step 5: Create router**

Create `backend/app/routers/mahnwesen.py`:

```python
"""Mahnwesen (dunning) router — 3-level configurable dunning system."""
import uuid
import logging
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth_jwt import get_current_user
from app.models import Invoice, Mahnung, Organization, OrganizationMember
from app.schemas_mahnwesen import MahnungResponse, OverdueInvoiceResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/mahnwesen", tags=["mahnwesen"])

# Dunning level configuration
MAHNUNG_CONFIG = {
    1: {"fee": Decimal("5.00"), "interest_rate": Decimal("0.00"), "label": "Zahlungserinnerung"},
    2: {"fee": Decimal("10.00"), "interest_rate": Decimal("5.00"), "label": "1. Mahnung"},
    3: {"fee": Decimal("15.00"), "interest_rate": Decimal("8.00"), "label": "2. Mahnung (letzte)"},
}


def _get_org_id(current_user: dict, db: Session) -> int:
    member = db.query(OrganizationMember).filter(
        OrganizationMember.user_id == int(current_user["user_id"])
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Organisation nicht gefunden")
    return member.organization_id


@router.post("/{invoice_id}/mahnung", response_model=MahnungResponse, status_code=201)
def create_mahnung(
    invoice_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    org_id = _get_org_id(current_user, db)

    # Find invoice
    invoice = db.query(Invoice).filter(
        Invoice.invoice_id == invoice_id,
        Invoice.organization_id == org_id,
    ).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")

    # Check existing mahnungen
    existing = db.query(Mahnung).filter(
        Mahnung.invoice_id == invoice_id
    ).order_by(Mahnung.level.desc()).all()

    current_level = existing[0].level if existing else 0
    next_level = current_level + 1

    if next_level > 3:
        raise HTTPException(status_code=400, detail="Maximale Mahnstufe (3) bereits erreicht")

    config = MAHNUNG_CONFIG[next_level]
    gross = invoice.gross_amount or Decimal("0")
    interest = (gross * config["interest_rate"] / 100).quantize(Decimal("0.01"))
    total_due = gross + config["fee"] + interest

    mahnung = Mahnung(
        mahnung_id=f"MHN-{uuid.uuid4().hex[:8].upper()}",
        invoice_id=invoice_id,
        organization_id=org_id,
        level=next_level,
        fee=config["fee"],
        interest=interest,
        total_due=total_due,
        status="created",
    )
    db.add(mahnung)
    db.commit()
    db.refresh(mahnung)

    return MahnungResponse.model_validate(mahnung)


@router.get("/{invoice_id}", response_model=list[MahnungResponse])
def list_mahnungen(
    invoice_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    org_id = _get_org_id(current_user, db)

    mahnungen = db.query(Mahnung).filter(
        Mahnung.invoice_id == invoice_id,
        Mahnung.organization_id == org_id,
    ).order_by(Mahnung.level).all()

    return [MahnungResponse.model_validate(m) for m in mahnungen]


@router.get("/overdue", response_model=list[OverdueInvoiceResponse])
def list_overdue_invoices(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    org_id = _get_org_id(current_user, db)
    today = date.today()

    invoices = db.query(Invoice).filter(
        Invoice.organization_id == org_id,
        Invoice.due_date < today,
        Invoice.due_date.isnot(None),
    ).all()

    result = []
    for inv in invoices:
        mahnung_count = db.query(Mahnung).filter(
            Mahnung.invoice_id == inv.invoice_id
        ).count()
        days_overdue = (today - inv.due_date).days

        result.append(OverdueInvoiceResponse(
            invoice_id=inv.invoice_id,
            invoice_number=inv.invoice_number or "",
            buyer_name=inv.buyer_name or "",
            gross_amount=float(inv.gross_amount or 0),
            due_date=inv.due_date.isoformat(),
            days_overdue=days_overdue,
            mahnung_count=mahnung_count,
        ))

    return result
```

**Step 6: Register router in main.py**

Add to `backend/app/main.py`:
```python
from app.routers import mahnwesen
```
And:
```python
app.include_router(mahnwesen.router)
```

**Step 7: Run tests**

Run: `cd /Users/sadanakb/rechnungswerk/backend && pytest tests/test_mahnwesen.py -v`
Expected: All 5 tests PASS.

Run: `cd /Users/sadanakb/rechnungswerk/backend && pytest tests/ -q --tb=short`
Expected: All tests pass (198 + 5 = 203).

**Step 8: Commit**

```bash
git add backend/app/models.py backend/app/routers/mahnwesen.py backend/app/schemas_mahnwesen.py backend/app/main.py backend/tests/test_mahnwesen.py
git commit -m "feat: add Mahnwesen — 3-level dunning system with fees and interest"
```

---

### Task 3: cmdk Command Palette

**Files:**
- Create: `frontend/components/CommandPalette.tsx`
- Modify: `frontend/app/(dashboard)/layout.tsx` (add CommandPalette)
- Test: `frontend/__tests__/command-palette.test.tsx`

**Step 1: Write the failing test**

Create `frontend/__tests__/command-palette.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

describe('CommandPalette', () => {
  it('renders when open', async () => {
    const { CommandPalette } = await import('../components/CommandPalette')
    render(<CommandPalette open={true} onOpenChange={() => {}} />)
    expect(screen.getByPlaceholderText(/suchen/i)).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/sadanakb/rechnungswerk/frontend && npx vitest run __tests__/command-palette.test.tsx`
Expected: FAIL — module not found.

**Step 3: Create CommandPalette component**

Create `frontend/components/CommandPalette.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const NAVIGATION_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', group: 'Navigation' },
  { label: 'Rechnungen', href: '/invoices', group: 'Navigation' },
  { label: 'Neue Rechnung (OCR)', href: '/ocr', group: 'Navigation' },
  { label: 'Manuelle Rechnung', href: '/manual', group: 'Navigation' },
  { label: 'Wiederkehrende Rechnungen', href: '/recurring', group: 'Navigation' },
  { label: 'Lieferanten', href: '/suppliers', group: 'Navigation' },
  { label: 'Mahnwesen', href: '/mahnwesen', group: 'Navigation' },
  { label: 'Validierung', href: '/validator', group: 'Navigation' },
  { label: 'Analytik', href: '/analytics', group: 'Navigation' },
]

const ACTION_ITEMS = [
  { label: 'Neue Rechnung erstellen', href: '/manual', group: 'Aktionen' },
  { label: 'PDF hochladen (OCR)', href: '/ocr', group: 'Aktionen' },
  { label: 'Einstellungen', href: '/settings', group: 'Aktionen' },
]

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter()

  const handleSelect = (href: string) => {
    onOpenChange(false)
    router.push(href)
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Suche und Navigation"
      className="fixed inset-0 z-[100]"
    >
      <div
        className="fixed inset-0 bg-black/50"
        onClick={() => onOpenChange(false)}
      />
      <div
        className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg rounded-xl border shadow-2xl overflow-hidden"
        style={{
          backgroundColor: 'rgb(var(--card))',
          borderColor: 'rgb(var(--border))',
        }}
      >
        <Command.Input
          placeholder="Suchen oder navigieren..."
          className="w-full px-4 py-3 text-base border-b outline-none"
          style={{
            borderColor: 'rgb(var(--border))',
            backgroundColor: 'transparent',
          }}
        />
        <Command.List className="max-h-72 overflow-y-auto p-2">
          <Command.Empty className="py-6 text-center text-sm opacity-50">
            Keine Ergebnisse gefunden.
          </Command.Empty>

          <Command.Group heading="Navigation" className="text-xs font-semibold opacity-50 px-2 py-1">
            {NAVIGATION_ITEMS.map((item) => (
              <Command.Item
                key={item.href}
                value={item.label}
                onSelect={() => handleSelect(item.href)}
                className="flex items-center gap-2 px-2 py-2 rounded-md text-sm cursor-pointer data-[selected=true]:opacity-100 opacity-70"
                style={{ backgroundColor: 'var(--cmdk-item-bg, transparent)' }}
              >
                {item.label}
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Separator className="h-px my-1" style={{ backgroundColor: 'rgb(var(--border))' }} />

          <Command.Group heading="Aktionen" className="text-xs font-semibold opacity-50 px-2 py-1">
            {ACTION_ITEMS.map((item) => (
              <Command.Item
                key={item.href + item.label}
                value={item.label}
                onSelect={() => handleSelect(item.href)}
                className="flex items-center gap-2 px-2 py-2 rounded-md text-sm cursor-pointer opacity-70 data-[selected=true]:opacity-100"
              >
                {item.label}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>

        <div
          className="flex items-center justify-between px-4 py-2 border-t text-xs opacity-40"
          style={{ borderColor: 'rgb(var(--border))' }}
        >
          <span>↑↓ Navigieren</span>
          <span>↵ Oeffnen</span>
          <span>Esc Schliessen</span>
        </div>
      </div>
    </Command.Dialog>
  )
}
```

**Step 4: Add to dashboard layout**

Modify `frontend/app/(dashboard)/layout.tsx` — add CommandPalette with Cmd+K shortcut:

```tsx
'use client'

import { useState, useEffect } from 'react'
import { CommandPalette } from '@/components/CommandPalette'

// In the component:
const [cmdkOpen, setCmdkOpen] = useState(false)

useEffect(() => {
  const down = (e: KeyboardEvent) => {
    if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      setCmdkOpen((open) => !open)
    }
  }
  document.addEventListener('keydown', down)
  return () => document.removeEventListener('keydown', down)
}, [])

// In the JSX, add:
<CommandPalette open={cmdkOpen} onOpenChange={setCmdkOpen} />
```

**Step 5: Run tests**

Run: `cd /Users/sadanakb/rechnungswerk/frontend && npx vitest run`
Expected: All tests pass.

**Step 6: Build**

Run: `cd /Users/sadanakb/rechnungswerk/frontend && npm run build`
Expected: Build succeeds.

**Step 7: Commit**

```bash
git add frontend/components/CommandPalette.tsx frontend/app/\(dashboard\)/layout.tsx frontend/__tests__/command-palette.test.tsx
git commit -m "feat: add Cmd+K command palette for quick navigation"
```

---

### Task 4: Onboarding Wizard

**Files:**
- Create: `frontend/app/(dashboard)/onboarding/page.tsx`
- Create: `frontend/components/onboarding/OnboardingWizard.tsx`
- Create: `backend/app/routers/onboarding.py`
- Modify: `backend/app/models.py` (add onboarding_completed to Organization)
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_onboarding.py`

**Step 1: Write failing backend test**

Create `backend/tests/test_onboarding.py`:

```python
"""Tests for onboarding endpoints."""
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import Base
from app.database import get_db


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
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


def register_and_get_token(client):
    resp = client.post("/api/auth/register", json={
        "email": "onboard@test.de",
        "password": "SecurePass123!",
        "full_name": "Test",
        "organization_name": "New GmbH",
    })
    return resp.json()["access_token"]


class TestOnboarding:
    def test_get_onboarding_status(self, client):
        token = register_and_get_token(client)
        resp = client.get(
            "/api/onboarding/status",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["completed"] is False

    def test_update_company_info(self, client):
        token = register_and_get_token(client)
        resp = client.post(
            "/api/onboarding/company",
            json={
                "vat_id": "DE123456789",
                "address": "Musterstr. 1, 12345 Berlin",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200

    def test_complete_onboarding(self, client):
        token = register_and_get_token(client)
        resp = client.post(
            "/api/onboarding/complete",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["completed"] is True
```

**Step 2: Add onboarding_completed to Organization model**

Add to Organization in `backend/app/models.py`:
```python
onboarding_completed = Column(Boolean, default=False)
```

**Step 3: Create onboarding router**

Create `backend/app/routers/onboarding.py`:

```python
"""Onboarding router — guides new organizations through setup."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.auth_jwt import get_current_user
from app.models import Organization, OrganizationMember

router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])


class CompanyInfoRequest(BaseModel):
    vat_id: Optional[str] = None
    address: Optional[str] = None
    logo_url: Optional[str] = None


class OnboardingStatus(BaseModel):
    completed: bool
    org_name: str
    has_vat_id: bool
    has_address: bool


def _get_org(current_user: dict, db: Session) -> Organization:
    member = db.query(OrganizationMember).filter(
        OrganizationMember.user_id == int(current_user["user_id"])
    ).first()
    if not member:
        raise HTTPException(status_code=404)
    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if not org:
        raise HTTPException(status_code=404)
    return org


@router.get("/status", response_model=OnboardingStatus)
def get_status(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    org = _get_org(current_user, db)
    return OnboardingStatus(
        completed=org.onboarding_completed or False,
        org_name=org.name,
        has_vat_id=bool(org.vat_id),
        has_address=bool(org.address),
    )


@router.post("/company")
def update_company_info(
    req: CompanyInfoRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    org = _get_org(current_user, db)
    if req.vat_id is not None:
        org.vat_id = req.vat_id
    if req.address is not None:
        org.address = req.address
    if req.logo_url is not None:
        org.logo_url = req.logo_url
    db.commit()
    return {"status": "updated"}


@router.post("/complete", response_model=OnboardingStatus)
def complete_onboarding(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    org = _get_org(current_user, db)
    org.onboarding_completed = True
    db.commit()
    return OnboardingStatus(
        completed=True,
        org_name=org.name,
        has_vat_id=bool(org.vat_id),
        has_address=bool(org.address),
    )
```

**Step 4: Register router in main.py**

Add to imports and include_router.

**Step 5: Create frontend onboarding page**

Create `frontend/app/(dashboard)/onboarding/page.tsx` — a 4-step wizard:
1. Firmendaten (company info: vat_id, address)
2. Logo hochladen
3. Erste Rechnung erstellen (CTA)
4. Fertig

The page should be a 'use client' component with state tracking the current step.

**Step 6: Run tests**

```bash
cd /Users/sadanakb/rechnungswerk/backend && pytest tests/test_onboarding.py -v
cd /Users/sadanakb/rechnungswerk/backend && pytest tests/ -q --tb=short
cd /Users/sadanakb/rechnungswerk/frontend && npm run build
```

**Step 7: Commit**

```bash
git add backend/app/models.py backend/app/routers/onboarding.py backend/app/main.py backend/tests/test_onboarding.py frontend/app/\(dashboard\)/onboarding/
git commit -m "feat: add onboarding wizard — 4-step setup for new organizations"
```

---

### Task 5: TanStack Table for Invoices

**Files:**
- Create: `frontend/components/InvoiceTable.tsx`
- Modify: `frontend/app/(dashboard)/invoices/page.tsx` (replace current table)
- Test: `frontend/__tests__/invoice-table.test.tsx`

**Step 1: Write failing test**

Create `frontend/__tests__/invoice-table.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

describe('InvoiceTable', () => {
  it('renders table headers', async () => {
    const { InvoiceTable } = await import('../components/InvoiceTable')
    render(<InvoiceTable invoices={[]} loading={false} />)
    expect(screen.getByText(/rechnungsnr/i)).toBeInTheDocument()
    expect(screen.getByText(/datum/i)).toBeInTheDocument()
    expect(screen.getByText(/betrag/i)).toBeInTheDocument()
  })
})
```

**Step 2: Create InvoiceTable with TanStack Table**

Create `frontend/components/InvoiceTable.tsx` — a fully-featured table with:
- Column sorting (click header)
- Search/filter input
- Pagination controls
- Row selection for bulk actions
- Status badges (valid/invalid/pending)

Use `@tanstack/react-table` with `useReactTable`, `getCoreRowModel`, `getSortedRowModel`, `getFilteredRowModel`, `getPaginationRowModel`.

**Step 3: Replace current invoices page table**

Read the existing `frontend/app/(dashboard)/invoices/page.tsx` and replace the custom table implementation with the new TanStack-based `InvoiceTable`.

**Step 4: Run tests and build**

```bash
cd /Users/sadanakb/rechnungswerk/frontend && npx vitest run && npm run build
```

**Step 5: Commit**

```bash
git add frontend/components/InvoiceTable.tsx frontend/app/\(dashboard\)/invoices/page.tsx frontend/__tests__/invoice-table.test.tsx
git commit -m "feat: replace invoice table with TanStack Table — sort, filter, paginate"
```

---

### Task 6: KI API Migration (Ollama → Hybrid API)

**Files:**
- Create: `backend/app/ai_service.py`
- Modify: `backend/app/config.py` (add AI config)
- Modify: `backend/app/routers/invoices.py` (use ai_service for categorization)
- Test: `backend/tests/test_ai_service.py`

**Step 1: Write failing test**

Create `backend/tests/test_ai_service.py`:

```python
"""Tests for AI service — hybrid API routing."""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock

from app.ai_service import categorize_invoice, AiProvider


class TestCategorizeInvoice:
    @patch("app.ai_service._call_anthropic")
    def test_categorize_with_claude(self, mock_claude):
        mock_claude.return_value = {"skr03_account": "4400", "category": "Buerokosten"}
        result = categorize_invoice(
            seller_name="Staples",
            description="Bueroartikel",
            amount=59.99,
            provider=AiProvider.ANTHROPIC,
        )
        assert result["skr03_account"] == "4400"

    @patch("app.ai_service._call_ollama")
    def test_fallback_to_ollama(self, mock_ollama):
        mock_ollama.return_value = {"skr03_account": "4400", "category": "Buerokosten"}
        result = categorize_invoice(
            seller_name="Staples",
            description="Bueroartikel",
            amount=59.99,
            provider=AiProvider.OLLAMA,
        )
        assert "skr03_account" in result
```

**Step 2: Create AI service**

Create `backend/app/ai_service.py`:

```python
"""Hybrid AI service — routes between API providers and local Ollama."""
import json
import logging
from enum import Enum
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)


class AiProvider(str, Enum):
    ANTHROPIC = "anthropic"
    MISTRAL = "mistral"
    OLLAMA = "ollama"
    AUTO = "auto"  # Choose best available


CATEGORIZATION_PROMPT = """Kategorisiere diese Rechnung nach SKR03.
Verkäufer: {seller_name}
Beschreibung: {description}
Betrag: {amount} EUR

Antwort als JSON: {{"skr03_account": "XXXX", "category": "Kategoriename"}}"""


def categorize_invoice(
    seller_name: str,
    description: str,
    amount: float,
    provider: AiProvider = AiProvider.AUTO,
) -> dict:
    prompt = CATEGORIZATION_PROMPT.format(
        seller_name=seller_name,
        description=description,
        amount=amount,
    )

    if provider == AiProvider.AUTO:
        provider = _select_provider()

    try:
        if provider == AiProvider.ANTHROPIC:
            return _call_anthropic(prompt)
        elif provider == AiProvider.MISTRAL:
            return _call_mistral(prompt)
        else:
            return _call_ollama(prompt)
    except Exception as e:
        logger.warning("AI provider %s failed: %s, falling back to Ollama", provider, e)
        return _call_ollama(prompt)


def _select_provider() -> AiProvider:
    if settings.anthropic_api_key:
        return AiProvider.ANTHROPIC
    if settings.mistral_api_key:
        return AiProvider.MISTRAL
    return AiProvider.OLLAMA


def _call_anthropic(prompt: str) -> dict:
    from anthropic import Anthropic
    client = Anthropic(api_key=settings.anthropic_api_key)
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=200,
        messages=[{"role": "user", "content": prompt}],
    )
    return json.loads(response.content[0].text)


def _call_mistral(prompt: str) -> dict:
    from mistralai import Mistral
    client = Mistral(api_key=settings.mistral_api_key)
    response = client.chat.complete(
        model="mistral-small-latest",
        messages=[{"role": "user", "content": prompt}],
    )
    return json.loads(response.choices[0].message.content)


def _call_ollama(prompt: str) -> dict:
    import ollama
    response = ollama.chat(
        model=settings.ollama_model,
        messages=[{"role": "user", "content": prompt}],
    )
    return json.loads(response["message"]["content"])
```

**Step 3: Add AI config to settings**

Add to `backend/app/config.py`:
```python
# AI API Keys
anthropic_api_key: str = ""
mistral_api_key: str = ""
ollama_model: str = "qwen2.5:14b"
ai_provider: str = "auto"  # auto, anthropic, mistral, ollama
```

**Step 4: Run tests**

```bash
cd /Users/sadanakb/rechnungswerk/backend && pytest tests/test_ai_service.py -v
cd /Users/sadanakb/rechnungswerk/backend && pytest tests/ -q --tb=short
```

**Step 5: Commit**

```bash
git add backend/app/ai_service.py backend/app/config.py backend/tests/test_ai_service.py
git commit -m "feat: add hybrid AI service — Anthropic/Mistral/Ollama with auto-routing"
```

---

## Woche 7-8: SEO + Content

---

### Task 7: Programmatic SEO Engine (Industry Pages)

**Files:**
- Create: `frontend/data/pseo/industries.ts`
- Create: `frontend/app/(marketing)/e-rechnung/[branche]/page.tsx`
- Create: `frontend/app/(marketing)/e-rechnung/[bundesland]/page.tsx`

**Step 1: Create industry data**

Create `frontend/data/pseo/industries.ts`:

```typescript
export interface IndustryPage {
  slug: string
  name: string
  description: string
  challenges: string[]
  benefits: string[]
  invoiceVolume: string
  regulations: string[]
}

export const industries: IndustryPage[] = [
  {
    slug: "handwerk",
    name: "Handwerk",
    description: "E-Rechnungen fuer Handwerksbetriebe — Pflicht ab 2025",
    challenges: [
      "Viele Kleinbetragsrechnungen",
      "Baustellen-Dokumentation",
      "Nachunternehmer-Abrechnungen",
    ],
    benefits: [
      "Automatische Rechnungserstellung nach Aufmass",
      "XRechnung fuer oeffentliche Auftraege",
      "DATEV-Export fuer den Steuerberater",
    ],
    invoiceVolume: "50-200 Rechnungen/Monat",
    regulations: ["E-Rechnungspflicht ab 2025", "VOB-konforme Abrechnung"],
  },
  {
    slug: "it-dienstleister",
    name: "IT-Dienstleister",
    description: "E-Rechnungen fuer IT-Unternehmen und Agenturen",
    challenges: [
      "Projektbasierte Abrechnung",
      "Internationale Kunden (Reverse Charge)",
      "Wiederkehrende Lizenzen",
    ],
    benefits: [
      "Automatisierte Abo-Rechnungen",
      "API-Integration in bestehende Tools",
      "Multi-Waehrungs-Support",
    ],
    invoiceVolume: "20-100 Rechnungen/Monat",
    regulations: ["E-Rechnungspflicht ab 2025", "Reverse Charge § 13b UStG"],
  },
  // ... 18 more industries (see implementation)
]
```

Add at least 10 industries: Handwerk, IT-Dienstleister, Gastronomie, Einzelhandel, Freiberufler, Immobilien, Logistik, Gesundheitswesen, Beratung, E-Commerce.

**Step 2: Create industry page template**

Create `frontend/app/(marketing)/e-rechnung/[branche]/page.tsx`:

SSG page with `generateStaticParams`. Each page has:
- SEO metadata with industry-specific title/description
- Hero section for the industry
- Challenges + benefits
- CTA to register
- JSON-LD with industry-specific schema
- FAQ section

**Step 3: Create Bundesland data + pages**

Create `frontend/data/pseo/bundeslaender.ts` with all 16 German states.
Create `frontend/app/(marketing)/e-rechnung/bundesland/[land]/page.tsx`.

**Step 4: Build and verify**

```bash
cd /Users/sadanakb/rechnungswerk/frontend && npm run build
```
Expected: All industry and Bundesland pages are statically generated.

**Step 5: Commit**

```bash
git add frontend/data/pseo/ frontend/app/\(marketing\)/e-rechnung/
git commit -m "feat: add pSEO engine — 10 industry + 16 Bundesland pages with JSON-LD"
```

---

### Task 8: Additional Blog Articles

**Files:**
- Create: `frontend/content/blog/xrechnung-guide.mdx`
- Create: `frontend/content/blog/zugferd-erklaerung.mdx`
- Create: `frontend/content/blog/gobd-compliance.mdx`

**Step 1: Write XRechnung Guide**

Create `frontend/content/blog/xrechnung-guide.mdx` — "XRechnung erstellen: Schritt-fuer-Schritt Anleitung" (~1500 words).

**Step 2: Write ZUGFeRD article**

Create `frontend/content/blog/zugferd-erklaerung.mdx` — "Was ist ZUGFeRD? Format, Versionen, Vorteile" (~1500 words).

**Step 3: Write GoBD article**

Create `frontend/content/blog/gobd-compliance.mdx` — "GoBD-konforme Archivierung: Was Unternehmen beachten muessen" (~1500 words).

**Step 4: Build and verify**

```bash
cd /Users/sadanakb/rechnungswerk/frontend && npm run build
```
Expected: All 4 blog posts appear in build output.

**Step 5: Commit**

```bash
git add frontend/content/blog/
git commit -m "feat: add 3 SEO blog articles — XRechnung Guide, ZUGFeRD, GoBD"
```

---

### Task 9: Newsletter Integration (Brevo)

**Files:**
- Create: `backend/app/brevo_service.py`
- Create: `backend/app/routers/newsletter.py`
- Modify: `backend/app/main.py`
- Create: `frontend/components/NewsletterForm.tsx`
- Modify: `frontend/app/(marketing)/layout.tsx` (add form to footer)
- Test: `backend/tests/test_newsletter.py`

**Step 1: Write failing test**

Create `backend/tests/test_newsletter.py`:

```python
"""Tests for newsletter subscription."""
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client():
    yield TestClient(app)


class TestNewsletterSubscribe:
    @patch("app.brevo_service.add_contact")
    def test_subscribe_success(self, mock_add, client):
        mock_add.return_value = True
        resp = client.post("/api/newsletter/subscribe", json={
            "email": "test@example.com",
        })
        assert resp.status_code == 200

    def test_subscribe_invalid_email(self, client):
        resp = client.post("/api/newsletter/subscribe", json={
            "email": "not-an-email",
        })
        assert resp.status_code == 422
```

**Step 2: Create Brevo service**

Create `backend/app/brevo_service.py`:

```python
"""Brevo (formerly Sendinblue) email marketing integration."""
import logging
from app.config import settings

logger = logging.getLogger(__name__)

NEWSLETTER_LIST_ID = 2  # Default list ID for RechnungsWerk newsletter


def add_contact(email: str, attributes: dict = None) -> bool:
    if not settings.brevo_api_key:
        logger.warning("Brevo API key not configured, skipping")
        return False

    import sib_api_v3_sdk
    configuration = sib_api_v3_sdk.Configuration()
    configuration.api_key['api-key'] = settings.brevo_api_key
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
```

**Step 3: Create newsletter router**

Create `backend/app/routers/newsletter.py`:

```python
"""Newsletter subscription router."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr

from app import brevo_service

router = APIRouter(prefix="/api/newsletter", tags=["newsletter"])


class SubscribeRequest(BaseModel):
    email: EmailStr


@router.post("/subscribe")
def subscribe(req: SubscribeRequest):
    success = brevo_service.add_contact(req.email)
    if not success:
        raise HTTPException(status_code=500, detail="Newsletter-Anmeldung fehlgeschlagen")
    return {"status": "subscribed", "email": req.email}
```

**Step 4: Add Brevo config**

Add to `backend/app/config.py`:
```python
brevo_api_key: str = ""
```

**Step 5: Create frontend newsletter form + add to footer**

Create `frontend/components/NewsletterForm.tsx` — email input + submit button. Add to marketing layout footer.

**Step 6: Register router, run tests, commit**

```bash
git add backend/app/brevo_service.py backend/app/routers/newsletter.py backend/app/config.py backend/app/main.py backend/tests/test_newsletter.py frontend/components/NewsletterForm.tsx frontend/app/\(marketing\)/layout.tsx
git commit -m "feat: add Brevo newsletter integration with subscribe endpoint"
```

---

### Task 10: GoBD Verfahrensdokumentation PDF

**Files:**
- Create: `backend/app/gobd_report.py`
- Create: `backend/app/routers/gobd.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_gobd.py`

**Step 1: Write failing test**

Create `backend/tests/test_gobd.py`:

```python
"""Tests for GoBD compliance report generation."""
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import Base
from app.database import get_db


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
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


class TestGoBDReport:
    def test_generate_report(self, client):
        # Register user
        reg = client.post("/api/auth/register", json={
            "email": "gobd@test.de",
            "password": "SecurePass123!",
            "full_name": "Test",
            "organization_name": "GoBD GmbH",
        })
        token = reg.json()["access_token"]

        resp = client.get(
            "/api/gobd/report",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"
```

**Step 2: Create GoBD report generator**

Create `backend/app/gobd_report.py` using reportlab to generate a Verfahrensdokumentation PDF covering:
- System description
- Archive procedures
- Access controls
- Data retention periods (10 years § 147 AO)

**Step 3: Create GoBD router**

Create `backend/app/routers/gobd.py` with `GET /api/gobd/report` endpoint that returns the generated PDF.

**Step 4: Run tests, commit**

```bash
git add backend/app/gobd_report.py backend/app/routers/gobd.py backend/app/main.py backend/tests/test_gobd.py
git commit -m "feat: add GoBD Verfahrensdokumentation PDF report generator"
```

---

### Task 11: Mahnwesen Frontend

**Files:**
- Create: `frontend/app/(dashboard)/mahnwesen/page.tsx`
- Modify: `frontend/lib/api.ts` (add mahnwesen API functions)
- Modify: `frontend/components/layout/SidebarNav.tsx` (add link)

**Step 1: Add mahnwesen API functions to api.ts**

```typescript
export async function getOverdueInvoices() {
  const resp = await api.get('/api/mahnwesen/overdue')
  return resp.data
}

export async function getMahnungen(invoiceId: string) {
  const resp = await api.get(`/api/mahnwesen/${invoiceId}`)
  return resp.data
}

export async function createMahnung(invoiceId: string) {
  const resp = await api.post(`/api/mahnwesen/${invoiceId}/mahnung`)
  return resp.data
}
```

**Step 2: Create Mahnwesen dashboard page**

Create `frontend/app/(dashboard)/mahnwesen/page.tsx` — a page showing:
- List of overdue invoices with days overdue
- Mahnung history per invoice
- Button to create next Mahnung level
- Status badges (1. Erinnerung, 2. Mahnung, 3. Letzte Mahnung)

**Step 3: Add to sidebar navigation**

Add "Mahnwesen" link to `SidebarNav.tsx`.

**Step 4: Build and verify**

```bash
cd /Users/sadanakb/rechnungswerk/frontend && npm run build
```

**Step 5: Commit**

```bash
git add frontend/app/\(dashboard\)/mahnwesen/ frontend/lib/api.ts frontend/components/layout/SidebarNav.tsx
git commit -m "feat: add Mahnwesen frontend — overdue invoices, dunning history, create Mahnung"
```

---

### Task 12: DATEV Export SKR Selector

**Files:**
- Create: `frontend/components/DATEVExportDialog.tsx`
- Modify: `frontend/app/(dashboard)/invoices/page.tsx` (add export button)

**Step 1: Read existing DATEV export endpoint**

Read `backend/app/routers/external_api.py` to understand the current DATEV export API.

**Step 2: Create DATEV export dialog**

Create `frontend/components/DATEVExportDialog.tsx` — a modal with:
- SKR03/SKR04 radio selection
- Date range picker
- Export button that calls the DATEV API
- Download the generated file

**Step 3: Add to invoices page**

Add "DATEV Export" button to the invoices page toolbar.

**Step 4: Build and verify**

```bash
cd /Users/sadanakb/rechnungswerk/frontend && npm run build
```

**Step 5: Commit**

```bash
git add frontend/components/DATEVExportDialog.tsx frontend/app/\(dashboard\)/invoices/page.tsx
git commit -m "feat: add DATEV export dialog with SKR03/SKR04 selection"
```
