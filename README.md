# RechnungsWerk

**E-Invoice OCR & XRechnung 3.0.2 Generator — Convert paper invoices to XRechnung-compliant UBL XML**

![Status](https://img.shields.io/badge/status-MVP%20Complete-brightgreen)
![XRechnung](https://img.shields.io/badge/XRechnung-3.0.2-blue)
![Tech](https://img.shields.io/badge/tech-FastAPI%20%2B%20Tesseract%20OCR-blue)
![License](https://img.shields.io/badge/license-MIT-yellow)

## Live Demo

- **Frontend:** http://localhost:3001
- **API Docs (Swagger):** http://localhost:8001/docs
- **Health Check:** http://localhost:8001/api/health

---

## The Problem

Germany mandates e-invoicing (XRechnung / ZUGFeRD) for B2G since 2020.
Since **01.01.2025** all B2B companies must be **able to receive** XRechnung.
From **01.01.2027** companies with turnover > 800,000 EUR must send XRechnung.
From **01.01.2028** every company is required to send XRechnung.

Existing solutions cost EUR 500–2,000/month. There is no open-source alternative with
full German compliance. RechnungsWerk fills this gap.

---

## XRechnung 3.0.2 (Release 31.01.2026)

XRechnung 3.0.2 is the **current standard** for electronic invoices in Germany.
It is based on **EN 16931** (European e-invoicing standard) and specifies a CIUS
(Core Invoice Usage Specification) on top of it.

### Key changes vs. 2.3

| Change | Details |
|--------|---------|
| BT-31 mandatory | Seller tax registration identifier (USt-IdNr.) is now strictly required |
| PDF/A-3 extended | Better support for embedded XML in PDF/A-3 (ZUGFeRD) |
| CII deprecation notice | Cross Industry Invoice (CII) format deprecated from 01.01.2027; only UBL going forward |
| Schematron 3.0.2 | New validation rules via KoSIT Validator v1.6.0 |

### Mandatory Business Terms (BT)

| BT | Name | Description |
|----|------|-------------|
| BT-1 | Invoice Number | Unique identifier |
| BT-2 | Invoice Issue Date | `YYYY-MM-DD` |
| BT-3 | Invoice Type Code | Always `380` (commercial invoice) |
| BT-5 | Invoice Currency Code | Always `EUR` |
| BT-9 | Due Date | Payment due date (optional) |
| BT-27 | Seller Name | Seller company name |
| BT-31 | Seller VAT Identifier | German format: `DE123456789` — **NEW MANDATORY in 3.0.2** |
| BT-35 | Seller Street | Parsed from free-text address |
| BT-37 | Seller City | Parsed from free-text address |
| BT-38 | Seller Post Code | Parsed from free-text address |
| BT-44 | Buyer Name | Buyer company name |
| BT-48 | Buyer VAT Identifier | Optional |
| BT-109 | Tax Exclusive Amount | Sum of net line amounts |
| BT-110 | Total VAT Amount | |
| BT-112 | Payable Amount | Gross (net + VAT) |

---

## Features (MVP)

- **Modus A: OCR Upload** — Upload PDF invoice, Tesseract OCR extracts text, regex pipeline
  parses all BT fields. Fields are shown and editable before XML generation.
- **Modus B: Manual Entry** — Fill all BT fields directly. Live net/tax/gross calculation
  updates as you type. Supports multiple line items.
- **Modus C: Invoice List** — Table view of all invoices with status badges, source indicator,
  and direct XML download button per invoice.
- **Modus D: KoSIT Validator** — (Coming soon) Validate XML against XRechnung 3.0.2 Schematron.
- **XRechnung UBL XML Generator** — Produces EN 16931-compliant UBL 2.1 XML including:
  address parsing (street/ZIP/city), ItemClassifiedTaxCategory per line, PartyLegalEntity.
- **Download Endpoint** — `GET /api/invoices/{id}/download-xrechnung` returns the XML as
  `application/xml` with `Content-Disposition: attachment`.
- **Health Endpoint** — Reports Tesseract version, KoSIT status, DB connection, invoice count.

---

## Tech Stack

| Component | Technology | Version |
|-----------|------------|---------|
| Backend | Python + FastAPI | 3.12 / 0.115.0 |
| OCR | Tesseract | 5.x (via Homebrew) |
| Image Processing | OpenCV + Pillow | 4.11 / 11.1 |
| XML Generation | lxml | 5.3.0 |
| ZUGFeRD | factur-x | 3.1.0 |
| Database | SQLite (ORM: SQLAlchemy) | 2.0.36 |
| Frontend | Next.js 16 + Tailwind CSS v4 | React 19 |
| Hosting (planned) | Render.com + Vercel | Free tier |

---

## Getting Started

### 1. Prerequisites

- Python 3.12+
- Node.js 20+
- **Tesseract OCR 5.x** (required for Modus A)

### 2. Install Tesseract

```bash
# macOS (Homebrew)
brew install tesseract tesseract-lang
# Installs Tesseract 5.x + all language packs including German (deu)

# Ubuntu / Debian
sudo apt-get install tesseract-ocr tesseract-ocr-deu

# Windows
# Download installer from: https://github.com/UB-Mannheim/tesseract/wiki
# Add to PATH manually
```

Verify:
```bash
tesseract --version
# Expected: tesseract 5.x.x
tesseract --list-langs | grep deu
# Expected: deu
```

### 3. Backend Setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Start server
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

Backend: http://localhost:8001
Swagger: http://localhost:8001/docs

### 4. Frontend Setup

```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:3001
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check: DB, Tesseract, KoSIT, invoice count |
| `POST` | `/api/upload-ocr` | Upload PDF for OCR processing (multipart/form-data) |
| `POST` | `/api/invoices` | Create invoice manually (JSON) |
| `GET` | `/api/invoices` | List all invoices (supports `?skip=0&limit=50`) |
| `GET` | `/api/invoices/{id}` | Get single invoice by ID |
| `POST` | `/api/invoices/{id}/generate-xrechnung` | Generate XRechnung UBL XML |
| `GET` | `/api/invoices/{id}/download-xrechnung` | **Download XML file** (`application/xml`) |

### Example: Create + Generate

```bash
# 1. Create invoice
curl -X POST http://localhost:8001/api/invoices \
  -H "Content-Type: application/json" \
  -d '{
    "invoice_number": "RE-2026-001",
    "invoice_date": "2026-02-19",
    "due_date": "2026-03-19",
    "seller_name": "Muster GmbH",
    "seller_vat_id": "DE123456789",
    "seller_address": "Musterstraße 1, 60311 Frankfurt am Main",
    "buyer_name": "Kunde AG",
    "buyer_vat_id": "DE987654321",
    "buyer_address": "Kundenstraße 5, 10115 Berlin",
    "tax_rate": 19.0,
    "line_items": [
      {
        "description": "Softwareentwicklung",
        "quantity": 10,
        "unit_price": 150.00,
        "net_amount": 1500.00,
        "tax_rate": 19.0
      }
    ]
  }'

# 2. Generate XML (use invoice_id from step 1)
curl -X POST http://localhost:8001/api/invoices/INV-20260219-abc123/generate-xrechnung

# 3. Download XML
curl -O http://localhost:8001/api/invoices/INV-20260219-abc123/download-xrechnung
# -> saves INV-20260219-abc123_xrechnung.xml
```

### Example: OCR Upload

```bash
curl -X POST http://localhost:8001/api/upload-ocr \
  -F 'file=@/path/to/rechnung.pdf'
# Returns: invoice_id, extracted_text, confidence, fields, suggestions
```

### Health Check Response

```json
{
  "status": "healthy",
  "database": "connected",
  "tesseract_installed": true,
  "tesseract_version": "tesseract 5.3.4",
  "kosit_validator": "not_running",
  "total_invoices": 12,
  "xrechnung_version": "3.0.2"
}
```

---

## KoSIT Validator (optional)

The KoSIT Validator validates XRechnung XML against the official 3.0.2 Schematron rules.

```bash
# Start via Docker
docker pull kositvalidator/validator:v1.6.0
docker run -p 8080:8080 kositvalidator/validator:v1.6.0

# Validate
curl -X POST http://localhost:8080/validate \
  -F 'file=@invoice.xml' \
  -F 'scenario=xrechnung-3.0.2'
```

---

## Project Structure

```
rechnungswerk/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI app + CORS
│   │   ├── config.py                # Settings (Pydantic BaseSettings)
│   │   ├── database.py              # SQLAlchemy + SQLite
│   │   ├── models.py                # Invoice, UploadLog, ValidationResult
│   │   ├── schemas.py               # Pydantic request/response schemas
│   │   ├── ocr_pipeline.py          # Tesseract OCR + OpenCV preprocessing
│   │   ├── xrechnung_generator.py   # XRechnung 3.0.2 UBL XML generator
│   │   └── routers/
│   │       ├── health.py            # GET /api/health
│   │       └── invoices.py          # All invoice endpoints incl. download
│   ├── data/
│   │   ├── rechnungswerk.db         # SQLite DB (git-ignored)
│   │   └── xml_output/              # Generated XML files (git-ignored)
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── app/
    │   ├── layout.tsx               # Root layout: Inter font + persistent nav
    │   ├── page.tsx                 # Dashboard: mode cards + backend status
    │   ├── ocr/page.tsx             # Modus A: OCR + editable field preview
    │   ├── manual/page.tsx          # Modus B: form with live totals
    │   └── invoices/page.tsx        # Modus C: invoice table + XML download
    └── lib/
        └── api.ts                   # Axios client + typed API functions
```

---

## Roadmap

- [ ] ZUGFeRD PDF/A-3 generator (factur-x)
- [ ] KoSIT Validator UI (Modus D)
- [ ] Batch OCR processing (multiple PDFs)
- [ ] XRechnung HTML visualizer (XSLT)
- [ ] Deployment: Render.com (backend) + Vercel (frontend)
- [ ] API authentication (Supabase Auth)
- [ ] Template library for common invoice formats

---

## License

MIT License — Open Source for Non-Commercial use.
Commercial use: contact the author.

## Author

**Sadan** — Wirtschaftsinformatik Student
Built with Claude Code Max · February 2026
