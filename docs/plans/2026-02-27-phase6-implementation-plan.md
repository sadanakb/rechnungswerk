# Phase 6: UX Hardening & Production Polish — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the remaining UX gaps and production-polish items: invoice detail page, ZUGFeRD PDF export, in-app notifications, onboarding completion, PWA improvements, DATEV export UI, e-rechnung content, and final hardening.

**Architecture:** Event-driven notifications stored in DB; ZUGFeRD reuses existing zugferd_generator.py; PWA via serwist (already configured); invoice detail as new dashboard route.

**Tech Stack:** Python 3.13 + FastAPI + SQLAlchemy, Next.js 16 + React 19 + Tailwind CSS v4, Serwist, Recharts

---

## Task 1: Invoice Detail Page

**Files:**
- Create: `frontend/app/(dashboard)/invoices/[id]/page.tsx`
- Modify: `backend/app/routers/invoices.py` (add GET /api/invoices/{id} if not present)

**What to build:**

Full invoice detail view showing all invoice fields in a structured layout. Before writing code, check whether `GET /api/invoices/{id}` already exists in `backend/app/routers/invoices.py`. If missing, add it with org-scoped authorization (return 403 if invoice belongs to a different org).

**Backend endpoint (if missing):**
```python
@router.get("/{invoice_id}", response_model=InvoiceRead)
async def get_invoice(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invoice = await db.get(Invoice, invoice_id)
    if not invoice or invoice.org_id != current_user.org_id:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice
```

**Frontend layout:**
- Breadcrumb at top: "Rechnungen → {invoice_number}" — breadcrumb links back to /invoices
- Back button (`← Zurück`) navigating to /invoices
- Status badge: `valid` = green, `invalid` = red, `pending` = yellow/amber — use colored pill with text "Gültig", "Ungültig", "Ausstehend"
- Two-column header: left = seller/issuer info (name, address, USt-IdNr.), right = buyer info (name, address)
- Invoice metadata row: Rechnungsnummer, Rechnungsdatum, Fälligkeitsdatum, Zahlungsbedingungen — all formatted as German dates (`toLocaleDateString('de-DE')`)
- Line items table: columns = Pos., Beschreibung, Menge, Einheit, Einzelpreis (€), MwSt (%), Gesamt (€) — all numbers formatted with `toLocaleString('de-DE', { minimumFractionDigits: 2 })`
- Totals box (right-aligned): Nettobetrag, MwSt-Betrag, **Gesamtbetrag** (bold)
- Validation errors section: if `validation_errors` is non-empty array, show an amber warning box listing each error
- Action buttons row (bottom): "XRechnung herunterladen" (calls existing download endpoint), "ZUGFeRD PDF herunterladen" (added in Task 2), "Validieren" (calls POST /api/invoices/{id}/validate), "Löschen" (DELETE with confirmation modal), "Drucken / Vorschau" (links to /invoices/{id}/print — added in Task 10)
- `created_at` and `updated_at` shown in small gray text at very bottom: "Erstellt: {date} | Aktualisiert: {date}"

**Backend tests (2):**
```python
async def test_get_invoice_own_org():
    # Create invoice for org A, authenticate as org A user, GET /api/invoices/{id} → 200
    pass

async def test_get_invoice_cross_org_rejected():
    # Create invoice for org B, authenticate as org A user, GET /api/invoices/{id} → 404
    pass
```

---

## Task 2: ZUGFeRD PDF Export UI Integration

**Files:**
- Modify: `frontend/app/(dashboard)/invoices/page.tsx` (add ZUGFeRD download button per row)
- Modify: `frontend/app/(dashboard)/invoices/[id]/page.tsx` (add ZUGFeRD button — created in Task 1)
- Modify: `backend/app/routers/invoices.py` (verify/add GET /api/invoices/{id}/download-zugferd endpoint)
- Modify: `frontend/lib/api.ts` (add downloadZugferd function)

**What to build:**

First read `backend/app/zugferd_generator.py` to understand the exact function signature (likely `generate_zugferd_pdf(invoice: Invoice) -> bytes`). Verify whether `GET /api/invoices/{id}/download-zugferd` already exists; if not, add it.

**Backend endpoint:**
```python
@router.get("/{invoice_id}/download-zugferd")
async def download_zugferd(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invoice = await db.get(Invoice, invoice_id)
    if not invoice or invoice.org_id != current_user.org_id:
        raise HTTPException(status_code=404, detail="Invoice not found")
    pdf_bytes = zugferd_generator.generate_zugferd_pdf(invoice)
    filename = f"{invoice.invoice_number}_ZUGFeRD.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
```

**Frontend — `api.ts` addition:**
```typescript
export async function downloadZugferd(invoiceId: number, invoiceNumber: string) {
  const res = await fetch(`/api/invoices/${invoiceId}/download-zugferd`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error("Download failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${invoiceNumber}_ZUGFeRD.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
```

**Frontend — invoices list (`invoices/page.tsx`):**
Replace the single "Herunterladen" button per row with a dropdown component. Use a `<details>`/`<summary>` or a small state-managed dropdown. Two options:
1. "XRechnung XML" — existing download endpoint
2. "ZUGFeRD PDF" — calls `downloadZugferd(invoice.id, invoice.invoice_number)`

**Frontend — invoice detail page:**
The "ZUGFeRD PDF herunterladen" button in the action bar (Task 1) calls `downloadZugferd(id, invoiceNumber)`.

**Backend tests (2):**
```python
async def test_download_zugferd_valid_invoice():
    # POST invoice, GET /api/invoices/{id}/download-zugferd → 200, content-type application/pdf
    pass

async def test_download_zugferd_cross_org_rejected():
    # Cross-org access → 404
    pass
```

---

## Task 3: In-App Notification System (Backend)

**Files:**
- Modify: `backend/app/models.py` (add Notification model)
- Create: `backend/app/routers/notifications.py`
- Modify: `backend/app/main.py` (register router)
- Modify: `backend/app/routers/invoices.py` (trigger notifications on key events)
- Create: `backend/tests/test_notifications.py`

**What to build:**

**Model addition to `models.py`:**
```python
class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    link: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)
```

**Notification type constants (in `notifications.py`):**
```python
NOTIFICATION_TYPES = [
    "invoice_created",
    "invoice_validated",
    "invoice_exported",
    "mahnung_sent",
    "payment_failed",
    "team_member_joined",
]
```

**Pydantic schemas:**
```python
class NotificationRead(BaseModel):
    id: int
    type: str
    title: str
    message: str
    is_read: bool
    link: str | None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class MarkReadRequest(BaseModel):
    ids: list[int] | None = None
    all: bool = False
```

**Endpoints in `routers/notifications.py`:**
- `GET /api/notifications` — query `WHERE org_id = current_user.org_id ORDER BY is_read ASC, created_at DESC LIMIT 50`
- `POST /api/notifications/mark-read` — if `all=True`: `UPDATE notifications SET is_read=True WHERE org_id=...`; else update only provided `ids` (validate they belong to the org)
- `GET /api/notifications/unread-count` — `SELECT COUNT(*) WHERE org_id=... AND is_read=False`, return `{"count": N}`

**Register in `main.py`:**
```python
from app.routers import notifications
app.include_router(notifications.router, prefix="/api/notifications", tags=["notifications"])
```

**Trigger in `invoices.py` after invoice creation:**
```python
# After db.commit() on invoice creation:
notification = Notification(
    org_id=current_user.org_id,
    type="invoice_created",
    title="Rechnung erstellt",
    message=f"Rechnung {invoice.invoice_number} wurde erfolgreich erstellt.",
    link=f"/invoices/{invoice.id}",
)
db.add(notification)
await db.commit()
```

**Backend tests (5) in `test_notifications.py`:**
```python
async def test_list_notifications(): ...           # returns notifications for own org
async def test_mark_read_specific_ids(): ...       # POST mark-read with ids → is_read True
async def test_mark_all_read(): ...                # POST mark-read with all=True
async def test_unread_count(): ...                 # returns correct count
async def test_invoice_create_triggers_notification(): ...  # create invoice → notification exists
async def test_cross_org_isolation(): ...          # org B cannot see org A notifications
```

---

## Task 4: Notification Bell UI (Frontend)

**Files:**
- Create: `frontend/components/layout/NotificationBell.tsx`
- Modify: `frontend/app/(dashboard)/layout.tsx` (add bell to top header)
- Modify: `frontend/lib/api.ts` (add notification API functions)

**What to build:**

First read `frontend/app/(dashboard)/layout.tsx` to find the exact insertion point (likely a header `<div>` with theme toggle and user menu).

**`api.ts` additions:**
```typescript
export async function getNotifications(): Promise<Notification[]> {
  const res = await authedFetch("/api/notifications");
  return res.json();
}

export async function getUnreadCount(): Promise<{ count: number }> {
  const res = await authedFetch("/api/notifications/unread-count");
  return res.json();
}

export async function markNotificationsRead(ids?: number[]): Promise<void> {
  await authedFetch("/api/notifications/mark-read", {
    method: "POST",
    body: JSON.stringify(ids ? { ids } : { all: true }),
  });
}
```

**`NotificationBell.tsx` component:**
```typescript
"use client";
import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getNotifications, getUnreadCount, markNotificationsRead } from "@/lib/api";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const router = useRouter();
  const panelRef = useRef(null);

  // Poll unread count every 60 seconds
  useEffect(() => {
    const load = async () => {
      const { count } = await getUnreadCount();
      setUnreadCount(count);
    };
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Load full list when panel opens
  useEffect(() => {
    if (open) {
      getNotifications().then(setNotifications);
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleMarkAll = async () => {
    await markNotificationsRead();
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const handleClickNotification = async (n) => {
    await markNotificationsRead([n.id]);
    setNotifications((prev) =>
      prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))
    );
    setUnreadCount((c) => Math.max(0, c - (n.is_read ? 0 : 1)));
    if (n.link) router.push(n.link);
    setOpen(false);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg hover:bg-[var(--surface-hover)] transition-colors"
        aria-label="Benachrichtigungen"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[350px] max-h-[480px] overflow-y-auto bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-lg z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
            <span className="font-semibold text-sm">Benachrichtigungen</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAll}
                className="text-xs text-[var(--primary)] hover:underline"
              >
                Alle als gelesen markieren
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
              Keine Benachrichtigungen
            </div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClickNotification(n)}
                className={`w-full text-left px-4 py-3 hover:bg-[var(--surface-hover)] border-b border-[var(--border)] last:border-0 transition-colors ${
                  !n.is_read ? "bg-[var(--primary-subtle)]" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <NotificationIcon type={n.type} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{n.title}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-2">
                      {n.message}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      {formatRelativeTime(n.created_at)}
                    </p>
                  </div>
                  {!n.is_read && (
                    <div className="w-2 h-2 rounded-full bg-[var(--primary)] mt-1 flex-shrink-0" />
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

**Helper functions in the same file:**
- `NotificationIcon({ type })` — returns appropriate Lucide icon: `FileText` for invoice types, `Bell` for others
- `formatRelativeTime(dateStr)` — returns strings like "vor 5 Min.", "vor 2 Std.", "gestern", using `Date.now()` diff

---

## Task 5: Onboarding Flow Completion

**Files:**
- Modify: `frontend/app/(dashboard)/onboarding/page.tsx`
- Modify: `backend/app/routers/onboarding.py` (add logo upload endpoint if missing)
- Modify: `frontend/lib/api.ts` (add uploadLogo function)

**What to build:**

First read `frontend/app/(dashboard)/onboarding/page.tsx` to understand the current implementation state (which steps exist, how step state is managed, what's wired up vs. stubbed).

**4-step onboarding structure:**

Step indicator at top — numbered pills: 1 → 2 → 3 → 4, active = filled primary color, completed = checkmark, future = gray outline.

**Step 1 — Unternehmensdaten:**
Fields: Firmenname (required), USt-IdNr. (optional, format hint "DE123456789"), Straße + Hausnummer, PLZ, Stadt, Land (default "Deutschland"). On "Weiter": validate required fields, call `PATCH /api/onboarding/company` with body `{ company_name, vat_id, address }`.

**Step 2 — Logo hochladen:**
```typescript
// File input: accept="image/png,image/jpeg,image/svg+xml", max 2MB
// Show preview thumbnail via FileReader after selection
// "Hochladen" button calls uploadLogo(file)
// "Überspringen" button skips to step 3
```

Backend endpoint (add to `routers/onboarding.py` if missing):
```python
@router.post("/logo")
async def upload_logo(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if file.content_type not in ["image/png", "image/jpeg", "image/svg+xml"]:
        raise HTTPException(400, "Ungültiges Dateiformat. Erlaubt: PNG, JPG, SVG")
    content = await file.read()
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(400, "Datei zu groß (max. 2 MB)")
    ext = file.filename.rsplit(".", 1)[-1].lower()
    logo_path = Path(f"static/logos/{current_user.org_id}.{ext}")
    logo_path.parent.mkdir(parents=True, exist_ok=True)
    logo_path.write_bytes(content)
    logo_url = f"/static/logos/{current_user.org_id}.{ext}"
    # Update org.logo_url in DB
    org = await db.get(Organization, current_user.org_id)
    org.logo_url = logo_url
    await db.commit()
    return {"logo_url": logo_url}
```

Add `logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)` to the `Organization` model in `models.py` if not already present.

**Step 3 — Erste Rechnung:**
Two options presented as cards:
1. "Rechnung erstellen" — links to /manual, shown with plus icon and description "Erstellen Sie Ihre erste XRechnung in wenigen Minuten"
2. "Überspringen" — text button, advances to step 4

**Step 4 — Fertig! (Confetti):**
CSS-only confetti animation on mount. Use `@keyframes` in a `<style>` tag:
```css
@keyframes confetti-fall {
  0%   { transform: translateY(-10px) rotate(0deg); opacity: 1; }
  100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
}
```
Generate 20 `<span>` elements with random colors, sizes, horizontal positions, and animation delays via inline styles. Show:
- Large checkmark icon (green circle)
- "Einrichtung abgeschlossen!" heading
- Summary: "✓ Unternehmensdaten hinterlegt", "✓ Logo hochgeladen" (or "Logo übersprungen"), "✓ Bereit für Ihre erste Rechnung"
- "Zum Dashboard" button → router.push("/")
- Call `PATCH /api/onboarding/complete` to mark onboarding as done

**`api.ts` addition:**
```typescript
export async function uploadLogo(file: File): Promise<{ logo_url: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/onboarding/logo", {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}` },
    body: formData,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

---

## Task 6: PWA Manifest & Offline Support

**Files:**
- Modify: `frontend/app/manifest.ts`
- Modify: `frontend/next.config.ts`
- Create: `frontend/app/sw.ts` (service worker, if not exists)
- Create: `frontend/app/offline/page.tsx`

**What to build:**

First read `frontend/app/manifest.ts` and `frontend/next.config.ts` to understand what's already configured (serwist may already be set up from previous phases).

**Enhanced `manifest.ts`:**
```typescript
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RechnungsWerk",
    short_name: "RechnungsWerk",
    description: "XRechnung & ZUGFeRD — Die E-Rechnungslösung für Deutschland",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    categories: ["finance", "business"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Rechnung erstellen",
        short_name: "Neu",
        url: "/manual",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Rechnungen anzeigen",
        short_name: "Rechnungen",
        url: "/invoices",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
    screenshots: [
      { src: "/screenshots/dashboard.png", sizes: "1280x720", type: "image/png", form_factor: "wide" },
    ],
  };
}
```

**Service worker `app/sw.ts`** (serwist-based; check if already exists first):
```typescript
import { defaultCache } from "@serwist/next/worker";
import { Serwist } from "serwist";

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    ...defaultCache,
    {
      matcher: ({ url }) => url.pathname.startsWith("/api/analytics"),
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "api-analytics-cache",
        expiration: { maxEntries: 10, maxAgeSeconds: 300 },
      },
    },
    {
      matcher: ({ url }) => url.pathname.startsWith("/api/invoices"),
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "api-invoices-cache",
        expiration: { maxEntries: 50, maxAgeSeconds: 300 },
      },
    },
  ],
  fallbacks: {
    entries: [{ url: "/offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();
```

**`next.config.ts` — verify serwist plugin:**
```typescript
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

export default withSerwist({ /* existing config */ });
```

**`app/offline/page.tsx`:**
```typescript
export default function OfflinePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8">
      <div className="text-6xl">📶</div>
      <h1 className="text-2xl font-bold">Sie sind offline</h1>
      <p className="text-[var(--text-muted)] text-center max-w-sm">
        Bitte überprüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="px-6 py-3 bg-[var(--primary)] text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
      >
        Erneut versuchen
      </button>
    </div>
  );
}
```

**Install prompt in dashboard header** (modify `layout.tsx`):
```typescript
// Add near the top of the dashboard layout client component:
const [installPrompt, setInstallPrompt] = useState(null);
const [showInstallBanner, setShowInstallBanner] = useState(false);

useEffect(() => {
  const handler = (e) => { e.preventDefault(); setInstallPrompt(e); setShowInstallBanner(true); };
  window.addEventListener("beforeinstallprompt", handler);
  return () => window.removeEventListener("beforeinstallprompt", handler);
}, []);

// Render a dismissible chip in the header:
{showInstallBanner && (
  <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--primary-subtle)] border border-[var(--primary)] rounded-full text-sm">
    <span>App installieren</span>
    <button onClick={() => { installPrompt?.prompt(); setShowInstallBanner(false); }}>↓</button>
    <button onClick={() => setShowInstallBanner(false)}>×</button>
  </div>
)}
```

---

## Task 7: DATEV Export UI

**Files:**
- Modify: `frontend/app/(dashboard)/berichte/page.tsx`
- Modify: `backend/app/routers/invoices.py` (verify/expose DATEV export endpoint)
- Modify: `frontend/lib/api.ts` (add exportDatev function)

**What to build:**

First read `backend/app/export/datev_export.py` to understand the existing DATEV exporter (function signature, return type — likely bytes of CSV or ZIP).

**Backend endpoint** (verify it exists; if not, add to `invoices.py` or a new `export.py` router):
```python
@router.get("/export-datev")
async def export_datev(
    year: int = Query(..., ge=2020, le=2030),
    quarter: int | None = Query(None, ge=1, le=4),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.export.datev_export import generate_datev_export
    result_bytes, media_type, ext = await generate_datev_export(
        db, current_user.org_id, year, quarter
    )
    q_str = f"_Q{quarter}" if quarter else "_gesamt"
    filename = f"DATEV_{year}{q_str}.{ext}"
    return Response(
        content=result_bytes,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
```

**Frontend `api.ts` addition:**
```typescript
export async function exportDatev(year: number, quarter: number | null): Promise<void> {
  const params = new URLSearchParams({ year: String(year) });
  if (quarter) params.set("quarter", String(quarter));
  const res = await authedFetch(`/api/invoices/export-datev?${params}`);
  if (!res.ok) throw new Error("DATEV-Export fehlgeschlagen");
  const blob = await res.blob();
  const contentDisposition = res.headers.get("Content-Disposition") || "";
  const filenameMatch = contentDisposition.match(/filename="(.+)"/);
  const filename = filenameMatch?.[1] ?? "datev-export.csv";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

**Frontend DATEV card in `/berichte` page:**

Read `frontend/app/(dashboard)/berichte/page.tsx` first to understand the existing report card layout. Add a fourth card in the same style:

```tsx
// DATEV Export Card
const [datevYear, setDatevYear] = useState(new Date().getFullYear());
const [datevQuarter, setDatevQuarter] = useState<number | null>(null);
const [datevLoading, setDatevLoading] = useState(false);

const handleDatevExport = async () => {
  setDatevLoading(true);
  try {
    await exportDatev(datevYear, datevQuarter);
  } catch (e) {
    // show toast error
  } finally {
    setDatevLoading(false);
  }
};

// Card JSX:
<div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 flex flex-col gap-4">
  <div className="flex items-center gap-3">
    <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
      <FileSpreadsheet className="w-5 h-5 text-green-600" />
    </div>
    <div>
      <h3 className="font-semibold">DATEV-Export</h3>
      <p className="text-sm text-[var(--text-muted)]">
        DATEV-kompatible Buchungssätze für Ihren Steuerberater
      </p>
    </div>
  </div>
  <div className="flex gap-3">
    <select value={datevYear} onChange={(e) => setDatevYear(Number(e.target.value))}
      className="flex-1 border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--surface)]">
      {[2024, 2025, 2026].map((y) => <option key={y} value={y}>{y}</option>)}
    </select>
    <select value={datevQuarter ?? ""} onChange={(e) => setDatevQuarter(e.target.value ? Number(e.target.value) : null)}
      className="flex-1 border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--surface)]">
      <option value="">Gesamtes Jahr</option>
      <option value="1">Q1 (Jan–Mär)</option>
      <option value="2">Q2 (Apr–Jun)</option>
      <option value="3">Q3 (Jul–Sep)</option>
      <option value="4">Q4 (Okt–Dez)</option>
    </select>
  </div>
  <button onClick={handleDatevExport} disabled={datevLoading}
    className="w-full py-2.5 bg-[var(--primary)] text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
    {datevLoading ? "Wird exportiert…" : "DATEV exportieren"}
  </button>
</div>
```

---

## Task 8: E-Rechnung Landing Page Content

**Files:**
- Modify: `frontend/app/(marketing)/e-rechnung/page.tsx`

**What to build:**

First read `frontend/app/(marketing)/e-rechnung/page.tsx` to understand the current content structure and which sections already exist. Preserve all existing content; enrich and extend.

**Sections to add/enhance:**

**1. Hero (enhance if exists, add if not):**
```tsx
<section className="py-20 px-4 text-center bg-gradient-to-b from-blue-50 to-white dark:from-blue-950/30 dark:to-[var(--background)]">
  <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-100 dark:bg-amber-900/30 rounded-full text-amber-700 dark:text-amber-300 text-sm font-medium mb-6">
    <span>⚡</span> Ab 2025 Pflicht für B2B-Rechnungen
  </div>
  <h1 className="text-4xl md:text-5xl font-bold mb-4">
    E-Rechnung ab 2025:<br />Jetzt vorbereiten
  </h1>
  <p className="text-xl text-[var(--text-muted)] max-w-2xl mx-auto mb-8">
    Deutschland führt die E-Rechnungspflicht schrittweise ein. RechnungsWerk macht Sie
    ab dem ersten Tag compliant — mit XRechnung und ZUGFeRD.
  </p>
  <a href="/register" className="inline-flex items-center gap-2 px-8 py-4 bg-[var(--primary)] text-white rounded-xl font-semibold text-lg hover:opacity-90 transition-opacity">
    Kostenlos starten →
  </a>
</section>
```

**2. Timeline section (new):**
Horizontal timeline with 3 milestones. Use a flex row with connecting lines between nodes:
```tsx
const milestones = [
  {
    year: "2025",
    label: "Empfangspflicht",
    description: "Alle Unternehmen müssen E-Rechnungen empfangen können.",
    color: "red",
    status: "Jetzt",
  },
  {
    year: "2027",
    label: "Sendepflicht (kleine Unternehmen)",
    description: "Unternehmen bis 800.000 € Jahresumsatz müssen E-Rechnungen versenden.",
    color: "orange",
    status: "In Kürze",
  },
  {
    year: "2028",
    label: "Vollständige Pflicht",
    description: "Alle umsatzsteuerpflichtigen Unternehmen versenden E-Rechnungen.",
    color: "blue",
    status: "Geplant",
  },
];
```
On mobile: vertical timeline. On desktop: horizontal with SVG connecting line.

**3. "Was ist eine E-Rechnung?" explainer:**
Two cards side by side (flex on desktop, stack on mobile):
- Card 1: XRechnung — "Das deutsche Format. Reines XML, maschinenlesbar, Pflichtformat für Bundesbehörden."
- Card 2: ZUGFeRD — "Hybrider Standard. PDF mit eingebettetem XML — lesbar für Menschen und Maschinen."

**4. FAQ accordion (new) — 5 questions with JSON-LD schema:**
```tsx
const faqs = [
  { q: "Ab wann gilt die E-Rechnungspflicht für mein Unternehmen?", a: "Seit dem 1. Januar 2025 müssen alle Unternehmen in Deutschland E-Rechnungen empfangen können. Die Sendepflicht gilt für Unternehmen über 800.000 € Jahresumsatz ab 2027, für alle ab 2028." },
  { q: "Was ist der Unterschied zwischen XRechnung und ZUGFeRD?", a: "XRechnung ist ein reines XML-Format, das von deutschen Behörden entwickelt wurde. ZUGFeRD kombiniert ein menschenlesbares PDF mit eingebettetem XML und ist international weiter verbreitet." },
  { q: "Kann ich bestehende Word/Excel-Rechnungen weiternutzen?", a: "Nein. Ab den gesetzlichen Stichtagen müssen B2B-Rechnungen in einem strukturierten elektronischen Format vorliegen. RechnungsWerk erstellt diese automatisch." },
  { q: "Wie sicher sind meine Daten bei RechnungsWerk?", a: "Alle Daten werden in deutschen Rechenzentren gespeichert, AES-256-verschlüsselt übertragen und sind ausschließlich für Sie zugänglich. Wir sind DSGVO-konform." },
  { q: "Welche Formate unterstützt RechnungsWerk?", a: "RechnungsWerk erstellt XRechnung (UBL und CII) sowie ZUGFeRD (alle Stufen). DATEV-Export für Steuerberater ist ebenfalls enthalten." },
];
```
Render as a `<details>`/`<summary>` accordion or a React state-managed open/close per item. Include JSON-LD schema script tag:
```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [/* ... map faqs to Question/Answer objects */]
}
```

**5. Feature comparison table:**
| Feature | RechnungsWerk | Manueller Prozess |
|---|---|---|
| XRechnung erstellen | ✅ Automatisch | ❌ Manuell/nicht möglich |
| ZUGFeRD PDF | ✅ Inbegriffen | ❌ Kostenpflichtiges Tool |
| Validierung | ✅ Echtzeit | ❌ Keine |
| DATEV-Export | ✅ Ein Klick | ⚠️ Manuell |
| Archivierung | ✅ 10 Jahre | ❌ Selbst verwalten |

**6. CTA Section:**
```tsx
<section className="py-20 bg-[var(--primary)] text-white text-center">
  <h2 className="text-3xl font-bold mb-4">Jetzt E-Rechnungspflicht erfüllen</h2>
  <p className="text-lg opacity-80 mb-8 max-w-xl mx-auto">
    Kostenlos starten, kein Vertrag. Ihre erste XRechnung in 5 Minuten.
  </p>
  <a href="/register" className="inline-flex px-8 py-4 bg-white text-[var(--primary)] rounded-xl font-bold hover:bg-gray-50 transition-colors">
    Kostenlos registrieren
  </a>
</section>
```

---

## Task 9: Alembic Migration Phase 6

**Files:**
- Create: `backend/alembic/versions/phase6_notifications_logo.py`

**What to build:**

Read `backend/alembic/versions/` to find the most recent migration and use its revision ID as `down_revision`. The task description says Phase 5 revision is `7a3f891c2e45` — verify this matches the actual latest migration file before writing.

```python
"""Phase 6: Add notifications table and logo_url to organizations

Revision ID: 8b4e2f7a1c93
Revises: 7a3f891c2e45
Create Date: 2026-02-27 00:00:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from datetime import datetime

revision = "8b4e2f7a1c93"
down_revision = "7a3f891c2e45"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("link", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notifications_org_id", "notifications", ["org_id"])
    op.create_index("ix_notifications_is_read", "notifications", ["is_read"])

    with op.batch_alter_table("organizations") as batch_op:
        batch_op.add_column(sa.Column("logo_url", sa.String(500), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("organizations") as batch_op:
        batch_op.drop_column("logo_url")

    op.drop_index("ix_notifications_is_read", table_name="notifications")
    op.drop_index("ix_notifications_org_id", table_name="notifications")
    op.drop_table("notifications")
```

**Important:** Before writing the file, check the actual latest migration in `backend/alembic/versions/` and update `down_revision` to match if it differs from `7a3f891c2e45`.

---

## Task 10: Invoice PDF Preview (Print View)

**Files:**
- Create: `frontend/app/(dashboard)/invoices/[id]/print/page.tsx`
- Modify: `frontend/app/(dashboard)/invoices/[id]/page.tsx` (add "Drucken / Vorschau" button)

**What to build:**

No backend changes needed. The print page fetches from the same `/api/invoices/{id}` endpoint created in Task 1.

**`print/page.tsx`:**
```typescript
"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getInvoice } from "@/lib/api";

export default function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [invoice, setInvoice] = useState(null);

  useEffect(() => {
    getInvoice(Number(id)).then(setInvoice);
  }, [id]);

  if (!invoice) return <div className="p-8 text-center">Wird geladen…</div>;

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          .invoice-document { box-shadow: none !important; margin: 0 !important; }
        }
        @page { size: A4; margin: 2cm; }
      `}</style>

      {/* Toolbar — hidden on print */}
      <div className="no-print fixed top-0 left-0 right-0 bg-white dark:bg-gray-900 border-b px-6 py-3 flex items-center gap-4 z-50">
        <button onClick={() => router.back()} className="text-sm hover:underline">← Schließen</button>
        <button onClick={() => window.print()} className="ml-auto px-5 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium">
          Drucken
        </button>
      </div>

      {/* Invoice document — A4 proportions */}
      <div className="min-h-screen bg-gray-100 dark:bg-gray-800 pt-16 pb-8 px-4 print:bg-white print:p-0 print:pt-0">
        <div className="invoice-document max-w-[794px] mx-auto bg-white shadow-lg p-[2cm] min-h-[1123px] print:shadow-none print:max-w-none print:w-full">

          {/* Header: Sender (left) + Invoice metadata (right) */}
          <div className="flex justify-between items-start mb-12">
            <div>
              {invoice.org?.logo_url && (
                <img src={invoice.org.logo_url} alt="Logo" className="h-16 mb-4 object-contain" />
              )}
              <div className="text-sm space-y-0.5">
                <p className="font-bold text-base">{invoice.seller_name}</p>
                <p>{invoice.seller_address_line1}</p>
                <p>{invoice.seller_postal_code} {invoice.seller_city}</p>
                <p className="mt-2 text-gray-500">USt-IdNr.: {invoice.seller_vat_id}</p>
              </div>
            </div>
            <div className="text-right text-sm space-y-1">
              <p className="text-2xl font-bold text-gray-800">RECHNUNG</p>
              <p>Nr.: <strong>{invoice.invoice_number}</strong></p>
              <p>Datum: {new Date(invoice.issue_date).toLocaleDateString("de-DE")}</p>
              <p>Fällig: {new Date(invoice.due_date).toLocaleDateString("de-DE")}</p>
            </div>
          </div>

          {/* Recipient box */}
          <div className="mb-10 border border-gray-200 rounded p-4 inline-block min-w-[280px]">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Rechnungsempfänger</p>
            <p className="font-semibold">{invoice.buyer_name}</p>
            <p className="text-sm">{invoice.buyer_address_line1}</p>
            <p className="text-sm">{invoice.buyer_postal_code} {invoice.buyer_city}</p>
          </div>

          {/* Line items table */}
          <table className="w-full border-collapse mb-8 text-sm">
            <thead>
              <tr className="bg-gray-50 border-b-2 border-gray-200">
                <th className="text-left py-2 px-3">Pos.</th>
                <th className="text-left py-2 px-3">Beschreibung</th>
                <th className="text-right py-2 px-3">Menge</th>
                <th className="text-right py-2 px-3">Einzelpreis</th>
                <th className="text-right py-2 px-3">MwSt</th>
                <th className="text-right py-2 px-3">Gesamt</th>
              </tr>
            </thead>
            <tbody>
              {invoice.line_items?.map((item, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-2 px-3 text-gray-500">{i + 1}</td>
                  <td className="py-2 px-3">{item.description}</td>
                  <td className="py-2 px-3 text-right">{item.quantity} {item.unit}</td>
                  <td className="py-2 px-3 text-right">{formatEuro(item.unit_price)}</td>
                  <td className="py-2 px-3 text-right">{item.tax_rate}%</td>
                  <td className="py-2 px-3 text-right font-medium">{formatEuro(item.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals box */}
          <div className="flex justify-end mb-12">
            <div className="w-64 space-y-2 text-sm">
              <div className="flex justify-between"><span>Nettobetrag</span><span>{formatEuro(invoice.net_amount)}</span></div>
              <div className="flex justify-between"><span>MwSt ({invoice.tax_rate}%)</span><span>{formatEuro(invoice.tax_amount)}</span></div>
              <div className="flex justify-between font-bold text-base border-t border-gray-800 pt-2 mt-2">
                <span>Gesamtbetrag</span><span>{formatEuro(invoice.gross_amount)}</span>
              </div>
            </div>
          </div>

          {/* Payment terms footer */}
          <div className="border-t border-gray-200 pt-6 text-xs text-gray-500 space-y-1">
            <p><strong>Zahlungsbedingungen:</strong> {invoice.payment_terms ?? "Zahlbar innerhalb von 30 Tagen"}</p>
            <p><strong>Bankverbindung:</strong> {invoice.bank_details ?? "Bitte auf Anfrage"}</p>
          </div>
        </div>
      </div>
    </>
  );
}

function formatEuro(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}
```

**Addition to `invoices/[id]/page.tsx`:**
Add a "Drucken / Vorschau" button in the action buttons row that navigates to `/invoices/${id}/print`.

---

## Task 11: Search & Filter Improvements

**Files:**
- Modify: `frontend/app/(dashboard)/invoices/page.tsx`
- Modify: `backend/app/routers/invoices.py`
- Modify: `frontend/lib/api.ts`

**What to build:**

**Backend — enhance `GET /api/invoices`** with additional query parameters:

```python
@router.get("/", response_model=list[InvoiceRead])
async def list_invoices(
    status: str | None = Query(None, regex="^(valid|invalid|pending)$"),
    supplier: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    amount_min: float | None = Query(None, ge=0),
    amount_max: float | None = Query(None, ge=0),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(Invoice).where(Invoice.org_id == current_user.org_id)

    if status:
        stmt = stmt.where(Invoice.validation_status == status)
    if supplier:
        stmt = stmt.where(Invoice.seller_name.ilike(f"%{supplier}%"))
    if date_from:
        stmt = stmt.where(Invoice.issue_date >= date_from)
    if date_to:
        stmt = stmt.where(Invoice.issue_date <= date_to)
    if amount_min is not None:
        stmt = stmt.where(Invoice.gross_amount >= amount_min)
    if amount_max is not None:
        stmt = stmt.where(Invoice.gross_amount <= amount_max)
    if search:
        stmt = stmt.where(
            or_(
                Invoice.invoice_number.ilike(f"%{search}%"),
                Invoice.buyer_name.ilike(f"%{search}%"),
            )
        )

    stmt = stmt.order_by(Invoice.created_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()
```

**Frontend `api.ts` — update `listInvoices`:**
```typescript
export interface InvoiceFilters {
  status?: "valid" | "invalid" | "pending" | "";
  supplier?: string;
  date_from?: string;
  date_to?: string;
  amount_min?: number | "";
  amount_max?: number | "";
  search?: string;
}

export async function listInvoices(filters: InvoiceFilters = {}): Promise<Invoice[]> {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== "" && v !== null) params.set(k, String(v));
  });
  const res = await authedFetch(`/api/invoices?${params}`);
  return res.json();
}
```

**Frontend — filter bar in `invoices/page.tsx`:**

Use `useSearchParams` + `useRouter` to sync filter state with URL. On filter change, update URL params and re-fetch invoices.

```tsx
const searchParams = useSearchParams();
const router = useRouter();
const pathname = usePathname();

// Initialize filter state from URL params
const [filters, setFilters] = useState<InvoiceFilters>({
  status: (searchParams.get("status") as any) ?? "",
  date_from: searchParams.get("date_from") ?? "",
  date_to: searchParams.get("date_to") ?? "",
  amount_min: searchParams.get("amount_min") ?? "",
  amount_max: searchParams.get("amount_max") ?? "",
  search: searchParams.get("search") ?? "",
});

const isFiltered = Object.values(filters).some((v) => v !== "");

const updateFilter = (key: keyof InvoiceFilters, value: string) => {
  const next = { ...filters, [key]: value };
  setFilters(next);
  const params = new URLSearchParams();
  Object.entries(next).forEach(([k, v]) => { if (v) params.set(k, v); });
  router.replace(`${pathname}?${params}`);
};

const resetFilters = () => {
  setFilters({ status: "", date_from: "", date_to: "", amount_min: "", amount_max: "", search: "" });
  router.replace(pathname);
};
```

Filter bar UI (below existing search input):
```tsx
<div className="flex flex-wrap gap-3 mb-4">
  {/* Status dropdown */}
  <select value={filters.status} onChange={(e) => updateFilter("status", e.target.value)}
    className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--surface)] min-w-[140px]">
    <option value="">Alle Status</option>
    <option value="valid">Gültig</option>
    <option value="invalid">Ungültig</option>
    <option value="pending">Ausstehend</option>
  </select>

  {/* Date range */}
  <input type="date" value={filters.date_from} onChange={(e) => updateFilter("date_from", e.target.value)}
    className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--surface)]"
    placeholder="Von" title="Datum von" />
  <input type="date" value={filters.date_to} onChange={(e) => updateFilter("date_to", e.target.value)}
    className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--surface)]"
    placeholder="Bis" title="Datum bis" />

  {/* Amount range */}
  <input type="number" value={filters.amount_min} onChange={(e) => updateFilter("amount_min", e.target.value)}
    placeholder="Betrag min (€)" min="0"
    className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--surface)] w-36" />
  <input type="number" value={filters.amount_max} onChange={(e) => updateFilter("amount_max", e.target.value)}
    placeholder="Betrag max (€)" min="0"
    className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--surface)] w-36" />

  {/* Reset */}
  {isFiltered && (
    <button onClick={resetFilters}
      className="px-4 py-2 text-sm text-[var(--text-muted)] border border-[var(--border)] rounded-lg hover:bg-[var(--surface-hover)] transition-colors">
      Filter zurücksetzen ×
    </button>
  )}
</div>
```

Re-fetch invoices whenever `filters` changes (add `filters` to the `useEffect` dependency array).

**Backend tests (3):**
```python
async def test_filter_by_status():
    # Create invoices with status=valid and status=invalid
    # GET /api/invoices?status=valid → only valid ones returned
    pass

async def test_filter_by_date_range():
    # Create invoices with different issue_dates
    # GET /api/invoices?date_from=2026-01-01&date_to=2026-01-31 → only January invoices
    pass

async def test_filter_by_search():
    # Create invoices with different invoice_numbers and buyer_names
    # GET /api/invoices?search=ACME → returns invoices where buyer_name contains ACME
    pass
```

---

## Task 12: Final Verification & Changelog v0.6.0

**Files:**
- Modify: `frontend/app/(marketing)/changelog/page.tsx`

**What to build:**

**Step 1 — Changelog entry:**

Read `frontend/app/(marketing)/changelog/page.tsx` to understand the existing entry format. Add a v0.6.0 entry at the top of the changelog list in the same style as existing entries:

```tsx
{
  version: "v0.6.0",
  date: "27. Februar 2026",
  badge: "UX Hardening",
  badgeColor: "purple",
  items: [
    { type: "new", text: "Rechnungsdetailseite mit vollständiger Ansicht, Validierungsstatus und Aktions-Buttons" },
    { type: "new", text: "ZUGFeRD PDF-Export direkt aus der Rechnungsliste und Detailansicht" },
    { type: "new", text: "In-App-Benachrichtigungssystem mit Glocken-Icon und Echtzeit-Ungelesen-Zähler" },
    { type: "new", text: "Onboarding-Flow vervollständigt: Logo-Upload, Animationen, Fortschrittsanzeige" },
    { type: "new", text: "PWA-Verbesserungen: Shortcuts, Offline-Seite, App-Installationshinweis" },
    { type: "new", text: "DATEV-Export UI mit Jahres- und Quartalsauswahl in Berichte-Seite" },
    { type: "new", text: "E-Rechnung Landingpage: Timeline 2025–2028, FAQ mit Schema.org, Vergleichstabelle" },
    { type: "new", text: "Druckoptimierte Rechnungsvorschau (A4) mit window.print()" },
    { type: "improved", text: "Erweiterte Filter in Rechnungsliste: Status, Datum, Betrag, Volltextsuche" },
    { type: "improved", text: "URL-Parameter spiegeln Filterzustand in Rechnungsliste wider" },
  ],
},
```

**Step 2 — Run tests and build:**

Execute in order:
```bash
# Backend tests
cd backend && python -m pytest -q

# Frontend tests
cd frontend && npx vitest run

# Production build
cd frontend && npm run build
```

If any TypeScript errors appear during `npm run build`:
- Missing type imports: add them
- Implicit `any` types: add explicit type annotations
- Unused variables: prefix with `_` or remove
- Missing `"use client"` directives on pages using hooks: add them at the top

If any Python test failures:
- Database session issues: check async session fixtures in `conftest.py`
- Import errors: verify all new modules are importable
- Auth errors in tests: ensure test client sends correct Authorization header

**Step 3 — Commit:**
```bash
git add -A
git commit -m "feat: Phase 6 — UX hardening & production polish

- Invoice detail page with full field display and action buttons
- ZUGFeRD PDF export UI in list and detail views
- In-app notification system (backend + bell UI)
- Completed onboarding flow with logo upload and confetti
- PWA manifest enhancements and offline support
- DATEV export UI with year/quarter selector
- E-Rechnung landing page enriched with timeline, FAQ, comparison table
- Invoice print view (A4, CSS print media queries)
- Enhanced invoice filters: status, date range, amount, full-text search
- Alembic migration: notifications table + logo_url column
- Changelog v0.6.0"
```

**Definition of Done for Phase 6:**
- [ ] All 12 tasks implemented
- [ ] `pytest -q` passes (0 failures)
- [ ] `npx vitest run` passes (0 failures)
- [ ] `npm run build` exits with code 0 (no TypeScript errors)
- [ ] Notification bell shows in dashboard header
- [ ] `/invoices/{id}` route renders invoice detail
- [ ] ZUGFeRD download triggers PDF in browser
- [ ] Onboarding reaches step 4 with confetti
- [ ] DATEV export card visible in /berichte
- [ ] E-Rechnung page shows timeline and FAQ
- [ ] Print view renders A4-proportional invoice
- [ ] Filters reflected in URL params
