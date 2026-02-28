# Phase 9: KI-Suite + Echtzeit — Design

**Date:** 2026-02-28
**Status:** Approved

## Goal

Upgrade RechnungsWerk mit produktionsreifen KI-Features und Real-time WebSocket-Infrastruktur: GPT-4o-mini als kostenoptimierter Primary-Provider (7,5× günstiger als Claude Haiku für Standard-Tasks), Chat-Assistent mit Tool Use, asynchrone Auto-Kategorisierung (SKR03), monatliche AI-Zusammenfassung und Live-Events via WebSocket.

**Budget-Grundlage (aus Recherche-Dokument):**
- GPT-4o-mini: $0,0006/Rechnung → ~$6 für 10.000 Rechnungen/Monat
- Batch API (50% Rabatt) + Prompt Caching (90% Reduktion) → realistisch < $5/Monat KI-Kosten
- Claude Haiku 3.5: nur für komplexe Tasks (Chat mit Tool Use)
- Ollama: Dev-only Fallback wenn kein API-Key konfiguriert

---

## Teil A: KI-Provider Upgrade

### A1 — OpenAI GPT-4o-mini Integration

Die bestehende `backend/app/ai_service.py` wird um OpenAI als Primary-Provider erweitert.

**Neue Config-Felder in `config.py`:**
```python
openai_api_key: str = ""
openai_model: str = "gpt-4o-mini"
```

**Erweitertes Provider-Routing:**
```python
class AiProvider(str, Enum):
    OPENAI = "openai"       # Primary für Standard-Tasks (günstigster)
    ANTHROPIC = "anthropic" # Complex tasks (Chat mit Tool Use)
    MISTRAL = "mistral"     # OCR-Batch (bereits vorhanden)
    OLLAMA = "ollama"       # Dev-Fallback only

def _select_provider(task_type: str = "standard") -> AiProvider:
    if task_type == "complex" and settings.anthropic_api_key:
        return AiProvider.ANTHROPIC
    if settings.openai_api_key:
        return AiProvider.OPENAI
    if settings.anthropic_api_key:
        return AiProvider.ANTHROPIC
    if settings.mistral_api_key:
        return AiProvider.MISTRAL
    return AiProvider.OLLAMA
```

**Requirements:** `openai>=1.0.0` zu `backend/requirements.txt` hinzufügen.

### A2 — Auto-Kategorisierung (Production-ready)

Die bestehende `backend/app/ai/categorizer.py` (Ollama + Keyword-Fallback) wird auf den Hybrid-Provider umgestellt.

**ARQ-Task:** `categorize_invoice_task(invoice_id: int)` in `worker.py`
- Läuft asynchron nach Invoice-Speicherung (non-blocking)
- GPT-4o-mini → SKR03-Konto + Kategoriename
- Ergebnis: `Invoice.skr03_account`, `Invoice.category` gesetzt
- WebSocket-Event: `invoice.categorized` an org

**Endpoint:** `POST /api/ai/categorize` für manuelle Neukategorisierung

### A3 — Batch-Kategorisierung

**Endpoint:** `POST /api/ai/categorize-batch`
- Verarbeitet bis zu 100 Invoice-IDs
- Nutzt OpenAI Batch API (50% Kostenersparnis, asynchron 24h)
- Status-Tracking via ARQ

---

## Teil B: WebSocket Echtzeit

### B1 — WebSocket Endpoint

**Endpoint:** `GET /ws` (FastAPI native WebSocket, kein extra Package nötig)

**Auth:** JWT-Token als Query-Parameter `?token=<jwt>` — bei ungültigem Token sofort disconnect.

**Connection Manager:**
```python
class ConnectionManager:
    connections: Dict[int, List[WebSocket]]  # org_id → [websockets]

    async def connect(self, org_id: int, ws: WebSocket)
    async def disconnect(self, org_id: int, ws: WebSocket)
    async def send_to_org(self, org_id: int, event: dict)
```

**Events:**
```json
{ "event": "invoice.paid",        "data": { "invoice_id": "INV-001", "amount": 1500.00 } }
{ "event": "invoice.overdue",     "data": { "invoice_id": "INV-002", "due_date": "2026-02-01" } }
{ "event": "portal.visited",      "data": { "invoice_id": "INV-003", "access_count": 3 } }
{ "event": "invoice.categorized", "data": { "invoice_id": "INV-004", "category": "IT/Software", "skr03": "4964" } }
{ "event": "recurring.created",   "data": { "invoice_id": "INV-005" } }
```

### B2 — ARQ → WebSocket Bridge

ARQ-Tasks senden Events nach Aktionen:
- `daily_recurring_check` → `recurring.created` nach Generierung
- `categorize_invoice_task` → `invoice.categorized` nach Kategorisierung
- `check_overdue` → `invoice.overdue` bei Fälligkeitserkennung
- Portal API `confirm-payment` → `invoice.paid`

**Helper:** `async def notify_org(org_id, event, data)` — sendet via ConnectionManager, graceful wenn keine WS-Verbindung.

### B3 — Frontend WebSocket Context

**`frontend/contexts/WebSocketContext.tsx`** — Provider in `(dashboard)/layout.tsx` eingebunden:
```typescript
const WebSocketContext = createContext<{
  lastEvent: WSEvent | null
  connected: boolean
}>()

// Auto-reconnect mit exponential backoff (1s, 2s, 4s, max 30s)
// Sonner toast bei relevanten Events
```

**Toast-Notifications (Sonner bereits installiert):**
- `invoice.paid` → grüner Toast „Rechnung INV-001 als bezahlt bestätigt"
- `invoice.overdue` → roter Toast „Rechnung INV-002 ist überfällig"
- `portal.visited` → Info „Kunde hat Rechnung INV-003 angesehen"

---

## Teil C: AI Chat-Assistent

### C1 — Chat API

**Endpoint:** `POST /api/ai/chat`
```json
{
  "message": "Welche Rechnungen sind diese Woche fällig?",
  "history": [{ "role": "user", "content": "..." }, { "role": "assistant", "content": "..." }]
}
```

**Response (Streaming via SSE):**
```
data: {"token": "Diese"}
data: {"token": " Woche"}
data: {"done": true, "tool_calls": [...]}
```

**Tool Use / Function Calling:**
```python
tools = [
    {
        "name": "get_invoices",
        "description": "Rechnungen nach Status und Zeitraum abrufen",
        "parameters": { "status": "open|paid|overdue", "date_from": "ISO", "date_to": "ISO" }
    },
    {
        "name": "get_analytics_summary",
        "description": "Umsatz-Statistiken für einen Zeitraum",
        "parameters": { "period": "week|month|quarter|year" }
    },
    {
        "name": "get_overdue_invoices",
        "description": "Alle überfälligen Rechnungen mit Mahnstatus"
    }
]
```

**Provider:** Claude Haiku 3.5 (besser bei Tool Use mit deutschen Texten), Fallback GPT-4o-mini.

### C2 — Chat Frontend Widget

**`frontend/components/ai/ChatWidget.tsx`** — Floating Button rechts unten (außerhalb Dashboard-Grid):
- Toggle-Button mit Chat-Icon
- Message-Input + Send
- Streaming via EventSource (SSE)
- History in `localStorage` (max 50 Nachrichten)
- Nur in `(dashboard)` sichtbar, nicht im Portal

---

## Teil D: AI Monatszusammenfassung

### D1 — Summary API

**Endpoint:** `GET /api/ai/monthly-summary?month=2026-02`

**Architektur:**
1. Aggregiert Rechnungsdaten für den Monat aus DB
2. GPT-4o-mini generiert deutschen Fließtext (3-4 Sätze)
3. Ergebnis in Redis gecacht (TTL 24h, Key: `summary:{org_id}:{year}-{month}`)
4. Regenerierung: manuell via `POST /api/ai/monthly-summary/regenerate` oder täglich via ARQ-Cron

**Beispiel-Output:**
> „Im Februar 2026 haben Sie 34 Rechnungen über insgesamt 28.450 € gestellt. Der Umsatz stieg um 12 % gegenüber Januar. Drei Rechnungen sind noch offen (gesamt 4.200 €). Ihr größter Kunde war Musterfirma GmbH mit 8.900 €."

### D2 — Dashboard Widget

**`frontend/app/(dashboard)/dashboard/page.tsx`** — neues Widget oben auf der Dashboard-Seite:
- Lädt `GET /api/ai/monthly-summary` beim Mount
- Skeleton-Loader während Generierung
- „Neu generieren" Button (max 1×/24h)

---

## Datenbankänderungen

**Neue Spalten in `invoices`-Tabelle (Alembic Migration):**
```sql
ALTER TABLE invoices ADD COLUMN skr03_account VARCHAR(10);
ALTER TABLE invoices ADD COLUMN ai_category VARCHAR(100);
ALTER TABLE invoices ADD COLUMN ai_categorized_at TIMESTAMP;
```

**Keine neue Tabelle** — WebSocket-State ist in-memory (ConnectionManager), Summary in Redis.

---

## Testing-Strategie

- Backend: pytest für alle neuen Endpoints (Chat, Kategorisierung, Summary, WebSocket)
- WebSocket-Tests: FastAPI TestClient mit WebSocket-Support
- KI-Tests: Mock OpenAI/Anthropic responses (kein echtes API-Call in Tests)
- Frontend: TypeScript-Build-Check (keine Laufzeit-Tests für Streaming)

---

## Was NICHT in Phase 9 ist

- Mobile Push Notifications (aufwändig, eigenes Kapitel)
- DATEV-Export (komplexe Buchhaltungsintegration)
- Mehrmandanten-KI (jeder Org-Tenant hat isolierte Chat-History)
- Fine-tuning eigener Modelle
- Sprach-Input (Voice-to-Text)
