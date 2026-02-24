# RechnungsWerk

**E-Rechnungs-Plattform für Deutschland — XRechnung 3.0.2 · ZUGFeRD · KI-OCR · DATEV-Export**

![CI](https://github.com/sadanakb/rechnungswerk/actions/workflows/ci.yml/badge.svg)
![XRechnung](https://img.shields.io/badge/XRechnung-3.0.2-blue)
![EN 16931](https://img.shields.io/badge/EN_16931-compliant-green)
![Tests](https://img.shields.io/badge/tests-174%20passing-brightgreen)
![License](https://img.shields.io/badge/license-MIT-yellow)

RechnungsWerk wandelt Papierrechnungen per KI-OCR in normkonforme XRechnung-XML um, generiert ZUGFeRD-PDFs und validiert gegen den offiziellen KoSIT-Validator. Gedacht als Open-Source-Alternative zu sevDesk & Co. (die 500–2.000 €/Monat kosten).

### Warum dieses Projekt?

Ich habe RechnungsWerk gestartet, weil die E-Rechnungspflicht ab 2025 jedes Unternehmen in Deutschland betrifft — und die bestehenden Lösungen kosten 500–2.000 €/Monat. Als Wirtschaftsinformatik-Student war mein Ziel: eine Open-Source-Alternative bauen, die alles kann was die teuren Tools können. XRechnung 3.0.2, ZUGFeRD, KoSIT-Validierung, DATEV-Export — alles in einem System, kostenlos und selbst gehostet.

---

## Quick Start (5 Minuten)

```bash
# 1. Repository klonen
git clone https://github.com/sadanakb/rechnungswerk.git
cd rechnungswerk

# 2. Backend starten
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload

# 3. Frontend starten (neues Terminal)
cd frontend
npm install
npm run dev
```

**Öffne:** http://localhost:3001 · API-Docs: http://localhost:8001/docs

---

## Features

| Modul | Beschreibung |
|-------|-------------|
| **KI-OCR** | PDF-Upload → PaddleOCR + Ollama extrahieren alle Rechnungsfelder mit Per-Feld-Confidence |
| **Manuelle Eingabe** | 6-Schritt-Wizard mit Live-Berechnung Netto/MwSt/Brutto |
| **XRechnung 3.0.2** | EN 16931-konformes UBL-XML, alle Pflichtfelder (BT-1 bis BT-112) |
| **ZUGFeRD PDF/A-3** | XML wird in PDF eingebettet (factur-x, Profil EXTENDED) |
| **KoSIT-Validator** | Validierung gegen offizielle Schematron-Regeln (Docker + lokaler Fallback) |
| **DATEV-Export** | Buchungsstapel (ASCII) und CSV für SKR03/SKR04 |
| **Lieferanten** | Stammdaten-Verwaltung mit Auto-Complete in Formularen |
| **Wiederkehrende Rechnungen** | Templates mit monatlicher/vierteljährlicher/jährlicher Auslösung |
| **KI-Kategorisierung** | Ollama (`qwen2.5:14b`) ordnet Rechnungen SKR03/SKR04-Konten zu |
| **Analytics** | Monatliches Rechnungsvolumen, Top-Lieferanten, MwSt-Übersicht |
| **Batch-OCR** | Mehrere PDFs gleichzeitig hochladen und verarbeiten |
| **Betrugs-Erkennung** | Duplikat-Check, IBAN-Änderungs-Warnung, Betrags-Anomalien |

---

## Rechtliche Grundlage

| Datum | Pflicht |
|-------|---------|
| seit 2020 | XRechnung für B2G (Behörden) Pflicht |
| 01.01.2025 | Alle B2B-Unternehmen müssen XRechnung **empfangen** können |
| 01.01.2027 | Unternehmen > 800.000 € Umsatz müssen XRechnung **senden** |
| 01.01.2028 | **Alle** Unternehmen müssen XRechnung senden |

---

## Voraussetzungen

| Software | Version | Wozu |
|----------|---------|------|
| Python | 3.11+ | Backend |
| Node.js | 20+ | Frontend |
| Tesseract OCR | 5.x | OCR-Fallback |
| Ollama | aktuell | KI-OCR + Kategorisierung (optional) |
| Docker | aktuell | KoSIT-Validator (optional) |

### Tesseract installieren

```bash
# macOS
brew install tesseract tesseract-lang

# Ubuntu / Debian
sudo apt-get install tesseract-ocr tesseract-ocr-deu

# Prüfen
tesseract --version && tesseract --list-langs | grep deu
```

### Ollama installieren (empfohlen für beste OCR-Qualität)

```bash
# macOS / Linux
curl -fsSL https://ollama.com/install.sh | sh

# Modelle laden (einmalig, ~9 GB)
ollama pull qwen2.5:14b    # Für OCR und Kategorisierung
ollama pull llava:13b      # Für Vision-OCR (Tabellen/Bilder)

# Ollama läuft automatisch auf http://localhost:11434
```

> Ohne Ollama fällt die App auf Tesseract-OCR zurück. Alle Features außer KI-OCR und Kategorisierung funktionieren weiterhin.

---

## Installation

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Konfiguration
cp .env.example .env
# .env nach Bedarf anpassen (API-Key, DB-URL, Ollama-URL)

# Datenbank initialisieren
alembic upgrade head

# Server starten
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

Backend läuft auf: http://localhost:8001
Swagger-Dokumentation: http://localhost:8001/docs

### Frontend

```bash
cd frontend
npm install
npm run dev        # Entwicklung auf http://localhost:3001
npm run build      # Produktions-Build
npm start          # Produktions-Server
```

### Umgebungsvariablen (`.env`)

```env
# Pflicht
DATABASE_URL=sqlite:///./data/rechnungswerk.db
API_KEY=dein-geheimer-api-key          # Für API-Authentifizierung
REQUIRE_API_KEY=true                    # false für lokale Entwicklung

# Ollama (optional, für KI-OCR)
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:14b

# KoSIT Validator (optional, Docker erforderlich)
KOSIT_VALIDATOR_URL=http://localhost:8081/validate

# Frontend-URL (für CORS)
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

---

## KoSIT-Validator (optional)

Validiert XRechnung-XML gegen die offiziellen Schematron-Regeln (XRechnung 3.0.2).

```bash
# Docker-Container starten
docker pull kositvalidator/validator:v1.6.0
docker run -p 8081:8080 kositvalidator/validator:v1.6.0

# Manuell validieren
curl -X POST http://localhost:8081/validate \
  -F 'file=@rechnung.xml' \
  -F 'scenario=xrechnung-3.0.2'
```

Ohne Docker greift RechnungsWerk auf den lokalen Fallback-Validator zurück (prüft XML-Struktur und Pflichtfelder).

---

## API-Referenz

Alle Endpunkte sind unter http://localhost:8001/docs (Swagger) vollständig dokumentiert.

### Authentifizierung

```bash
# API-Key im Header mitsenden
curl -H "X-API-Key: dein-api-key" http://localhost:8001/api/invoices
```

### Wichtigste Endpunkte

#### OCR & Upload
| Methode | Pfad | Beschreibung |
|---------|------|-------------|
| `POST` | `/api/upload-ocr` | Einzelne PDF per OCR verarbeiten |
| `POST` | `/api/upload-ocr-batch` | Mehrere PDFs als Batch |
| `GET` | `/api/upload-ocr-batch/{id}` | Batch-Status abfragen |

#### Rechnungen
| Methode | Pfad | Beschreibung |
|---------|------|-------------|
| `POST` | `/api/invoices` | Rechnung manuell anlegen |
| `GET` | `/api/invoices` | Alle Rechnungen (`?skip=0&limit=50`) |
| `GET` | `/api/invoices/{id}` | Einzelne Rechnung |
| `DELETE` | `/api/invoices/{id}` | Rechnung löschen |
| `POST` | `/api/invoices/{id}/generate-xrechnung` | XRechnung-XML generieren |
| `GET` | `/api/invoices/{id}/download-xrechnung` | XML herunterladen |
| `POST` | `/api/invoices/{id}/generate-zugferd` | ZUGFeRD-PDF generieren |
| `GET` | `/api/invoices/{id}/download-zugferd` | ZUGFeRD-PDF herunterladen |
| `POST` | `/api/invoices/{id}/validate` | Gegen KoSIT validieren |
| `POST` | `/api/invoices/{id}/categorize` | KI-Kategorisierung (SKR03/SKR04) |
| `POST` | `/api/invoices/{id}/check-fraud` | Betrugs-Prüfung |

#### Lieferanten
| Methode | Pfad | Beschreibung |
|---------|------|-------------|
| `GET` | `/api/suppliers` | Alle Lieferanten |
| `POST` | `/api/suppliers` | Lieferant anlegen |
| `PUT` | `/api/suppliers/{id}` | Lieferant aktualisieren |
| `DELETE` | `/api/suppliers/{id}` | Lieferant löschen |
| `GET` | `/api/suppliers/search?q=...` | Lieferanten suchen |

#### Wiederkehrende Rechnungen
| Methode | Pfad | Beschreibung |
|---------|------|-------------|
| `GET` | `/api/recurring` | Alle Templates |
| `POST` | `/api/recurring` | Template anlegen |
| `POST` | `/api/recurring/{id}/trigger` | Rechnung jetzt generieren |
| `POST` | `/api/recurring/{id}/toggle` | Aktiv/Pausiert umschalten |
| `DELETE` | `/api/recurring/{id}` | Template löschen |

#### Export & Analytics
| Methode | Pfad | Beschreibung |
|---------|------|-------------|
| `GET` | `/api/export/datev` | DATEV-Export (`?format=buchungsstapel&kontenrahmen=SKR03`) |
| `GET` | `/api/analytics/summary` | Rechnungsvolumen, OCR-Rate, etc. |
| `GET` | `/api/health` | System-Status |

#### Externe API (v1)
| Methode | Pfad | Beschreibung |
|---------|------|-------------|
| `POST` | `/api/v1/validate` | XML direkt validieren (kein Login nötig) |
| `POST` | `/api/v1/invoices` | Rechnung über externe API anlegen |

### Beispiel: Rechnung erstellen und XML herunterladen

```bash
# 1. Rechnung anlegen
curl -X POST http://localhost:8001/api/invoices \
  -H "Content-Type: application/json" \
  -H "X-API-Key: dein-api-key" \
  -d '{
    "invoice_number": "RE-2026-001",
    "invoice_date": "2026-02-23",
    "due_date": "2026-03-23",
    "seller_name": "Muster GmbH",
    "seller_vat_id": "DE123456789",
    "seller_address": "Musterstraße 1, 60311 Frankfurt am Main",
    "buyer_name": "Kunde AG",
    "buyer_vat_id": "DE987654321",
    "buyer_address": "Kundenstraße 5, 10115 Berlin",
    "tax_rate": 19,
    "line_items": [
      {
        "description": "Softwareentwicklung",
        "quantity": 10,
        "unit_price": 150.00,
        "net_amount": 1500.00,
        "tax_rate": 19
      }
    ],
    "iban": "DE89370400440532013000",
    "bic": "COBADEFFXXX"
  }'
# → Gibt invoice_id zurück, z.B. "INV-20260223-abc12345"

# 2. XRechnung-XML generieren
curl -X POST http://localhost:8001/api/invoices/INV-20260223-abc12345/generate-xrechnung \
  -H "X-API-Key: dein-api-key"

# 3. XML herunterladen
curl -O http://localhost:8001/api/invoices/INV-20260223-abc12345/download-xrechnung \
  -H "X-API-Key: dein-api-key"
# → Speichert INV-20260223-abc12345_xrechnung.xml
```

### Beispiel: PDF per OCR verarbeiten

```bash
curl -X POST http://localhost:8001/api/upload-ocr \
  -H "X-API-Key: dein-api-key" \
  -F 'file=@/pfad/zur/rechnung.pdf'
# → Gibt invoice_id, confidence (0-100), field_confidences pro Feld zurück
```

---

## Tests

```bash
# Backend (174 Tests)
cd backend
python -m pytest tests/ -v

# Frontend (59 Tests)
cd frontend
npm test

# Mit Coverage
cd backend
python -m pytest tests/ --cov=app --cov-report=html
```

---

## Projektstruktur

```
rechnungswerk/
├── .github/
│   └── workflows/
│       └── ci.yml              # CI: pytest + Next.js build + lint (parallel)
├── backend/
│   ├── alembic/                # Datenbankmigrationen
│   │   └── versions/
│   ├── app/
│   │   ├── main.py             # FastAPI App + CORS + Router-Registrierung
│   │   ├── config.py           # Einstellungen (pydantic-settings)
│   │   ├── models.py           # SQLAlchemy ORM-Modelle
│   │   ├── schemas.py          # Pydantic Request/Response-Schemas
│   │   ├── database.py         # SQLAlchemy + SQLite/PostgreSQL
│   │   ├── auth.py             # API-Key-Authentifizierung
│   │   ├── xrechnung_generator.py  # XRechnung 3.0.2 UBL-XML
│   │   ├── zugferd_generator.py    # ZUGFeRD PDF/A-3 (factur-x)
│   │   ├── kosit_validator.py      # KoSIT Docker + lokaler Fallback
│   │   ├── ocr_pipeline.py         # OCR-Orchestrierung
│   │   ├── ollama_extractor.py     # Ollama LLM-Extraktion
│   │   ├── ocr/
│   │   │   ├── paddleocr_engine.py # PaddleOCR (primär)
│   │   │   ├── confidence.py       # Per-Feld-Confidence-Scoring
│   │   │   ├── batch_processor.py  # Batch-OCR
│   │   │   └── pipeline.py         # OCR-Orchestrierung
│   │   ├── ai/
│   │   │   └── categorizer.py      # SKR03/SKR04-Kategorisierung (Ollama)
│   │   ├── fraud/
│   │   │   └── detector.py         # Duplikat- und Betrugs-Erkennung
│   │   ├── export/
│   │   │   └── datev_export.py     # DATEV Buchungsstapel + CSV
│   │   ├── archive/
│   │   │   └── gobd_archive.py     # GoBD-konforme Archivierung
│   │   ├── recurring/
│   │   │   └── scheduler.py        # Termin-Berechnung für Dauervorlagen
│   │   └── routers/
│   │       ├── health.py
│   │       ├── invoices.py
│   │       ├── suppliers.py
│   │       ├── recurring.py
│   │       └── external_api.py     # Versionierte externe API (/api/v1/*)
│   ├── tests/
│   │   ├── conftest.py             # SQLite-TestClient (StaticPool)
│   │   ├── test_invoices_api.py
│   │   ├── test_xrechnung_generator.py
│   │   ├── test_ocr_pipeline.py
│   │   ├── test_schemas.py
│   │   ├── test_suppliers_api.py
│   │   ├── test_recurring_api.py
│   │   └── test_categorizer.py
│   ├── requirements.txt
│   ├── alembic.ini
│   └── .env.example
└── frontend/
    ├── app/
    │   ├── page.tsx            # Dashboard: KPIs + Schnellaktionen
    │   ├── ocr/                # KI-OCR Upload mit PDF-Vorschau
    │   ├── manual/             # Wizard-Eingabe (6 Schritte)
    │   ├── invoices/           # Rechnungsliste mit Filter und Bulk-Aktionen
    │   ├── validator/          # KoSIT-Validator UI (Rechnung + XML-Modus)
    │   ├── analytics/          # Volumen-Charts, Top-Lieferanten
    │   ├── suppliers/          # Lieferanten-Verwaltung
    │   └── recurring/          # Wiederkehrende Rechnungen
    ├── components/
    │   ├── design-system/      # ThemeProvider, Design-Tokens
    │   ├── layout/             # SidebarNav (einklappbar), PageWrapper
    │   └── ui/                 # Button, Card, Input, Modal, Badge, Progress, ...
    ├── __tests__/              # Vitest Unit-Tests (59 Tests)
    ├── lib/
    │   └── api.ts              # Axios-Client + alle TypeScript-Interfaces
    └── vitest.config.ts
```

---

## Tech Stack

| Schicht | Technologie |
|---------|-------------|
| Backend | Python 3.11 + FastAPI 0.115 |
| ORM | SQLAlchemy 2.0 + Alembic |
| Datenbank | SQLite (Dev) · PostgreSQL-ready (asyncpg) |
| OCR (primär) | PaddleOCR 2.8 + Ollama `qwen2.5:14b` |
| OCR (Fallback) | Tesseract 5.x + OpenCV |
| XML | lxml 5.3 (XRechnung UBL 2.1) |
| ZUGFeRD | factur-x 3.1 + WeasyPrint |
| Frontend | Next.js 15 + React 19 + TypeScript |
| Styling | Tailwind CSS v4 + Radix UI Primitives |
| Animationen | Framer Motion |
| Charts | Recharts |
| Testing | pytest 174 Tests · vitest 59 Tests |
| CI/CD | GitHub Actions (pytest + build + lint) |
| Entwickelt mit | Unterstützung von [Claude Code](https://claude.ai) |

---

## Häufige Probleme

**OCR liefert schlechte Ergebnisse**
→ Ollama installieren und `ollama pull qwen2.5:14b` ausführen. Ohne Ollama läuft nur Tesseract (60–80% Genauigkeit).

**`no such table: invoices`**
→ Datenbankmigrationen ausführen: `cd backend && alembic upgrade head`

**Frontend zeigt "Backend nicht erreichbar"**
→ Backend auf Port 8001 läuft? `REQUIRE_API_KEY=false` in `.env` gesetzt?

**KoSIT-Validator meldet Fehler**
→ Docker-Container prüfen: `docker ps | grep kosit`. Ohne Docker greift lokaler Fallback.

**PaddleOCR Installation schlägt fehl**
→ Auf macOS mit Apple Silicon: `pip install paddlepaddle-gpu` durch `pip install paddlepaddle` ersetzen.

---

## Roadmap

- [x] XRechnung 3.0.2 Generator
- [x] ZUGFeRD PDF/A-3
- [x] KoSIT-Validator UI
- [x] Batch-OCR
- [x] Lieferanten-Verwaltung
- [x] Wiederkehrende Rechnungen
- [x] DATEV-Export (SKR03/SKR04)
- [x] KI-Kategorisierung (Ollama, lokal)
- [x] Analytics-Dashboard
- [x] CI/CD Pipeline
- [ ] JWT-Authentifizierung (statt API-Key)
- [ ] PostgreSQL (statt SQLite)
- [ ] E-Mail-Eingang (IMAP → OCR-Pipeline)
- [ ] PEPPOL-Netzwerk-Anbindung
- [ ] Deployment: Render.com + Vercel

---

## Lizenz

MIT License — kostenlos für nicht-kommerzielle Nutzung.
Kommerzielle Nutzung: Autor kontaktieren.

## Autor

**Sadan Akbari** — Wirtschaftsinformatik-Student, Frankfurt UAS

[Portfolio](https://sadanakb.github.io) · [LinkedIn](https://www.linkedin.com/in/sadan-akbari) · [GitHub](https://github.com/sadanakb)
