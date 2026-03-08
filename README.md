<div align="center">

# RechnungsWerk

**Open-Source E-Invoicing fuer Deutschland -- XRechnung, ZUGFeRD, DATEV**

![Tests](https://github.com/sadanakb/rechnungswerk/actions/workflows/tests.yml/badge.svg)
![License](https://img.shields.io/badge/Lizenz-AGPL--3.0-blue)
![Build](https://img.shields.io/badge/Build-passing-brightgreen)
![XRechnung](https://img.shields.io/badge/XRechnung-3.0.2-blue)
![EN 16931](https://img.shields.io/badge/EN_16931-konform-green)
![ZUGFeRD](https://img.shields.io/badge/ZUGFeRD-2.3.3-blue)

[Schnellstart](#schnellstart) | [Features](#features) | [Self-Hosting](#self-hosting) | [API-Docs](#api-referenz) | [Contributing](CONTRIBUTING.md)

</div>

---

RechnungsWerk wandelt Papierrechnungen per OCR in normkonforme XRechnung-XML um, generiert ZUGFeRD-PDFs und validiert gegen den offiziellen KoSIT-Validator. Gedacht als Open-Source-Alternative zu sevDesk, lexoffice & Co.

> **Status: Aktive Entwicklung (Beta)** -- Kernfunktionen sind nutzbar, aber die Software befindet sich noch in aktiver Entwicklung. Self-Hosting ist der aktuelle Hauptmodus; eine gehostete SaaS-Version ist geplant.

Die E-Rechnungspflicht betrifft ab 2025 jedes Unternehmen in Deutschland. Die meisten bestehenden Loesungen wie sevDesk oder lexoffice kosten ab ca. 8-15 EUR/Monat, bieten aber oft nur eingeschraenkte E-Rechnungs-Unterstuetzung. RechnungsWerk ist Open Source und kann selbst gehostet werden (SaaS-Version in Planung).

---

## Schnellstart

### Ein Befehl (Entwicklung)

```bash
git clone https://github.com/sadanakb/rechnungswerk.git && cd rechnungswerk
make setup   # Installiert Backend + Frontend Dependencies
make dev     # Startet Backend (Port 8001) + Frontend (Port 3001)
```

Oeffne http://localhost:3001 -- API-Docs: http://localhost:8001/docs

### Mit Docker Compose (Produktion)

```bash
git clone https://github.com/sadanakb/rechnungswerk.git && cd rechnungswerk
cp .env.production.example .env
# .env anpassen: DB_PASSWORD, JWT_SECRET_KEY, ALLOWED_ORIGINS
docker compose up -d
```

---

## Features

### E-Rechnung

| Modul | Beschreibung |
|-------|-------------|
| **KI-OCR** | PDF-Upload -- Surya OCR + PaddleOCR Fallback mit Per-Feld-Confidence |
| **XRechnung 3.0.2** | EN 16931-konformes UBL-XML, alle Pflichtfelder (BT-1 bis BT-112) |
| **ZUGFeRD 2.3.3** | XML wird in PDF/A-3 eingebettet (factur-x, Profil EXTENDED) |
| **KoSIT-Validator** | Validierung gegen offizielle Schematron-Regeln (Docker + lokaler Fallback) |
| **Batch-OCR** | Bis zu 20 PDFs gleichzeitig hochladen und verarbeiten |

### Buchhaltung & Compliance

| Modul | Beschreibung |
|-------|-------------|
| **DATEV-Export** | Buchungsstapel (ASCII) und CSV fuer SKR03/SKR04 |
| **KI-Kategorisierung** | Ollama ordnet Rechnungen automatisch SKR03/SKR04-Konten zu |
| **Mahnwesen** | Automatische Faelligkeitsueberwachung und mehrstufige Mahnungen |
| **GoBD-konform** | Revisionssichere Archivierung gemaess GoBD-Anforderungen |
| **Betrugs-Erkennung** | Duplikat-Check, IBAN-Aenderungs-Warnung, Betrags-Anomalien |

### Verwaltung & Zusammenarbeit

| Modul | Beschreibung |
|-------|-------------|
| **Multi-Tenant** | Organisationen mit Rollen (Owner, Admin, Member) |
| **Team-Management** | Einladungen per E-Mail, Rollenverwaltung |
| **Wiederkehrende Rechnungen** | Templates mit monatlicher/vierteljaehrlicher/jaehrlicher Ausloesung |
| **Kundenportal** | Kunden koennen Rechnungen per Link einsehen und Zahlung bestaetigen |
| **Analytics** | Monatliches Rechnungsvolumen, Top-Lieferanten, MwSt-Uebersicht |
| **Webhooks** | Event-basierte Benachrichtigungen (invoice.created, validated, ...) |
| **Audit-Log** | Alle Aktionen nachvollziehbar protokolliert |
| **GDPR** | Datenexport (Art. 20) und Account-Loeschung (Art. 17) |
| **CSV-Import** | Bulk-Import von Rechnungen aus CSV-Dateien |
| **Stripe-Billing** | Integrierte Abrechnung (Free, Starter, Professional) |

---

## Self-Hosting

### Voraussetzungen

- **Minimum:** 2 vCPU, 4 GB RAM, 20 GB SSD
- **Software:** Docker + Docker Compose

### Konfiguration

```bash
git clone https://github.com/sadanakb/rechnungswerk.git && cd rechnungswerk
cp .env.production.example .env
```

Passe die `.env`-Datei an:

| Variable | Pflicht | Beschreibung |
|----------|---------|-------------|
| `DB_PASSWORD` | Ja | Sicheres PostgreSQL-Passwort |
| `JWT_SECRET_KEY` | Ja | Token-Signatur (`openssl rand -hex 64`) |
| `ALLOWED_ORIGINS` | Ja | Deine Domain(s) als JSON-Array |
| `BREVO_API_KEY` | Nein | E-Mail-Versand (Passwort-Reset, Einladungen) |
| `STRIPE_SECRET_KEY` | Nein | Premium-Features / Billing |
| `ANTHROPIC_API_KEY` | Nein | KI-Kategorisierung (Ollama als Fallback) |

### Starten

```bash
docker compose up -d
```

Startet automatisch: PostgreSQL 17, Redis 7, Backend, Frontend, Uptime Kuma.

| Service | Port | URL |
|---------|------|-----|
| Frontend | 3001 | http://localhost:3001 |
| Backend API | 8001 | http://localhost:8001/api |
| Monitoring | 3002 | http://localhost:3002 |

---

## Tech Stack

| Schicht | Technologie |
|---------|-------------|
| Frontend | Next.js 16 + React 19 + TypeScript 5 |
| Styling | Tailwind CSS v4 + Radix UI + Shadcn/ui |
| Backend | Python 3.11+ + FastAPI 0.133 |
| Datenbank | PostgreSQL 17 (Produktion) / SQLite (Entwicklung) |
| Cache/Queue | Redis 7 + ARQ |
| ORM | SQLAlchemy 2.0 + Alembic |
| OCR | Surya OCR + PaddleOCR (Fallback) |
| KI | Ollama / Anthropic / Mistral (konfigurierbar) |
| XML | lxml 5.3 (XRechnung UBL 2.1) |
| ZUGFeRD | factur-x 3.1 + WeasyPrint |
| Payments | Stripe |
| E-Mail | Brevo (ehem. Sendinblue) |
| Monitoring | Uptime Kuma |
| CI/CD | GitHub Actions (pytest + build + lint + security audit) |

---

## Entwicklung

### Voraussetzungen

- Python 3.11+ (empfohlen: 3.13)
- Node.js 20+
- make (auf macOS/Linux vorinstalliert)

### Setup & Start

```bash
make setup   # Backend venv + pip install + Frontend npm install
make dev     # Startet beides parallel
```

### Einzelne Befehle

```bash
make backend    # Nur Backend starten
make frontend   # Nur Frontend starten
make test       # Alle Tests ausfuehren
make lint       # Linter ausfuehren
make build      # Frontend-Produktionsbuild
make help       # Alle verfuegbaren Befehle
```

### Manuell (ohne Make)

```bash
# Backend
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload

# Frontend (neues Terminal)
cd frontend
npm install
npm run dev
```

---

## Rechtliche Grundlage

| Datum | Pflicht |
|-------|---------|
| seit 2020 | XRechnung fuer B2G (Behoerden) Pflicht |
| 01.01.2025 | Alle B2B-Unternehmen muessen XRechnung **empfangen** koennen |
| 01.01.2027 | Unternehmen > 800.000 EUR Umsatz muessen XRechnung **senden** |
| 01.01.2028 | **Alle** Unternehmen muessen XRechnung senden |

---

## API-Referenz

Interaktive Swagger-Docs unter http://localhost:8001/docs (nur im Debug-Modus).

### Authentifizierung

```bash
# JWT Token holen
TOKEN=$(curl -s -X POST http://localhost:8001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"..."}' | jq -r .access_token)

# Authentifizierter API-Aufruf
curl -H "Authorization: Bearer $TOKEN" http://localhost:8001/api/invoices
```

### Wichtigste Endpunkte

| Methode | Pfad | Beschreibung |
|---------|------|-------------|
| `POST` | `/api/auth/register` | Benutzer registrieren |
| `POST` | `/api/auth/login` | JWT Token erhalten |
| `POST` | `/api/upload-ocr` | PDF per OCR verarbeiten |
| `POST` | `/api/upload-ocr-batch` | Mehrere PDFs als Batch |
| `POST` | `/api/invoices` | Rechnung manuell anlegen |
| `GET` | `/api/invoices` | Alle Rechnungen (paginiert) |
| `POST` | `/api/invoices/{id}/generate-xrechnung` | XRechnung-XML generieren |
| `POST` | `/api/invoices/{id}/generate-zugferd` | ZUGFeRD-PDF generieren |
| `POST` | `/api/invoices/{id}/validate` | Gegen KoSIT validieren |
| `POST` | `/api/invoices/{id}/categorize` | KI-Kategorisierung |
| `GET` | `/api/export/datev` | DATEV-Export |
| `GET` | `/api/analytics/summary` | Analytics-Zusammenfassung |
| `GET` | `/api/health/live` | Liveness-Check |
| `GET` | `/api/health/ready` | Readiness-Check |

---

## Tests

```bash
# Alle Tests (Backend + Frontend)
make test

# Einzeln
make test-backend    # Backend-Tests (pytest)
make test-frontend   # 77+ Frontend-Tests (vitest)

# Mit Coverage
cd backend && python -m pytest tests/ --cov=app --cov-report=html
```

---

## Projektstruktur

```
rechnungswerk/
├── Makefile                        # make dev / make test / make setup
├── docker-compose.yml              # Produktions-Setup (5 Services)
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI App + WebSocket
│   │   ├── auth_jwt.py             # JWT + bcrypt_sha256
│   │   ├── xrechnung_generator.py  # XRechnung 3.0.2 UBL-XML
│   │   ├── zugferd_generator.py    # ZUGFeRD PDF/A-3
│   │   ├── kosit_validator.py      # KoSIT Schematron-Validierung
│   │   ├── ocr/                    # Surya + PaddleOCR
│   │   ├── ai/                     # KI-Kategorisierung (SKR03/04)
│   │   ├── fraud/                  # Betrugs-Erkennung
│   │   ├── export/                 # DATEV-Export
│   │   ├── archive/                # GoBD-Archivierung
│   │   └── routers/                # 24+ API-Router
│   ├── tests/                      # pytest Tests
│   └── Dockerfile
├── frontend/
│   ├── app/                        # Next.js App Router
│   │   ├── (dashboard)/            # Geschuetzter Bereich
│   │   └── (marketing)/            # Oeffentliche Seiten
│   ├── components/                 # Shadcn/ui + Custom
│   ├── __tests__/                  # Vitest Unit-Tests
│   ├── e2e/                        # Playwright E2E-Tests
│   └── Dockerfile
├── CONTRIBUTING.md
├── SECURITY.md
└── LICENSE                         # AGPL-3.0
```

---

## Mitmachen

Beitraege sind willkommen! Lies die [CONTRIBUTING.md](CONTRIBUTING.md) fuer Details.

1. Fork das Repository
2. Erstelle einen Feature Branch (`git checkout -b feature/mein-feature`)
3. Committe deine Aenderungen (`git commit -m 'feat: beschreibung'`)
4. Oeffne einen Pull Request

---

## Lizenz

Dieses Projekt steht unter der **AGPL-3.0 Lizenz** -- siehe [LICENSE](LICENSE) fuer Details.

**Cloud-Premium:** Die gehostete Version unter [rechnungswerk.de](https://rechnungswerk.de) bietet zusaetzliche Premium-Features (erweiterte Analytics, Priority Support, SLA) als kostenpflichtiges Abonnement. Der gesamte Open-Source-Kern bleibt frei verfuegbar.

---

## Autor

**Sadan Akbari** -- Wirtschaftsinformatik-Student, Frankfurt UAS

[Portfolio](https://sadanakb.github.io) | [LinkedIn](https://www.linkedin.com/in/sadan-akbari) | [GitHub](https://github.com/sadanakb)
