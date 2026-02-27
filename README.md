<div align="center">

# RechnungsWerk

**Open-Source E-Invoicing fuer Deutschland -- XRechnung, ZUGFeRD, DATEV**

![License](https://img.shields.io/badge/Lizenz-AGPL--3.0-blue)
![Tests](https://img.shields.io/badge/Tests-214%2B%20bestanden-brightgreen)
![Build](https://img.shields.io/badge/Build-passing-brightgreen)
![XRechnung](https://img.shields.io/badge/XRechnung-3.0.2-blue)
![EN 16931](https://img.shields.io/badge/EN_16931-konform-green)
![ZUGFeRD](https://img.shields.io/badge/ZUGFeRD-2.3.3-blue)

[Schnellstart](#schnellstart) | [Features](#features) | [Self-Hosting](#self-hosting) | [API-Docs](#api-referenz) | [Contributing](CONTRIBUTING.md)

</div>

---

RechnungsWerk wandelt Papierrechnungen per KI-OCR in normkonforme XRechnung-XML um, generiert ZUGFeRD-PDFs und validiert gegen den offiziellen KoSIT-Validator. Gedacht als Open-Source-Alternative zu sevDesk, lexoffice & Co.

Die E-Rechnungspflicht betrifft ab 2025 jedes Unternehmen in Deutschland -- und die bestehenden Loesungen kosten 500-2.000 EUR/Monat. RechnungsWerk macht das kostenlos und selbst gehostet.

<!-- Add screenshots -->

---

## Features

| Modul | Beschreibung |
|-------|-------------|
| **KI-OCR** | PDF-Upload -- PaddleOCR + Ollama extrahieren alle Rechnungsfelder mit Per-Feld-Confidence |
| **XRechnung 3.0.2** | EN 16931-konformes UBL-XML, alle Pflichtfelder (BT-1 bis BT-112) |
| **ZUGFeRD 2.3.3** | XML wird in PDF/A-3 eingebettet (factur-x, Profil EXTENDED) |
| **DATEV-Export** | Buchungsstapel (ASCII) und CSV fuer SKR03/SKR04 |
| **Mahnwesen** | Automatische Faelligkeitsueberwachung und mehrstufige Mahnungen |
| **KI-Kategorisierung** | Ollama ordnet Rechnungen automatisch SKR03/SKR04-Konten zu |
| **GoBD-konform** | Revisionssichere Archivierung gemaess GoBD-Anforderungen |
| **KoSIT-Validator** | Validierung gegen offizielle Schematron-Regeln (Docker + lokaler Fallback) |
| **Betrugs-Erkennung** | Duplikat-Check, IBAN-Aenderungs-Warnung, Betrags-Anomalien |
| **Wiederkehrende Rechnungen** | Templates mit monatlicher/vierteljaehrlicher/jaehrlicher Ausloesung |
| **Batch-OCR** | Mehrere PDFs gleichzeitig hochladen und verarbeiten |
| **Analytics** | Monatliches Rechnungsvolumen, Top-Lieferanten, MwSt-Uebersicht |

---

## Schnellstart

### Mit Docker Compose (empfohlen)

```bash
git clone https://github.com/sadanakb/rechnungswerk.git && cd rechnungswerk
cp .env.production.example .env
docker compose up -d
```

Die App ist unter `http://localhost:3001` erreichbar, die API unter `http://localhost:8001/docs`.

### Manuell (Entwicklung)

```bash
# 1. Repository klonen
git clone https://github.com/sadanakb/rechnungswerk.git
cd rechnungswerk

# 2. Backend starten
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload

# 3. Frontend starten (neues Terminal)
cd frontend
npm install
npm run dev
```

Oeffne: http://localhost:3001 -- API-Docs: http://localhost:8001/docs

---

## Self-Hosting

Drei Schritte zum produktiven Betrieb:

### 1. Server vorbereiten

Mindestanforderungen: 2 vCPU, 4 GB RAM, 20 GB SSD. Docker und Docker Compose muessen installiert sein.

```bash
git clone https://github.com/sadanakb/rechnungswerk.git
cd rechnungswerk
```

### 2. Umgebungsvariablen konfigurieren

```bash
cp .env.production.example .env
```

Passe die `.env`-Datei an:
- `DB_PASSWORD` -- sicheres PostgreSQL-Passwort
- `API_KEY` -- API-Schluessel fuer Authentifizierung
- `ALLOWED_ORIGINS` -- deine Domain(s)
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` -- fuer Premium-Features (optional)

### 3. Starten

```bash
docker compose up -d
```

Die Infrastruktur (PostgreSQL 17, Redis 7, Backend, Frontend, Uptime Kuma) startet automatisch. Die App ist unter Port 3001, die API unter Port 8001 erreichbar.

---

## Tech Stack

| Schicht | Technologie |
|---------|-------------|
| Frontend | Next.js 16 + React 19 + TypeScript |
| Styling | Tailwind CSS v4 + Radix UI Primitives |
| Backend | Python 3.11 + FastAPI 0.115 |
| Datenbank | PostgreSQL 17 (Produktion) / SQLite (Entwicklung) |
| Cache | Redis 7 |
| ORM | SQLAlchemy 2.0 + Alembic |
| OCR | PaddleOCR 2.8 + Ollama (qwen2.5:14b) |
| XML | lxml 5.3 (XRechnung UBL 2.1) |
| ZUGFeRD | factur-x 3.1 + WeasyPrint |
| Charts | Recharts |
| Monitoring | Uptime Kuma |
| CI/CD | GitHub Actions (pytest + build + lint + security audit) |

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

Alle Endpunkte sind unter http://localhost:8001/docs (Swagger) vollstaendig dokumentiert.

### Authentifizierung

```bash
curl -H "X-API-Key: dein-api-key" http://localhost:8001/api/invoices
```

### Wichtigste Endpunkte

| Methode | Pfad | Beschreibung |
|---------|------|-------------|
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

---

## Tests

```bash
# Backend (174+ Tests)
cd backend && python -m pytest tests/ -v

# Frontend (40+ Tests)
cd frontend && npx vitest run

# Mit Coverage
cd backend && python -m pytest tests/ --cov=app --cov-report=html
```

---

## Projektstruktur

```
rechnungswerk/
├── .github/workflows/ci.yml    # CI: pytest + build + lint + security
├── backend/
│   ├── app/
│   │   ├── main.py             # FastAPI App
│   │   ├── xrechnung_generator.py
│   │   ├── zugferd_generator.py
│   │   ├── kosit_validator.py
│   │   ├── ocr/                # PaddleOCR + Batch
│   │   ├── ai/                 # KI-Kategorisierung
│   │   ├── fraud/              # Betrugs-Erkennung
│   │   ├── export/             # DATEV-Export
│   │   ├── archive/            # GoBD-Archivierung
│   │   └── routers/            # API-Endpunkte
│   └── tests/
├── frontend/
│   ├── app/                    # Next.js App Router
│   ├── components/             # UI-Komponenten
│   └── __tests__/              # Vitest Tests
├── docker-compose.yml          # Produktions-Setup
├── CONTRIBUTING.md
├── SECURITY.md
└── LICENSE
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
