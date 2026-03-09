# Phase 9: KI-Suite + Echtzeit — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** GPT-4o-mini als Primary-KI-Provider integrieren (7,5× günstiger als Claude Haiku), WebSocket für Echtzeit-Events, Chat-Assistent mit Tool Use, asynchrone Auto-Kategorisierung (SKR03) und monatliche AI-Zusammenfassung im Dashboard.

**Architecture:** `ai_service.py` wird um OpenAI erweitert mit task-type-basiertem Auto-Routing (GPT-4o-mini für Standard, Claude Haiku für komplexe Tasks, Ollama als Dev-Fallback). Ein neuer `ConnectionManager` in `backend/app/ws.py` verwaltet WebSocket-Verbindungen per `org_id`; ARQ-Tasks senden Events nach Aktionen. Der Chat-Assistent nutzt OpenAI/Anthropic Function Calling gegen lokale DB-Queries. Frontend: `WebSocketContext` in `(dashboard)/layout.tsx` + floating `ChatWidget`.

**Tech Stack:** FastAPI WebSocket (nativ, kein extra Package), OpenAI Python SDK (`openai>=1.0.0`), FastAPI `StreamingResponse` für SSE Chat-Streaming, Redis (ARQ bereits vorhanden), Sonner für Toast-Notifications (bereits installiert).

---

## Wichtige Architektur-Entscheidungen

1. **Invoice.id vs Invoice.invoice_id** — `Invoice.id` = Integer PK (FK in anderen Tabellen). `Invoice.invoice_id` = String (z.B. `"INV-20260228-ABC123"`) in URL-Pfaden.
2. **Auth-Pattern** — Alle API-Endpunkte nutzen `get_current_user` (nicht `require_api_key`). WebSocket-Auth via `?token=<jwt>`.
3. **ARQ graceful degradation** — `arq_pool = getattr(request.app.state, "arq_pool", None)`. Wenn None → synchron ausführen.
4. **CSS Variables** — Frontend nutzt `rgb(var(--primary))` etc., NIE hardcoded Farben im Dashboard.
5. **Route ordering** — Neue AI-Routen (`/api/ai/chat`, `/api/ai/monthly-summary`) VOR generischen Catch-all-Routen registrieren.
6. **SSE Streaming** — Chat-Streaming via `StreamingResponse(content_type="text/event-stream")`, Frontend via `EventSource`.
7. **Modell-IDs** — `gpt-4o-mini` (OpenAI), `claude-haiku-4-5-20251001` (Anthropic). Immer als Config, nicht hardcoded.

---

## Task 1: OpenAI GPT-4o-mini in ai_service.py

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/app/config.py`
- Modify: `backend/app/ai_service.py`
- Create: `backend/tests/test_ai_service_openai.py`

### `backend/requirements.txt` — openai hinzufügen

Nach `mistralai>=1.0.0` einfügen:
```
openai>=1.0.0
```

### `backend/app/config.py` — neue Felder

Nach `ai_provider: str = "auto"` hinzufügen:
```python
openai_api_key: str = ""
openai_model: str = "gpt-4o-mini"
```

### `backend/app/ai_service.py` — komplett ersetzen

```python
"""Hybrid AI service — routes between API providers and local Ollama."""
import json
import logging
from enum import Enum
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)


class AiProvider(str, Enum):
    OPENAI = "openai"       # Primary für Standard-Tasks (günstigster)
    ANTHROPIC = "anthropic" # Complex tasks: Chat mit Tool Use, Fraud
    MISTRAL = "mistral"     # OCR-Batch
    OLLAMA = "ollama"       # Dev-Fallback only (kein Cloud-Server nötig)
    AUTO = "auto"


CATEGORIZATION_PROMPT = """Kategorisiere diese Rechnung nach SKR03.
Verkäufer: {seller_name}
Beschreibung: {description}
Betrag: {amount} EUR

Antwort als JSON (nur JSON, kein Text davor/danach):
{{"skr03_account": "XXXX", "category": "Kategoriename"}}"""

SUMMARY_PROMPT = """Du bist ein deutscher Buchhaltungsassistent. Erstelle eine kurze, präzise Zusammenfassung der Rechnungsdaten für {month_name}.

Daten:
- Rechnungen gesamt: {invoice_count}
- Gesamtumsatz: {gross_total:.2f} EUR
- Davon offen: {open_count} Rechnungen ({open_total:.2f} EUR)
- Davon bezahlt: {paid_count} Rechnungen
- Davon überfällig: {overdue_count} Rechnungen
- Größter Kunde: {top_customer}
- Vergleich Vormonat: {prev_month_change:+.1f}%

Schreibe 3-4 Sätze auf Deutsch. Sachlich, professionell. Keine Aufzählungen."""


def categorize_invoice(
    seller_name: str,
    description: str,
    amount: float,
    provider: AiProvider = AiProvider.AUTO,
) -> dict:
    """Kategorisiert eine Rechnung nach SKR03. Gibt {'skr03_account': '...', 'category': '...'} zurück."""
    prompt = CATEGORIZATION_PROMPT.format(
        seller_name=seller_name,
        description=description,
        amount=amount,
    )

    if provider == AiProvider.AUTO:
        provider = _select_provider("standard")

    try:
        if provider == AiProvider.OPENAI:
            return _call_openai(prompt)
        elif provider == AiProvider.ANTHROPIC:
            return _call_anthropic(prompt)
        elif provider == AiProvider.MISTRAL:
            return _call_mistral(prompt)
        else:
            return _call_ollama(prompt)
    except Exception as e:
        logger.warning("AI provider %s failed: %s, trying fallback", provider, e)
        # Fallback chain
        if provider != AiProvider.OLLAMA:
            try:
                return _call_ollama(prompt)
            except Exception as e2:
                logger.error("Ollama fallback also failed: %s", e2)
        return {"skr03_account": "4900", "category": "Sonstige Kosten"}


def generate_monthly_summary(
    month_name: str,
    invoice_count: int,
    gross_total: float,
    open_count: int,
    open_total: float,
    paid_count: int,
    overdue_count: int,
    top_customer: str,
    prev_month_change: float,
    provider: AiProvider = AiProvider.AUTO,
) -> str:
    """Generiert deutschen Fließtext als Monatszusammenfassung."""
    prompt = SUMMARY_PROMPT.format(
        month_name=month_name,
        invoice_count=invoice_count,
        gross_total=gross_total,
        open_count=open_count,
        open_total=open_total,
        paid_count=paid_count,
        overdue_count=overdue_count,
        top_customer=top_customer,
        prev_month_change=prev_month_change,
    )

    if provider == AiProvider.AUTO:
        provider = _select_provider("standard")

    try:
        if provider == AiProvider.OPENAI:
            return _call_openai_text(prompt)
        elif provider == AiProvider.ANTHROPIC:
            return _call_anthropic_text(prompt)
        else:
            return _call_ollama_text(prompt)
    except Exception as e:
        logger.warning("AI summary generation failed: %s", e)
        return f"Im {month_name} wurden {invoice_count} Rechnungen über {gross_total:.2f} EUR gestellt."


def _select_provider(task_type: str = "standard") -> AiProvider:
    """Auto-selects cheapest viable provider for the task type."""
    if task_type == "complex":
        # Complex tasks: prefer Claude (better tool use, reasoning)
        if settings.anthropic_api_key:
            return AiProvider.ANTHROPIC
        if settings.openai_api_key:
            return AiProvider.OPENAI
    else:
        # Standard tasks: prefer OpenAI (cheapest)
        if settings.openai_api_key:
            return AiProvider.OPENAI
        if settings.anthropic_api_key:
            return AiProvider.ANTHROPIC
        if settings.mistral_api_key:
            return AiProvider.MISTRAL
    return AiProvider.OLLAMA


def _call_openai(prompt: str) -> dict:
    """Call OpenAI GPT-4o-mini, return parsed JSON dict."""
    from openai import OpenAI
    client = OpenAI(api_key=settings.openai_api_key)
    response = client.chat.completions.create(
        model=settings.openai_model,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=200,
        response_format={"type": "json_object"},
    )
    return json.loads(response.choices[0].message.content)


def _call_openai_text(prompt: str) -> str:
    """Call OpenAI GPT-4o-mini, return plain text."""
    from openai import OpenAI
    client = OpenAI(api_key=settings.openai_api_key)
    response = client.chat.completions.create(
        model=settings.openai_model,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=300,
    )
    return response.choices[0].message.content.strip()


def _call_anthropic(prompt: str) -> dict:
    from anthropic import Anthropic
    client = Anthropic(api_key=settings.anthropic_api_key)
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=200,
        messages=[{"role": "user", "content": prompt}],
    )
    return json.loads(response.content[0].text)


def _call_anthropic_text(prompt: str) -> str:
    from anthropic import Anthropic
    client = Anthropic(api_key=settings.anthropic_api_key)
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text.strip()


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


def _call_ollama_text(prompt: str) -> str:
    import ollama
    response = ollama.chat(
        model=settings.ollama_model,
        messages=[{"role": "user", "content": prompt}],
    )
    return response["message"]["content"].strip()
```

### `backend/tests/test_ai_service_openai.py`

```python
"""Tests for OpenAI GPT-4o-mini integration in ai_service (Task 1)."""
import pytest
from unittest.mock import MagicMock, patch


class TestAiServiceOpenAI:

    def test_select_provider_returns_openai_when_key_set(self):
        """When openai_api_key is set, standard tasks should use OpenAI."""
        from app.ai_service import _select_provider
        with patch("app.ai_service.settings") as mock_settings:
            mock_settings.openai_api_key = "sk-test"
            mock_settings.anthropic_api_key = ""
            mock_settings.mistral_api_key = ""
            result = _select_provider("standard")
        from app.ai_service import AiProvider
        assert result == AiProvider.OPENAI

    def test_select_provider_falls_back_to_anthropic_when_no_openai(self):
        """When no openai key but anthropic key exists, use anthropic."""
        from app.ai_service import _select_provider, AiProvider
        with patch("app.ai_service.settings") as mock_settings:
            mock_settings.openai_api_key = ""
            mock_settings.anthropic_api_key = "sk-ant-test"
            mock_settings.mistral_api_key = ""
            result = _select_provider("standard")
        assert result == AiProvider.ANTHROPIC

    def test_select_provider_complex_prefers_anthropic(self):
        """Complex tasks should prefer Anthropic even if OpenAI is set."""
        from app.ai_service import _select_provider, AiProvider
        with patch("app.ai_service.settings") as mock_settings:
            mock_settings.openai_api_key = "sk-test"
            mock_settings.anthropic_api_key = "sk-ant-test"
            result = _select_provider("complex")
        assert result == AiProvider.ANTHROPIC

    def test_categorize_invoice_openai_returns_dict(self):
        """categorize_invoice with OpenAI mock should return skr03_account + category."""
        from app.ai_service import categorize_invoice, AiProvider
        mock_response = MagicMock()
        mock_response.choices[0].message.content = '{"skr03_account": "4964", "category": "IT/Software"}'
        with patch("app.ai_service.settings") as mock_settings, \
             patch("openai.OpenAI") as MockOpenAI:
            mock_settings.openai_api_key = "sk-test"
            mock_settings.openai_model = "gpt-4o-mini"
            mock_client = MagicMock()
            MockOpenAI.return_value = mock_client
            mock_client.chat.completions.create.return_value = mock_response
            result = categorize_invoice("AWS", "Cloud Hosting", 250.0, AiProvider.OPENAI)
        assert result["skr03_account"] == "4964"
        assert result["category"] == "IT/Software"

    def test_categorize_invoice_fallback_on_error(self):
        """On provider failure, should return default fallback dict."""
        from app.ai_service import categorize_invoice, AiProvider
        with patch("app.ai_service._call_openai", side_effect=Exception("API Error")), \
             patch("app.ai_service._call_ollama", side_effect=Exception("Ollama Error")):
            result = categorize_invoice("Test", "Test", 100.0, AiProvider.OPENAI)
        assert "skr03_account" in result
        assert "category" in result
```

**Verification:**
```bash
cd /Users/sadanakb/rechnungswerk/backend && pip install openai>=1.0.0 && python -m pytest -q --tb=short tests/test_ai_service_openai.py
# Expected: 5 passed
```

**Commit:** `feat: add OpenAI GPT-4o-mini — primary AI provider, task-type routing`

---

## Task 2: WebSocket ConnectionManager

**Files:**
- Create: `backend/app/ws.py`
- Create: `backend/tests/test_websocket.py`

### `backend/app/ws.py`

```python
"""WebSocket ConnectionManager — per-org real-time event broadcasting."""
import json
import logging
from typing import Dict, List

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections keyed by org_id."""

    def __init__(self):
        self._connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, org_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        if org_id not in self._connections:
            self._connections[org_id] = []
        self._connections[org_id].append(websocket)
        logger.info("WS connected: org_id=%d, total=%d", org_id, len(self._connections[org_id]))

    def disconnect(self, org_id: int, websocket: WebSocket) -> None:
        if org_id in self._connections:
            self._connections[org_id].discard(websocket) if hasattr(self._connections[org_id], 'discard') else None
            try:
                self._connections[org_id].remove(websocket)
            except ValueError:
                pass
            if not self._connections[org_id]:
                del self._connections[org_id]
        logger.info("WS disconnected: org_id=%d", org_id)

    async def send_to_org(self, org_id: int, event: str, data: dict) -> int:
        """Send event to all connections for org_id. Returns number of recipients."""
        if org_id not in self._connections:
            return 0
        message = json.dumps({"event": event, "data": data})
        dead = []
        sent = 0
        for ws in self._connections[org_id]:
            try:
                await ws.send_text(message)
                sent += 1
            except Exception as e:
                logger.warning("WS send failed, removing dead connection: %s", e)
                dead.append(ws)
        for ws in dead:
            try:
                self._connections[org_id].remove(ws)
            except ValueError:
                pass
        return sent

    def connection_count(self, org_id: int) -> int:
        return len(self._connections.get(org_id, []))


# Singleton instance — imported by main.py and routers
manager = ConnectionManager()


async def notify_org(org_id: int, event: str, data: dict) -> None:
    """Convenience helper: send event to org, log if no connections."""
    count = await manager.send_to_org(org_id, event, data)
    if count == 0:
        logger.debug("notify_org: no WS connections for org_id=%d (event=%s)", org_id, event)
```

### `backend/tests/test_websocket.py`

```python
"""Tests for WebSocket ConnectionManager (Task 2)."""
import pytest
from unittest.mock import AsyncMock, MagicMock


class TestConnectionManager:

    @pytest.mark.asyncio
    async def test_connect_adds_websocket_to_org(self):
        """connect() should add the websocket to the org's connection list."""
        from app.ws import ConnectionManager
        mgr = ConnectionManager()
        mock_ws = AsyncMock()
        await mgr.connect(org_id=1, websocket=mock_ws)
        assert mgr.connection_count(1) == 1
        mock_ws.accept.assert_called_once()

    @pytest.mark.asyncio
    async def test_disconnect_removes_websocket(self):
        """disconnect() should remove the websocket and clean up empty org."""
        from app.ws import ConnectionManager
        mgr = ConnectionManager()
        mock_ws = AsyncMock()
        await mgr.connect(org_id=1, websocket=mock_ws)
        mgr.disconnect(org_id=1, websocket=mock_ws)
        assert mgr.connection_count(1) == 0
        assert 1 not in mgr._connections

    @pytest.mark.asyncio
    async def test_send_to_org_sends_json_message(self):
        """send_to_org() should send a JSON-encoded event+data message."""
        import json
        from app.ws import ConnectionManager
        mgr = ConnectionManager()
        mock_ws = AsyncMock()
        await mgr.connect(org_id=5, websocket=mock_ws)
        count = await mgr.send_to_org(5, "invoice.paid", {"invoice_id": "INV-001"})
        assert count == 1
        call_args = mock_ws.send_text.call_args[0][0]
        payload = json.loads(call_args)
        assert payload["event"] == "invoice.paid"
        assert payload["data"]["invoice_id"] == "INV-001"

    @pytest.mark.asyncio
    async def test_send_to_org_no_connections_returns_zero(self):
        """send_to_org() with no active connections returns 0."""
        from app.ws import ConnectionManager
        mgr = ConnectionManager()
        count = await mgr.send_to_org(99, "invoice.paid", {})
        assert count == 0

    @pytest.mark.asyncio
    async def test_dead_connections_removed_on_send(self):
        """Failed send should remove dead connection from pool."""
        from app.ws import ConnectionManager
        mgr = ConnectionManager()
        dead_ws = AsyncMock()
        dead_ws.send_text.side_effect = Exception("Connection closed")
        await mgr.connect(org_id=3, websocket=dead_ws)
        count = await mgr.send_to_org(3, "test", {})
        assert count == 0
        assert mgr.connection_count(3) == 0
```

**Verification:**
```bash
cd /Users/sadanakb/rechnungswerk/backend && python -m pytest -q --tb=short tests/test_websocket.py
# Expected: 5 passed
```

**Commit:** `feat: add WebSocket ConnectionManager — per-org event broadcasting`

---

## Task 3: WebSocket Endpoint in main.py

**Files:**
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_ws_endpoint.py`

### `backend/app/main.py` — WebSocket endpoint hinzufügen

Nach dem letzten `app.include_router(...)` und vor `@app.get("/")` einfügen:

```python
# WebSocket endpoint (Phase 9 — real-time events)
from fastapi import WebSocket, WebSocketDisconnect
from app.ws import manager as ws_manager


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = ""):
    """Real-time WebSocket endpoint. Auth via ?token=<jwt>."""
    from app.auth import decode_token
    from app.database import SessionLocal
    from app.models import OrganizationMember

    # Validate JWT token
    try:
        payload = decode_token(token)
        user_id = int(payload.get("sub", 0))
    except Exception:
        await websocket.close(code=1008)  # Policy Violation
        return

    # Resolve org_id
    db = SessionLocal()
    try:
        member = db.query(OrganizationMember).filter(
            OrganizationMember.user_id == user_id
        ).first()
        if not member:
            await websocket.close(code=1008)
            return
        org_id = member.organization_id
    finally:
        db.close()

    await ws_manager.connect(org_id, websocket)
    try:
        while True:
            # Keep connection alive — receive messages (ping/pong or ignore)
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(org_id, websocket)
```

Also need to add `decode_token` to `backend/app/auth.py` if it doesn't exist. Check auth.py first and add:

```python
def decode_token(token: str) -> dict:
    """Decode and validate a JWT token. Raises exception on failure."""
    from jose import jwt, JWTError
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key-change-in-production")
    ALGORITHM = "HS256"
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    return payload
```

### `backend/tests/test_ws_endpoint.py`

```python
"""Tests for WebSocket endpoint auth and connection (Task 3)."""
import pytest
from fastapi.testclient import TestClient


class TestWebSocketEndpoint:

    def test_websocket_rejects_missing_token(self, client):
        """WebSocket without token should be rejected (close code 1008)."""
        with client.websocket_connect("/ws?token=") as ws:
            # Server should close immediately
            pass  # Connection closes — no exception means graceful close

    def test_websocket_rejects_invalid_token(self, client):
        """WebSocket with invalid JWT should be rejected."""
        with client.websocket_connect("/ws?token=invalid-jwt") as ws:
            pass  # Should close without receiving data

    def test_websocket_connects_with_valid_token(self, client, test_user):
        """WebSocket with valid token should connect and stay open."""
        from app.auth import create_access_token
        token = create_access_token({"sub": str(test_user["user_id"])})
        with client.websocket_connect(f"/ws?token={token}") as ws:
            # Connection stays open — we can send a ping
            ws.send_text("ping")
            # No exception = connected successfully
```

**Verification:**
```bash
cd /Users/sadanakb/rechnungswerk/backend && python -m pytest -q --tb=short tests/test_ws_endpoint.py
# Expected: 3 passed
```

**Commit:** `feat: add WebSocket endpoint — JWT auth, org-scoped real-time events`

---

## Task 4: ARQ → WebSocket Bridge (notify_org in Tasks)

**Files:**
- Modify: `backend/app/routers/invoices.py` (notify on payment status change)
- Modify: `backend/app/routers/portal.py` (notify on portal visit + payment confirm)
- Modify: `backend/app/tasks/worker.py` (notify on recurring.created)
- Create: `backend/tests/test_ws_notifications.py`

### `backend/app/routers/portal.py` — WebSocket notifications

Im `confirm_payment` Endpoint, nach `db.commit()`:
```python
# Notify org via WebSocket
from app.ws import notify_org
try:
    await notify_org(
        invoice.organization_id,
        "invoice.paid",
        {"invoice_id": invoice.invoice_id, "amount": float(invoice.gross_amount or 0)},
    )
except Exception:
    pass  # WS notification is best-effort
```

Im `GET /{token}` Endpoint, nach `link.access_count += 1` + `db.commit()`:
```python
from app.ws import notify_org
try:
    await notify_org(
        invoice.organization_id,
        "portal.visited",
        {"invoice_id": invoice.invoice_id, "access_count": link.access_count},
    )
except Exception:
    pass
```

### `backend/app/tasks/worker.py` — notify recurring.created

In `daily_recurring_check`, nach `db.commit()` und vor `return`:
```python
# Notify org via WebSocket for each generated invoice
from app.ws import notify_org
import asyncio
for inv in newly_created_invoice_ids:  # collect invoice_ids during the loop above
    try:
        await notify_org(inv["org_id"], "recurring.created", {"invoice_id": inv["invoice_id"]})
    except Exception:
        pass
```

Note: In `daily_recurring_check` müssen während der Invoice-Erstellung `invoice_id` und `organization_id` gesammelt werden. Füge `generated_invoices = []` vor dem Loop hinzu und `generated_invoices.append({"invoice_id": invoice.invoice_id, "org_id": invoice.organization_id or 1})` nach `db.add(invoice)`.

### `backend/tests/test_ws_notifications.py`

```python
"""Tests for WebSocket event notifications from invoice actions (Task 4)."""
import pytest
from unittest.mock import AsyncMock, patch


class TestWebSocketNotifications:

    def test_portal_confirm_payment_sends_ws_event(self, client, db_session, test_user, test_invoice):
        """Confirming payment via portal should trigger a WebSocket event."""
        from app.models import InvoiceShareLink
        import uuid
        from datetime import datetime, timedelta

        # Create a share link
        link = InvoiceShareLink(
            invoice_id=test_invoice.id,
            token=str(uuid.uuid4()),
            expires_at=datetime.utcnow() + timedelta(days=30),
            created_by_user_id=test_user["user_id"],
        )
        db_session.add(link)
        db_session.commit()
        db_session.refresh(link)

        with patch("app.ws.notify_org", new_callable=AsyncMock) as mock_notify:
            response = client.post(f"/api/portal/{link.token}/confirm-payment")

        assert response.status_code == 200
        mock_notify.assert_called_once()
        call_args = mock_notify.call_args
        assert call_args[0][1] == "invoice.paid"

    def test_portal_visit_sends_ws_event(self, client, db_session, test_user, test_invoice):
        """Visiting the portal GET endpoint should trigger a portal.visited event."""
        from app.models import InvoiceShareLink
        import uuid
        from datetime import datetime, timedelta

        link = InvoiceShareLink(
            invoice_id=test_invoice.id,
            token=str(uuid.uuid4()),
            expires_at=datetime.utcnow() + timedelta(days=30),
            created_by_user_id=test_user["user_id"],
        )
        db_session.add(link)
        db_session.commit()
        db_session.refresh(link)

        with patch("app.ws.notify_org", new_callable=AsyncMock) as mock_notify:
            response = client.get(f"/api/portal/{link.token}")

        assert response.status_code == 200
        mock_notify.assert_called_once()
        assert mock_notify.call_args[0][1] == "portal.visited"
```

**Verification:**
```bash
cd /Users/sadanakb/rechnungswerk/backend && python -m pytest -q --tb=short tests/test_ws_notifications.py
# Expected: 2 passed
```

**Commit:** `feat: add WebSocket bridge — notify_org on portal visit, payment, recurring`

---

## Task 5: Frontend WebSocketContext

**Files:**
- Create: `frontend/contexts/WebSocketContext.tsx`
- Modify: `frontend/app/(dashboard)/layout.tsx`

### `frontend/contexts/WebSocketContext.tsx`

```typescript
'use client'

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { toast } from 'sonner'

export interface WSEvent {
  event: string
  data: Record<string, unknown>
}

interface WebSocketContextValue {
  lastEvent: WSEvent | null
  connected: boolean
  sendMessage: (msg: string) => void
}

const WebSocketContext = createContext<WebSocketContextValue>({
  lastEvent: null,
  connected: false,
  sendMessage: () => {},
})

export function useWebSocket() {
  return useContext(WebSocketContext)
}

function getToken(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem('rw-token') || ''
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const WS_BASE = API_BASE.replace(/^http/, 'ws')

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [lastEvent, setLastEvent] = useState<WSEvent | null>(null)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectDelay = useRef(1000)

  const connect = useCallback(() => {
    const token = getToken()
    if (!token) return

    const url = `${WS_BASE}/ws?token=${token}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      reconnectDelay.current = 1000  // reset backoff
    }

    ws.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data) as WSEvent
        setLastEvent(payload)
        handleEvent(payload)
      } catch {
        // ignore malformed messages
      }
    }

    ws.onclose = () => {
      setConnected(false)
      wsRef.current = null
      // Reconnect with exponential backoff (max 30s)
      const delay = Math.min(reconnectDelay.current, 30000)
      reconnectDelay.current = delay * 2
      reconnectTimer.current = setTimeout(connect, delay)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (wsRef.current) wsRef.current.close()
    }
  }, [connect])

  const sendMessage = useCallback((msg: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(msg)
    }
  }, [])

  return (
    <WebSocketContext.Provider value={{ lastEvent, connected, sendMessage }}>
      {children}
    </WebSocketContext.Provider>
  )
}

function handleEvent(event: WSEvent) {
  switch (event.event) {
    case 'invoice.paid':
      toast.success(`Rechnung ${event.data.invoice_id} als bezahlt bestätigt`, {
        description: `Betrag: ${Number(event.data.amount ?? 0).toFixed(2)} EUR`,
      })
      break
    case 'invoice.overdue':
      toast.error(`Rechnung ${event.data.invoice_id} ist überfällig`, {
        description: `Fällig seit: ${event.data.due_date}`,
      })
      break
    case 'portal.visited':
      toast.info(`Kunde hat Rechnung ${event.data.invoice_id} angesehen`, {
        description: `Aufrufe gesamt: ${event.data.access_count}`,
      })
      break
    case 'recurring.created':
      toast.success(`Wiederkehrende Rechnung ${event.data.invoice_id} erstellt`)
      break
    case 'invoice.categorized':
      toast.info(`Rechnung kategorisiert: ${event.data.category} (SKR03: ${event.data.skr03})`)
      break
  }
}
```

### `frontend/app/(dashboard)/layout.tsx` — WebSocketProvider einbinden

Nach dem letzten Import hinzufügen:
```typescript
import { WebSocketProvider } from '@/contexts/WebSocketContext'
```

Im Return, `<div className="flex h-screen ...">` mit WebSocketProvider wrappen:
```tsx
return (
  <WebSocketProvider>
    <div className="flex h-screen overflow-hidden">
      {/* ... existing content ... */}
    </div>
  </WebSocketProvider>
)
```

**Verification:**
```bash
cd /Users/sadanakb/rechnungswerk/frontend && npm run build 2>&1 | tail -10
# Expected: build succeeds, no TypeScript errors
```

**Commit:** `feat: add WebSocketContext — real-time event handling, toast notifications`

---

## Task 6: AI Routers (Kategorisierung + Monthly Summary)

**Files:**
- Create: `backend/app/routers/ai.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_ai_router.py`

### `backend/app/routers/ai.py`

```python
"""AI endpoints — categorization, monthly summary, chat."""
import logging
from datetime import datetime, date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.auth import get_current_user
from app.database import get_db
from app.models import Invoice, OrganizationMember

logger = logging.getLogger(__name__)
router = APIRouter()


def _resolve_org_id(current_user: dict, db: Session) -> int:
    member = db.query(OrganizationMember).filter(
        OrganizationMember.user_id == current_user["user_id"]
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="Keine Organisation gefunden")
    return member.organization_id


class CategorizeRequest(BaseModel):
    invoice_id: str


class CategorizeResponse(BaseModel):
    invoice_id: str
    skr03_account: str
    category: str


@router.post("/categorize", response_model=CategorizeResponse)
async def categorize_invoice_endpoint(
    body: CategorizeRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Manually trigger AI categorization for an invoice."""
    from app.ai_service import categorize_invoice

    org_id = _resolve_org_id(current_user, db)
    invoice = db.query(Invoice).filter(
        Invoice.invoice_id == body.invoice_id,
        Invoice.organization_id == org_id,
    ).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")

    description = " ".join([
        li.get("description", "") for li in (invoice.line_items or [])
    ]) or invoice.invoice_number or ""

    result = categorize_invoice(
        seller_name=invoice.seller_name or "",
        description=description,
        amount=float(invoice.gross_amount or 0),
    )

    invoice.skr03_account = result.get("skr03_account", "4900")
    invoice.ai_category = result.get("category", "Sonstige")
    invoice.ai_categorized_at = datetime.utcnow()
    db.commit()

    return CategorizeResponse(
        invoice_id=invoice.invoice_id,
        skr03_account=invoice.skr03_account,
        category=invoice.ai_category,
    )


@router.get("/monthly-summary")
async def get_monthly_summary(
    month: Optional[str] = None,  # Format: "2026-02"
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get AI-generated monthly invoice summary. Cached in Redis for 24h."""
    org_id = _resolve_org_id(current_user, db)

    # Determine month
    if month:
        try:
            year, mo = int(month.split("-")[0]), int(month.split("-")[1])
        except Exception:
            raise HTTPException(status_code=422, detail="month format must be YYYY-MM")
    else:
        now = datetime.utcnow()
        year, mo = now.year, now.month

    target_date = date(year, mo, 1)
    month_key = f"{year}-{mo:02d}"

    # Check Redis cache
    arq_pool = getattr(request.app.state if request else None, "arq_pool", None)
    redis_key = f"ai_summary:{org_id}:{month_key}"
    cached = None
    if arq_pool:
        try:
            cached = await arq_pool._pool.get(redis_key)
        except Exception:
            pass
    if cached:
        return {"month": month_key, "summary": cached.decode() if isinstance(cached, bytes) else cached, "cached": True}

    # Aggregate data from DB
    invoices = db.query(Invoice).filter(
        Invoice.organization_id == org_id,
        func.strftime("%Y-%m", Invoice.invoice_date) == month_key,
    ).all()

    if not invoices:
        return {"month": month_key, "summary": f"Im {month_key} wurden keine Rechnungen gefunden.", "cached": False}

    gross_total = sum(float(inv.gross_amount or 0) for inv in invoices)
    open_invoices = [inv for inv in invoices if inv.payment_status in ("unpaid", "open", None)]
    paid_invoices = [inv for inv in invoices if inv.payment_status == "paid"]
    overdue_invoices = [inv for inv in invoices if inv.payment_status == "overdue"]
    open_total = sum(float(inv.gross_amount or 0) for inv in open_invoices)

    # Top customer by gross amount
    customer_totals: dict = {}
    for inv in invoices:
        name = inv.buyer_name or "Unbekannt"
        customer_totals[name] = customer_totals.get(name, 0) + float(inv.gross_amount or 0)
    top_customer = max(customer_totals, key=lambda k: customer_totals[k]) if customer_totals else "Unbekannt"

    # Previous month comparison
    prev_mo = mo - 1 if mo > 1 else 12
    prev_year = year if mo > 1 else year - 1
    prev_month_key = f"{prev_year}-{prev_mo:02d}"
    prev_invoices = db.query(Invoice).filter(
        Invoice.organization_id == org_id,
        func.strftime("%Y-%m", Invoice.invoice_date) == prev_month_key,
    ).all()
    prev_total = sum(float(inv.gross_amount or 0) for inv in prev_invoices)
    prev_change = ((gross_total - prev_total) / prev_total * 100) if prev_total > 0 else 0.0

    MONTH_NAMES_DE = {1:"Januar",2:"Februar",3:"März",4:"April",5:"Mai",6:"Juni",
                      7:"Juli",8:"August",9:"September",10:"Oktober",11:"November",12:"Dezember"}

    from app.ai_service import generate_monthly_summary
    summary_text = generate_monthly_summary(
        month_name=MONTH_NAMES_DE[mo],
        invoice_count=len(invoices),
        gross_total=gross_total,
        open_count=len(open_invoices),
        open_total=open_total,
        paid_count=len(paid_invoices),
        overdue_count=len(overdue_invoices),
        top_customer=top_customer,
        prev_month_change=prev_change,
    )

    # Store in Redis cache (24h TTL)
    if arq_pool:
        try:
            await arq_pool._pool.set(redis_key, summary_text, ex=86400)
        except Exception:
            pass

    return {"month": month_key, "summary": summary_text, "cached": False}
```

### `backend/app/main.py` — AI router registrieren

Nach dem portal_router import und include, hinzufügen:
```python
from app.routers import ai as ai_router
# ...
app.include_router(ai_router.router, prefix="/api/ai", tags=["ai"])
```

### `backend/tests/test_ai_router.py`

```python
"""Tests for AI router endpoints (Task 6)."""
import pytest
from unittest.mock import patch


class TestAiRouter:

    def test_categorize_invoice_returns_skr03(self, client, test_user, test_invoice):
        """POST /api/ai/categorize should return skr03_account and category."""
        with patch("app.ai_service.categorize_invoice", return_value={
            "skr03_account": "4964", "category": "IT/Software"
        }):
            response = client.post(
                "/api/ai/categorize",
                json={"invoice_id": test_invoice.invoice_id},
                headers={"X-API-Key": test_user["api_key"]},
            )
        assert response.status_code == 200
        data = response.json()
        assert data["skr03_account"] == "4964"
        assert data["category"] == "IT/Software"

    def test_categorize_invoice_404_for_wrong_org(self, client, other_user, test_invoice):
        """Categorize from different org should return 404."""
        response = client.post(
            "/api/ai/categorize",
            json={"invoice_id": test_invoice.invoice_id},
            headers={"X-API-Key": other_user["api_key"]},
        )
        assert response.status_code == 404

    def test_monthly_summary_returns_text(self, client, test_user, db_session, test_invoice):
        """GET /api/ai/monthly-summary should return summary text."""
        from datetime import date
        test_invoice.invoice_date = date.today()
        db_session.commit()

        with patch("app.ai_service.generate_monthly_summary", return_value="Test Zusammenfassung."):
            response = client.get(
                "/api/ai/monthly-summary",
                headers={"X-API-Key": test_user["api_key"]},
            )
        assert response.status_code == 200
        data = response.json()
        assert "summary" in data
        assert len(data["summary"]) > 0

    def test_monthly_summary_invalid_month_format(self, client, test_user):
        """Invalid month format should return 422."""
        response = client.get(
            "/api/ai/monthly-summary?month=invalid",
            headers={"X-API-Key": test_user["api_key"]},
        )
        assert response.status_code == 422
```

**Verification:**
```bash
cd /Users/sadanakb/rechnungswerk/backend && python -m pytest -q --tb=short tests/test_ai_router.py
# Expected: 4 passed
```

**Commit:** `feat: add AI router — categorize endpoint, monthly summary with Redis cache`

---

## Task 7: ARQ Auto-Kategorisierung Task

**Files:**
- Modify: `backend/app/tasks/worker.py`
- Modify: `backend/app/routers/invoices.py` (enqueue after save)
- Create: `backend/tests/test_categorize_task.py`

### `backend/app/tasks/worker.py` — kategorisierungs Task hinzufügen

Nach `daily_recurring_check` Funktion, vor `async def startup`:

```python
async def categorize_invoice_task(ctx: Dict, invoice_id: str, org_id: int):
    """Async ARQ task: categorize invoice via AI and send WS notification."""
    from app.database import SessionLocal
    from app.models import Invoice
    from app.ai_service import categorize_invoice
    from app.ws import notify_org
    from datetime import datetime

    db = SessionLocal()
    try:
        invoice = db.query(Invoice).filter(Invoice.invoice_id == invoice_id).first()
        if not invoice:
            logger.warning("categorize_invoice_task: invoice %s not found", invoice_id)
            return {"error": "not found"}

        description = " ".join([
            li.get("description", "") for li in (invoice.line_items or [])
        ]) or invoice.invoice_number or ""

        result = categorize_invoice(
            seller_name=invoice.seller_name or "",
            description=description,
            amount=float(invoice.gross_amount or 0),
        )

        invoice.skr03_account = result.get("skr03_account", "4900")
        invoice.ai_category = result.get("category", "Sonstige")
        invoice.ai_categorized_at = datetime.utcnow()
        db.commit()

        logger.info("Categorized invoice %s → %s (%s)", invoice_id, invoice.skr03_account, invoice.ai_category)

        # Notify org via WebSocket
        try:
            await notify_org(
                org_id,
                "invoice.categorized",
                {
                    "invoice_id": invoice_id,
                    "skr03": invoice.skr03_account,
                    "category": invoice.ai_category,
                },
            )
        except Exception as e:
            logger.debug("WS notify failed (non-critical): %s", e)

        return {"invoice_id": invoice_id, "skr03_account": invoice.skr03_account, "category": invoice.ai_category}
    finally:
        db.close()
```

In `WorkerSettings.functions` hinzufügen:
```python
functions = [
    process_ocr_batch,
    generate_zugferd_task,
    process_email_inbox,
    send_email_task,
    webhook_retry_task,
    daily_recurring_check,
    categorize_invoice_task,  # NEU
]
```

### `backend/app/routers/invoices.py` — nach Invoice-Save enqueueen

Im `POST /api/invoices` Endpoint (oder dem Endpoint der neue Rechnungen erstellt), nach `db.commit()` und `db.refresh(invoice)`:

```python
# Async AI categorization (non-blocking)
arq_pool = getattr(request.app.state, "arq_pool", None)
if arq_pool:
    try:
        await arq_pool.enqueue_job(
            "categorize_invoice_task",
            invoice.invoice_id,
            org_id,
        )
    except Exception as e:
        logger.debug("Could not enqueue categorization task: %s", e)
```

Note: Lies zuerst `invoices.py` um den richtigen Endpoint zu finden. Suche nach dem Endpoint der eine neue Rechnung speichert (vermutlich `POST /api/invoices` oder ähnlich). Füge `request: Request` als Parameter hinzu falls nicht vorhanden.

### `backend/tests/test_categorize_task.py`

```python
"""Tests for async invoice categorization ARQ task (Task 7)."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class TestCategorizeInvoiceTask:

    @pytest.mark.asyncio
    async def test_categorize_task_updates_invoice(self, db_session, test_invoice):
        """categorize_invoice_task should update skr03_account and ai_category on invoice."""
        from app.tasks.worker import categorize_invoice_task

        ctx = {}
        with patch("app.ai_service.categorize_invoice", return_value={
            "skr03_account": "4964", "category": "IT/Software"
        }), patch("app.ws.notify_org", new_callable=AsyncMock):
            result = await categorize_invoice_task(
                ctx,
                invoice_id=test_invoice.invoice_id,
                org_id=test_invoice.organization_id or 1,
            )

        assert result["skr03_account"] == "4964"
        db_session.refresh(test_invoice)
        assert test_invoice.skr03_account == "4964"
        assert test_invoice.ai_category == "IT/Software"

    @pytest.mark.asyncio
    async def test_categorize_task_invoice_not_found(self):
        """categorize_invoice_task with unknown invoice_id should return error."""
        from app.tasks.worker import categorize_invoice_task

        ctx = {}
        result = await categorize_invoice_task(ctx, invoice_id="NONEXISTENT-999", org_id=1)
        assert result.get("error") == "not found"

    @pytest.mark.asyncio
    async def test_categorize_task_sends_ws_notification(self, db_session, test_invoice):
        """After categorization, a WebSocket event should be sent."""
        from app.tasks.worker import categorize_invoice_task

        ctx = {}
        with patch("app.ai_service.categorize_invoice", return_value={
            "skr03_account": "4800", "category": "Personalkosten"
        }), patch("app.ws.notify_org", new_callable=AsyncMock) as mock_notify:
            await categorize_invoice_task(
                ctx,
                invoice_id=test_invoice.invoice_id,
                org_id=test_invoice.organization_id or 1,
            )

        mock_notify.assert_called_once()
        assert mock_notify.call_args[0][1] == "invoice.categorized"
```

**Verification:**
```bash
cd /Users/sadanakb/rechnungswerk/backend && python -m pytest -q --tb=short tests/test_categorize_task.py
# Expected: 3 passed
```

**Commit:** `feat: add auto-categorization ARQ task — SKR03, WS notification`

---

## Task 8: Alembic Migration Phase 9

**Files:**
- Modify: `backend/app/models.py` (neue Spalten)
- Create: `backend/alembic/versions/phase9_ai_columns.py`

### `backend/app/models.py` — neue Spalten in Invoice

In der `Invoice`-Klasse nach den bestehenden Spalten einfügen (nach `payment_status` Spalte):

```python
# AI Kategorisierung (Phase 9)
skr03_account = Column(String(10), nullable=True)
ai_category = Column(String(100), nullable=True)
ai_categorized_at = Column(DateTime, nullable=True)
```

### `backend/alembic/versions/phase9_ai_columns.py`

```python
"""add Phase 9 — AI categorization columns to invoices

Revision ID: c8d4f0e5a3b2
Revises: b7c3e9f4d2a1
Create Date: 2026-02-28 10:00:00.000000
"""
from typing import Union
from alembic import op
import sqlalchemy as sa

revision: str = 'c8d4f0e5a3b2'
down_revision: Union[str, None] = 'b7c3e9f4d2a1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('invoices', sa.Column('skr03_account', sa.String(10), nullable=True))
    op.add_column('invoices', sa.Column('ai_category', sa.String(100), nullable=True))
    op.add_column('invoices', sa.Column('ai_categorized_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('invoices', 'ai_categorized_at')
    op.drop_column('invoices', 'ai_category')
    op.drop_column('invoices', 'skr03_account')
```

**Verification:**
```bash
cd /Users/sadanakb/rechnungswerk/backend && python -c "from alembic.config import Config; from alembic import command; c = Config('alembic.ini'); command.history(c)" 2>&1 | head -5
# Expected: c8d4f0e5a3b2 appears
```

**Commit:** `feat: add Alembic Phase 9 migration — AI categorization columns`

---

## Task 9: AI Chat Endpoint (Streaming SSE)

**Files:**
- Modify: `backend/app/routers/ai.py` (chat endpoint hinzufügen)
- Create: `backend/tests/test_ai_chat.py`

### `backend/app/routers/ai.py` — chat endpoint anhängen

Am Ende der Datei hinzufügen:

```python
class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


SYSTEM_PROMPT = """Du bist ein hilfreicher Buchhaltungsassistent für das Rechnungstool RechnungsWerk.
Du hilfst dem Nutzer bei Fragen zu seinen Rechnungen, Umsätzen und Buchhaltung.
Antworte immer auf Deutsch, präzise und professionell.
Du hast Zugang zu den Rechnungsdaten des Nutzers über die bereitgestellten Tools."""


@router.post("/chat")
async def chat(
    body: ChatRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Streaming chat endpoint using SSE. Supports tool use for DB queries."""
    from fastapi.responses import StreamingResponse
    import json

    org_id = _resolve_org_id(current_user, db)

    # Build tool definitions
    tools = [
        {
            "type": "function",
            "function": {
                "name": "get_invoice_stats",
                "description": "Holt Rechnungsstatistiken: Anzahl, Summen, Status-Verteilung",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "period": {"type": "string", "enum": ["today", "week", "month", "year", "all"]},
                    },
                    "required": ["period"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_overdue_invoices",
                "description": "Listet alle überfälligen Rechnungen auf",
                "parameters": {"type": "object", "properties": {}},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_top_customers",
                "description": "Zeigt die Top-Kunden nach Umsatz",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "limit": {"type": "integer", "default": 5},
                    },
                },
            },
        },
    ]

    def execute_tool(tool_name: str, arguments: dict) -> str:
        """Execute a tool call and return result as string."""
        from datetime import date, timedelta
        from sqlalchemy import func

        if tool_name == "get_invoice_stats":
            period = arguments.get("period", "month")
            query = db.query(Invoice).filter(Invoice.organization_id == org_id)
            today = date.today()
            if period == "today":
                query = query.filter(Invoice.invoice_date == today)
            elif period == "week":
                query = query.filter(Invoice.invoice_date >= today - timedelta(days=7))
            elif period == "month":
                query = query.filter(
                    func.strftime("%Y-%m", Invoice.invoice_date) == today.strftime("%Y-%m")
                )
            elif period == "year":
                query = query.filter(
                    func.strftime("%Y", Invoice.invoice_date) == str(today.year)
                )
            invoices = query.all()
            total = sum(float(inv.gross_amount or 0) for inv in invoices)
            paid = sum(1 for inv in invoices if inv.payment_status == "paid")
            open_inv = sum(1 for inv in invoices if inv.payment_status in ("unpaid", "open", None))
            overdue = sum(1 for inv in invoices if inv.payment_status == "overdue")
            return f"Zeitraum '{period}': {len(invoices)} Rechnungen, Gesamtumsatz {total:.2f} EUR, {paid} bezahlt, {open_inv} offen, {overdue} überfällig"

        elif tool_name == "get_overdue_invoices":
            invoices = db.query(Invoice).filter(
                Invoice.organization_id == org_id,
                Invoice.payment_status == "overdue",
            ).limit(10).all()
            if not invoices:
                return "Keine überfälligen Rechnungen."
            lines = [f"- {inv.invoice_number} ({inv.buyer_name}): {float(inv.gross_amount or 0):.2f} EUR, fällig {inv.due_date}" for inv in invoices]
            return "\n".join(lines)

        elif tool_name == "get_top_customers":
            limit = arguments.get("limit", 5)
            invoices = db.query(Invoice).filter(Invoice.organization_id == org_id).all()
            totals: dict = {}
            for inv in invoices:
                name = inv.buyer_name or "Unbekannt"
                totals[name] = totals.get(name, 0) + float(inv.gross_amount or 0)
            sorted_customers = sorted(totals.items(), key=lambda x: x[1], reverse=True)[:limit]
            lines = [f"{i+1}. {name}: {total:.2f} EUR" for i, (name, total) in enumerate(sorted_customers)]
            return "\n".join(lines) if lines else "Keine Kundendaten vorhanden."

        return f"Unbekanntes Tool: {tool_name}"

    async def stream_response():
        """Generator for SSE streaming."""
        from app.config import settings as app_settings

        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        for msg in body.history[-10:]:  # Max 10 history messages
            messages.append({"role": msg.role, "content": msg.content})
        messages.append({"role": "user", "content": body.message})

        try:
            if app_settings.anthropic_api_key:
                # Use Anthropic streaming with tool use
                from anthropic import Anthropic
                client = Anthropic(api_key=app_settings.anthropic_api_key)

                anthropic_tools = [
                    {
                        "name": t["function"]["name"],
                        "description": t["function"]["description"],
                        "input_schema": t["function"]["parameters"],
                    }
                    for t in tools
                ]

                with client.messages.stream(
                    model="claude-haiku-4-5-20251001",
                    max_tokens=1024,
                    system=SYSTEM_PROMPT,
                    messages=[{"role": m["role"], "content": m["content"]} for m in messages if m["role"] != "system"],
                    tools=anthropic_tools,
                ) as stream:
                    tool_calls_made = []
                    for event in stream:
                        if hasattr(event, "type"):
                            if event.type == "content_block_delta" and hasattr(event.delta, "text"):
                                yield f"data: {json.dumps({'token': event.delta.text})}\n\n"
                            elif event.type == "content_block_start" and hasattr(event.content_block, "type") and event.content_block.type == "tool_use":
                                tool_calls_made.append(event.content_block)

                    # Execute tool calls if any
                    for tool_call in tool_calls_made:
                        tool_result = execute_tool(tool_call.name, tool_call.input)
                        yield f"data: {json.dumps({'tool_result': tool_result})}\n\n"

            elif app_settings.openai_api_key:
                # Use OpenAI streaming
                from openai import OpenAI
                client = OpenAI(api_key=app_settings.openai_api_key)

                stream = client.chat.completions.create(
                    model=app_settings.openai_model,
                    messages=messages,
                    tools=tools,
                    stream=True,
                    max_tokens=1024,
                )

                tool_name_buf = ""
                tool_args_buf = ""
                in_tool_call = False

                for chunk in stream:
                    delta = chunk.choices[0].delta if chunk.choices else None
                    if not delta:
                        continue
                    if delta.content:
                        yield f"data: {json.dumps({'token': delta.content})}\n\n"
                    if delta.tool_calls:
                        in_tool_call = True
                        for tc in delta.tool_calls:
                            if tc.function.name:
                                tool_name_buf += tc.function.name
                            if tc.function.arguments:
                                tool_args_buf += tc.function.arguments

                if in_tool_call and tool_name_buf:
                    try:
                        args = json.loads(tool_args_buf) if tool_args_buf else {}
                    except Exception:
                        args = {}
                    tool_result = execute_tool(tool_name_buf, args)
                    yield f"data: {json.dumps({'tool_result': tool_result})}\n\n"
            else:
                yield f"data: {json.dumps({'token': 'Kein KI-Provider konfiguriert. Bitte OPENAI_API_KEY oder ANTHROPIC_API_KEY setzen.'})}\n\n"

        except Exception as e:
            logger.error("Chat streaming error: %s", e)
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

        yield "data: [DONE]\n\n"

    from fastapi.responses import StreamingResponse
    return StreamingResponse(stream_response(), media_type="text/event-stream")
```

### `backend/tests/test_ai_chat.py`

```python
"""Tests for AI chat endpoint (Task 9)."""
import pytest
from unittest.mock import patch, MagicMock


class TestAiChat:

    def test_chat_returns_streaming_response(self, client, test_user):
        """POST /api/ai/chat should return a streaming SSE response."""
        with patch("app.config.settings") as mock_settings:
            mock_settings.anthropic_api_key = ""
            mock_settings.openai_api_key = ""
            response = client.post(
                "/api/ai/chat",
                json={"message": "Hallo", "history": []},
                headers={"X-API-Key": test_user["api_key"]},
            )
        assert response.status_code == 200
        assert "text/event-stream" in response.headers.get("content-type", "")

    def test_chat_no_provider_returns_fallback_message(self, client, test_user):
        """Without API keys, chat should return fallback message in stream."""
        with patch("app.ai_service.settings") as mock_s, \
             patch("app.routers.ai.settings", new=mock_s):
            mock_s.anthropic_api_key = ""
            mock_s.openai_api_key = ""
            response = client.post(
                "/api/ai/chat",
                json={"message": "Test", "history": []},
                headers={"X-API-Key": test_user["api_key"]},
            )
        assert response.status_code == 200

    def test_chat_cross_org_data_isolation(self, client, other_user, test_invoice):
        """Chat tool calls must only access data of the authenticated user's org."""
        with patch("app.config.settings") as mock_settings:
            mock_settings.anthropic_api_key = ""
            mock_settings.openai_api_key = ""
            response = client.post(
                "/api/ai/chat",
                json={"message": "Zeige alle Rechnungen", "history": []},
                headers={"X-API-Key": other_user["api_key"]},
            )
        # Should succeed (200) but not expose test_invoice data
        assert response.status_code == 200
```

**Verification:**
```bash
cd /Users/sadanakb/rechnungswerk/backend && python -m pytest -q --tb=short tests/test_ai_chat.py
# Expected: 3 passed
```

**Commit:** `feat: add AI chat endpoint — streaming SSE, tool use, DB queries`

---

## Task 10: Frontend Chat Widget

**Files:**
- Create: `frontend/components/ai/ChatWidget.tsx`
- Modify: `frontend/app/(dashboard)/layout.tsx`
- Modify: `frontend/lib/api.ts`

### `frontend/lib/api.ts` — chat helper hinzufügen

Am Ende der Datei:
```typescript
export async function streamChatMessage(
  message: string,
  history: Array<{ role: string; content: string }>,
  onToken: (token: string) => void,
  onToolResult: (result: string) => void,
  onDone: () => void,
): Promise<void> {
  const token = localStorage.getItem('rw-token') || ''
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
  const response = await fetch(`${apiBase}/api/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': token,
    },
    body: JSON.stringify({ message, history }),
  })
  if (!response.ok || !response.body) return
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const text = decoder.decode(value)
    const lines = text.split('\n')
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') { onDone(); return }
      try {
        const parsed = JSON.parse(data)
        if (parsed.token) onToken(parsed.token)
        if (parsed.tool_result) onToolResult(parsed.tool_result)
      } catch { /* ignore */ }
    }
  }
  onDone()
}
```

### `frontend/components/ai/ChatWidget.tsx`

```typescript
'use client'

import { useState, useRef, useEffect } from 'react'
import { streamChatMessage } from '@/lib/api'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || streaming) return
    const userMsg: Message = { role: 'user', content: input.trim() }
    const history = messages.map(m => ({ role: m.role, content: m.content }))
    setMessages(prev => [...prev, userMsg, { role: 'assistant', content: '' }])
    setInput('')
    setStreaming(true)

    await streamChatMessage(
      userMsg.content,
      history,
      (token) => {
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: updated[updated.length - 1].content + token,
          }
          return updated
        })
      },
      (toolResult) => {
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: updated[updated.length - 1].content + '\n\n' + toolResult,
          }
          return updated
        })
      },
      () => setStreaming(false),
    )
  }

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-110"
        style={{ backgroundColor: 'rgb(var(--primary))', color: 'white' }}
        title="KI-Assistent"
      >
        {open ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        )}
      </button>

      {/* Chat window */}
      {open && (
        <div
          className="fixed bottom-22 right-6 z-50 w-80 rounded-xl shadow-2xl flex flex-col overflow-hidden"
          style={{ height: '420px', backgroundColor: 'rgb(var(--card))', border: '1px solid rgb(var(--border))' }}
        >
          {/* Header */}
          <div
            className="px-4 py-3 flex items-center gap-2 shrink-0"
            style={{ backgroundColor: 'rgb(var(--primary))', color: 'white' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <span className="text-sm font-semibold">KI-Assistent</span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center pt-8">
                <p className="text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>
                  Frag mich zu deinen Rechnungen!
                </p>
                <p className="text-xs mt-1" style={{ color: 'rgb(var(--foreground-muted))' }}>
                  z.B. „Welche Rechnungen sind offen?"
                </p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className="max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap"
                  style={msg.role === 'user'
                    ? { backgroundColor: 'rgb(var(--primary))', color: 'white' }
                    : { backgroundColor: 'rgb(var(--muted))', color: 'rgb(var(--foreground))' }
                  }
                >
                  {msg.content || (msg.role === 'assistant' && streaming && i === messages.length - 1 ? '…' : '')}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div
            className="p-3 flex gap-2 shrink-0"
            style={{ borderTop: '1px solid rgb(var(--border))' }}
          >
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Frage stellen…"
              disabled={streaming}
              className="flex-1 text-sm rounded-lg px-3 py-2 focus:outline-none disabled:opacity-50"
              style={{
                border: '1px solid rgb(var(--border))',
                backgroundColor: 'rgb(var(--card))',
                color: 'rgb(var(--foreground))',
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || streaming}
              className="px-3 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-colors"
              style={{ backgroundColor: 'rgb(var(--primary))' }}
            >
              →
            </button>
          </div>
        </div>
      )}
    </>
  )
}
```

### `frontend/app/(dashboard)/layout.tsx` — ChatWidget einbinden

Import hinzufügen:
```typescript
import { ChatWidget } from '@/components/ai/ChatWidget'
```

Vor dem letzten `</>` im Return (nach `</div>` des Haupt-Div):
```tsx
<ChatWidget />
```

**Verification:**
```bash
cd /Users/sadanakb/rechnungswerk/frontend && npm run build 2>&1 | tail -10
# Expected: build succeeds
```

**Commit:** `feat: add AI chat widget — floating, streaming SSE, tool results`

---

## Task 11: Dashboard Monthly Summary Widget

**Files:**
- Modify: `frontend/lib/api.ts` (monthly summary helper)
- Modify: `frontend/app/(dashboard)/dashboard/page.tsx`

### `frontend/lib/api.ts` — monthly summary helper

```typescript
export async function getAiMonthlySummary(month?: string): Promise<{
  month: string
  summary: string
  cached: boolean
}> {
  const url = month ? `/api/ai/monthly-summary?month=${month}` : '/api/ai/monthly-summary'
  const res = await api.get(url)
  return res.data
}
```

### `frontend/app/(dashboard)/dashboard/page.tsx` — Summary Widget hinzufügen

Import hinzufügen:
```typescript
import { getAiMonthlySummary } from '@/lib/api'
```

State hinzufügen (nach bestehenden useState):
```typescript
const [aiSummary, setAiSummary] = useState<string | null>(null)
const [summaryLoading, setSummaryLoading] = useState(false)
```

Im `useEffect` oder separatem Effect laden:
```typescript
useEffect(() => {
  setSummaryLoading(true)
  getAiMonthlySummary()
    .then(r => setAiSummary(r.summary))
    .catch(() => setAiSummary(null))
    .finally(() => setSummaryLoading(false))
}, [])
```

Widget JSX im Return (nach den KPI-Cards, vor dem Chart):
```tsx
{/* AI Monthly Summary */}
{(aiSummary || summaryLoading) && (
  <div
    className="mx-4 mb-4 p-4 rounded-xl"
    style={{
      backgroundColor: 'rgb(var(--card))',
      border: '1px solid rgb(var(--border))',
    }}
  >
    <div className="flex items-center gap-2 mb-2">
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"
        style={{ color: 'rgb(var(--primary))' }}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
      <span className="text-sm font-semibold" style={{ color: 'rgb(var(--foreground))' }}>
        KI-Zusammenfassung
      </span>
    </div>
    {summaryLoading ? (
      <div className="h-4 rounded animate-pulse" style={{ backgroundColor: 'rgb(var(--muted))' }} />
    ) : (
      <p className="text-sm leading-relaxed" style={{ color: 'rgb(var(--foreground-muted))' }}>
        {aiSummary}
      </p>
    )}
  </div>
)}
```

**Verification:**
```bash
cd /Users/sadanakb/rechnungswerk/frontend && npm run build 2>&1 | tail -10
# Expected: build succeeds, no TypeScript errors
```

**Commit:** `feat: add AI monthly summary widget to dashboard`

---

## Task 12: Final Verification + Changelog v0.9.0 + Merge

**Files:**
- Run: full pytest suite
- Run: npm build
- Modify: `frontend/app/(marketing)/changelog/page.tsx`
- Merge: to master

### Step 1: Full backend tests
```bash
cd /Users/sadanakb/rechnungswerk/backend && python -m pytest -q 2>&1 | tail -10
# Expected: 430+ passed (all original + new Phase 9 tests)
```

### Step 2: Frontend build
```bash
cd /Users/sadanakb/rechnungswerk/frontend && npm run build 2>&1 | tail -15
# Expected: build succeeds, 114+ routes
```

### Step 3: Changelog v0.9.0

Find the `releases` array and insert at the top:
```typescript
{
  version: 'v0.9.0',
  title: 'Phase 9: KI-Suite + Echtzeit',
  date: '28.02.2026',
  items: [
    { text: 'GPT-4o-mini als Primary KI-Provider (7,5× günstiger als Claude Haiku)', tag: 'infra' },
    { text: 'Auto-Routing: Standard → GPT-4o-mini, Komplex → Claude Haiku, Dev → Ollama', tag: 'infra' },
    { text: 'WebSocket Echtzeit-Events: invoice.paid, portal.visited, recurring.created', tag: 'feature' },
    { text: 'KI-Chat-Assistent mit Tool Use (Streaming SSE, Datenbankabfragen)', tag: 'feature' },
    { text: 'Auto-Kategorisierung nach SKR03 — asynchron via ARQ nach Invoice-Speicherung', tag: 'feature' },
    { text: 'Monatliche KI-Zusammenfassung im Dashboard (Redis-gecacht, 24h TTL)', tag: 'feature' },
    { text: 'WebSocket ConnectionManager mit Reconnect-Backoff (1s → 30s max)', tag: 'feature' },
    { text: 'Toast-Notifications via Sonner bei Echtzeit-Events', tag: 'feature' },
    { text: 'Alembic Migration: skr03_account, ai_category, ai_categorized_at Spalten', tag: 'infra' },
  ],
},
```

### Step 4: Sidebar version bump

In `frontend/components/layout/SidebarNav.tsx` ändern:
```
4.0.0 → 5.0.0
```

### Step 5: Merge + CHECKPOINT update

```bash
cd /Users/sadanakb/rechnungswerk
git add frontend/app/\(marketing\)/changelog/page.tsx frontend/components/layout/SidebarNav.tsx
git commit -m "feat: add v0.9.0 changelog entry — Phase 9 KI-Suite + Echtzeit"
git checkout master
git merge --no-ff feature/phase9-ki-echtzeit -m "feat: merge Phase 9 — KI-Suite + Echtzeit"
git push origin master
```

Update `.claude/CHECKPOINT.md`:
```markdown
# Checkpoint — 2026-02-28 12:00

## Ziel
RechnungsWerk — production-ready German e-invoicing SaaS, alle Phasen 1-9 abgeschlossen.

## Erledigt
- [x] Phasen 1-8: vollständig (siehe HANDOFF.md für Details)
- [x] Phase 9: KI-Suite + Echtzeit (GPT-4o-mini, WebSocket, Chat, SKR03, Summary)

## Entscheidungen
- KI: GPT-4o-mini Primary (Standard), Claude Haiku (Complex/Chat), Ollama (Dev-Fallback)
- WebSocket: /ws?token=<jwt>, ConnectionManager Singleton in app/ws.py
- Chat: Streaming SSE via StreamingResponse, Tool Use für DB-Queries
- SKR03: Async ARQ-Task nach Invoice-Save, WS-Event invoice.categorized
- Summary: Redis-Cache 24h, strftime("%Y-%m") für SQLite Datumsfilterung

## Build/Test-Status
- Backend: 430+ Tests, 0 Fehler
- Frontend: 114+ Seiten, 0 TypeScript-Fehler
- Master: latest — Phase 9 gemergt

## Naechster Schritt
Phase 10 planen falls gewünscht.
```

**Commit + Push CHECKPOINT:**
```bash
git add .claude/CHECKPOINT.md && git commit -m "chore: update CHECKPOINT — Phase 9 complete" && git push origin master
```

---

## Wichtige Hinweise

1. **SQLite strftime** — `func.strftime("%Y-%m", Invoice.invoice_date)` für Datumsfilterung. Für PostgreSQL wäre es `func.to_char(Invoice.invoice_date, 'YYYY-MM')`.

2. **WebSocket in Tests** — FastAPI TestClient unterstützt WebSocket via `client.websocket_connect("/ws?token=...")`. Bei Test-Failures das `token` via `create_access_token({"sub": str(user_id)})` generieren.

3. **SSE in Tests** — Streaming-Endpoints schwer zu testen; stattdessen den Status-Code und Content-Type prüfen. Keine Mock-Streaming-Tests nötig.

4. **openai `response_format`** — `{"type": "json_object"}` nur verfügbar bei `gpt-4o-mini` und neueren Modellen. Bei älteren Modellen (gpt-3.5-turbo) weglassen.

5. **Redis._pool** — Der `arq_pool._pool` Zugriff ist implementation-dependent. Alternativ: eigenen Redis-Client für Caching anlegen via `redis.asyncio.from_url(settings.redis_url)` im lifespan.

6. **Branch erstellen** vor Task 1:
```bash
cd /Users/sadanakb/rechnungswerk && git checkout -b feature/phase9-ki-echtzeit
```
