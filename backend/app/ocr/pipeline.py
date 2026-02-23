"""
OCR Pipeline V2 — Orchestrates Digital-PDF-Check + PaddleOCR + Ollama + Confidence Scoring.

Flow:
  0. pdfplumber checks for embedded text (fast path for digital PDFs — 70-80% of invoices)
  1. If no embedded text: PaddleOCR extracts text from all PDF pages (scanned PDFs)
  2. Ollama (qwen2.5:14b) extracts structured fields from text
  3. If scanned PDF (no text): Ollama Vision (qwen2-vl:7b) analyzes image
  4. Confidence scorer validates each field
  5. Returns enriched result with per-field confidence
"""
import logging
from typing import Dict, Optional

from app.ocr.paddleocr_engine import PaddleOCREngine, OCRDocumentResult
from app.ocr.confidence import ConfidenceScorer

logger = logging.getLogger(__name__)

# Ollama model configuration
OLLAMA_TEXT_MODEL = "qwen2.5:14b"
OLLAMA_VISION_MODEL = "qwen2-vl:7b"

# Structured JSON schema for Ollama output
_EXTRACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "invoice_number": {"type": "string"},
        "invoice_date": {"type": "string", "description": "ISO format YYYY-MM-DD"},
        "due_date": {"type": "string", "description": "ISO format YYYY-MM-DD"},
        "seller_name": {"type": "string"},
        "seller_vat_id": {"type": "string", "description": "e.g. DE123456789"},
        "seller_address": {"type": "string"},
        "seller_endpoint_id": {"type": "string", "description": "E-Mail"},
        "buyer_name": {"type": "string"},
        "buyer_vat_id": {"type": "string"},
        "buyer_address": {"type": "string"},
        "buyer_reference": {"type": "string"},
        "buyer_endpoint_id": {"type": "string"},
        "iban": {"type": "string"},
        "bic": {"type": "string"},
        "payment_account_name": {"type": "string"},
        "net_amount": {"type": "number"},
        "tax_rate": {"type": "number"},
        "tax_amount": {"type": "number"},
        "gross_amount": {"type": "number"},
        "currency": {"type": "string", "default": "EUR"},
        "line_items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "description": {"type": "string"},
                    "quantity": {"type": "number"},
                    "unit_price": {"type": "number"},
                    "net_amount": {"type": "number"},
                    "tax_rate": {"type": "number"},
                },
            },
        },
    },
}

_TEXT_PROMPT = """\
Du bist ein Experte fuer deutsche Rechnungen und E-Invoicing (XRechnung / ZUGFeRD).

Analysiere den folgenden Rechnungstext und extrahiere ALLE Felder praezise.
Regeln:
- Datumsformat: YYYY-MM-DD (z.B. 2026-02-23)
- IBAN: ohne Leerzeichen, Grossbuchstaben (z.B. DE89370400440532013000)
- USt-IdNr: z.B. DE123456789
- Betraege: als Dezimalzahlen mit Punkt (z.B. 1234.56, NICHT 1.234,56)
- Wenn ein Feld nicht gefunden wird: null verwenden
- Line Items: Jede Rechnungsposition als separates Objekt im Array
- Berechne net_amount pro Line Item: quantity * unit_price

Beispiel-Extraktion (zeigt das erwartete Format):

EINGABE-TEXT:
Musterfirma GmbH | Musterstraße 1 | 60311 Frankfurt | USt-IdNr: DE123456789
Rechnung Nr. RE-2026-042 vom 15.02.2026 | Faellig: 01.03.2026
An: Beispiel AG, Hauptstraße 5, 10115 Berlin, DE987654321
Pos. 1: Beratungsleistung Februar, 8 Std. à 150,00 EUR = 1.200,00 EUR
Pos. 2: Reisekosten pauschal = 95,00 EUR
Netto: 1.295,00 EUR | 19% MwSt: 246,05 EUR | Brutto: 1.541,05 EUR
Zahlung: IBAN DE89370400440532013000 | BIC COBADEFFXXX | Kontoinhaber: Musterfirma GmbH

AUSGABE-JSON:
{{"invoice_number": "RE-2026-042", "invoice_date": "2026-02-15", "due_date": "2026-03-01",
  "seller_name": "Musterfirma GmbH", "seller_vat_id": "DE123456789",
  "seller_address": "Musterstra\u00dfe 1, 60311 Frankfurt",
  "seller_endpoint_id": null,
  "buyer_name": "Beispiel AG", "buyer_vat_id": "DE987654321",
  "buyer_address": "Hauptstra\u00dfe 5, 10115 Berlin",
  "buyer_reference": null, "buyer_endpoint_id": null,
  "iban": "DE89370400440532013000", "bic": "COBADEFFXXX",
  "payment_account_name": "Musterfirma GmbH",
  "net_amount": 1295.00, "tax_rate": 19.0, "tax_amount": 246.05, "gross_amount": 1541.05,
  "currency": "EUR",
  "line_items": [
    {{"description": "Beratungsleistung Februar", "quantity": 8.0, "unit_price": 150.00, "net_amount": 1200.00, "tax_rate": 19.0}},
    {{"description": "Reisekosten pauschal", "quantity": 1.0, "unit_price": 95.00, "net_amount": 95.00, "tax_rate": 19.0}}
  ]}}

Jetzt extrahiere aus dem folgenden Rechnungstext:
---
{text}
---

Extrahiere die Felder als JSON."""

_VISION_PROMPT = """\
Du bist ein Experte fuer deutsche Rechnungen und E-Invoicing (XRechnung / ZUGFeRD).

Analysiere dieses Rechnungsbild und extrahiere ALLE Felder praezise.
Regeln:
- Datumsformat: YYYY-MM-DD
- IBAN: ohne Leerzeichen, Grossbuchstaben
- USt-IdNr: z.B. DE123456789
- Betraege: als Dezimalzahlen (z.B. 1234.56)
- Wenn ein Feld nicht gefunden wird: null verwenden
- Line Items: Jede Rechnungsposition als separates Objekt im Array

Extrahiere die Felder als JSON."""


class OCRPipelineV2:
    """
    Orchestrates: Digital-PDF-Check -> PaddleOCR -> Ollama (JSON) -> Confidence -> Result.

    Fast path: 70-80% of German invoices are digital PDFs (lexoffice, sevDesk, SAP).
    pdfplumber extracts text at 100% accuracy — no OCR needed.
    """

    def __init__(self):
        self.ocr_engine = PaddleOCREngine()
        self.confidence_scorer = ConfidenceScorer()

    def _extract_digital_text(self, pdf_path: str) -> str:
        """Extract embedded text from digital PDFs using pdfplumber (no OCR needed)."""
        try:
            import pdfplumber
            with pdfplumber.open(pdf_path) as pdf:
                pages = []
                for i, page in enumerate(pdf.pages):
                    text = page.extract_text() or ""
                    tables = page.extract_tables()
                    if tables:
                        for table in tables:
                            for row in table:
                                if row:
                                    text += "\n" + " | ".join(str(c) if c else "" for c in row)
                    if text.strip():
                        pages.append(f"--- Seite {i+1} ---\n{text}")
                return "\n\n".join(pages)
        except Exception as e:
            logger.debug("pdfplumber digital-text extraction failed: %s", e)
        return ""

    def _count_pages(self, pdf_path: str) -> int:
        """Count PDF pages without full extraction."""
        try:
            import pdfplumber
            with pdfplumber.open(pdf_path) as pdf:
                return len(pdf.pages)
        except Exception:
            return 1

    def process(self, pdf_path: str) -> Dict:
        """
        Process a PDF through the full OCR pipeline.

        Fast path: digital PDFs bypass PaddleOCR entirely (pdfplumber → Ollama).
        Slow path: scanned PDFs use PaddleOCR → Ollama Vision.

        Returns:
            {
                "fields": dict,
                "confidence": float,
                "field_confidences": dict,
                "consistency_checks": list,
                "source": str,
                "raw_text": str,
                "total_pages": int,
                "ocr_engine": str,
            }
        """
        # Step 0: Digital PDF fast path — skip OCR entirely for embedded-text PDFs
        pdf_text = self._extract_digital_text(pdf_path)
        if pdf_text and len(pdf_text.strip()) > 100:
            logger.info(
                "Pipeline V2: Digital PDF detected (%d chars) — skipping OCR for '%s'",
                len(pdf_text), pdf_path,
            )
            fields, source = self._extract_with_text_model(pdf_text)
            if fields:
                scoring = self.confidence_scorer.score(fields)
                logger.info(
                    "Pipeline V2 complete (digital): source=%s, confidence=%.1f%%",
                    source, scoring["overall_confidence"],
                )
                return {
                    "fields": fields,
                    "confidence": scoring["overall_confidence"],
                    "field_confidences": scoring["field_confidences"],
                    "consistency_checks": scoring["consistency_checks"],
                    "completeness": scoring["completeness"],
                    "source": f"digital-{source}",
                    "raw_text": pdf_text[:2000],
                    "total_pages": self._count_pages(pdf_path),
                    "ocr_engine": "pdfplumber",
                }

        # Step 1: OCR text extraction (PaddleOCR with Tesseract fallback)
        logger.info("Pipeline V2: Scanned PDF — starting OCR for '%s'", pdf_path)
        ocr_result = self.ocr_engine.extract_from_pdf(pdf_path)

        # Step 2: LLM field extraction
        fields = {}
        source = "unknown"
        raw_text = ocr_result.full_text

        if ocr_result.full_text and len(ocr_result.full_text.strip()) > 50:
            # Text extraction succeeded — use text model
            fields, source = self._extract_with_text_model(ocr_result.full_text)

        if not fields:
            # Scanned PDF or text extraction failed — try vision model
            fields, source = self._extract_with_vision_model(pdf_path)

        if not fields:
            # All LLM extraction failed — return OCR-only result
            logger.warning("All LLM extraction failed for '%s'", pdf_path)
            return {
                "fields": {},
                "confidence": ocr_result.avg_confidence,
                "field_confidences": {},
                "consistency_checks": [],
                "source": f"{ocr_result.engine}-only",
                "raw_text": raw_text,
                "total_pages": ocr_result.total_pages,
                "ocr_engine": ocr_result.engine,
            }

        # Step 3: Confidence scoring
        scoring = self.confidence_scorer.score(fields)

        logger.info(
            "Pipeline V2 complete: source=%s, confidence=%.1f%%, completeness=%.1f%%",
            source, scoring["overall_confidence"], scoring["completeness"],
        )

        return {
            "fields": fields,
            "confidence": scoring["overall_confidence"],
            "field_confidences": scoring["field_confidences"],
            "consistency_checks": scoring["consistency_checks"],
            "completeness": scoring["completeness"],
            "source": source,
            "raw_text": raw_text,
            "total_pages": ocr_result.total_pages,
            "ocr_engine": ocr_result.engine,
        }

    def _extract_with_text_model(self, text: str) -> tuple:
        """Extract fields using Ollama text model with structured JSON output."""
        try:
            import ollama
            import json

            prompt = _TEXT_PROMPT.format(text=text[:12000])

            logger.info("Ollama text extraction (%s)", OLLAMA_TEXT_MODEL)
            response = ollama.chat(
                model=OLLAMA_TEXT_MODEL,
                messages=[{"role": "user", "content": prompt}],
                format="json",
                options={"temperature": 0.05, "num_predict": 4096},
            )

            raw = response.message.content
            fields = json.loads(raw)
            if isinstance(fields, dict) and len(fields) > 0:
                fields = self._normalize_fields(fields)
                return fields, f"ollama-text-{OLLAMA_TEXT_MODEL}"

        except ImportError:
            logger.warning("ollama package not installed")
        except Exception as e:
            logger.warning("Ollama text extraction failed: %s", e)

        return {}, ""

    def _extract_with_vision_model(self, pdf_path: str) -> tuple:
        """Extract fields using Ollama vision model."""
        try:
            import ollama
            import json
            import base64
            import tempfile
            import os
            from pdf2image import convert_from_path

            # Convert first page to PNG
            images = convert_from_path(pdf_path, first_page=1, last_page=1, dpi=200)
            if not images:
                return {}, ""

            fd, img_path = tempfile.mkstemp(suffix=".png", prefix="rw_vision_")
            os.close(fd)
            try:
                images[0].save(img_path, format="PNG")
                with open(img_path, "rb") as fh:
                    b64 = base64.b64encode(fh.read()).decode()
            finally:
                os.unlink(img_path)

            logger.info("Ollama vision extraction (%s)", OLLAMA_VISION_MODEL)
            response = ollama.chat(
                model=OLLAMA_VISION_MODEL,
                messages=[{
                    "role": "user",
                    "content": _VISION_PROMPT,
                    "images": [b64],
                }],
                format="json",
                options={"temperature": 0.05, "num_predict": 4096},
            )

            raw = response.message.content
            fields = json.loads(raw)
            if isinstance(fields, dict) and len(fields) > 0:
                fields = self._normalize_fields(fields)
                return fields, f"ollama-vision-{OLLAMA_VISION_MODEL}"

        except ImportError:
            logger.warning("ollama package not installed")
        except Exception as e:
            logger.warning("Ollama vision extraction failed: %s", e)

        return {}, ""

    def _normalize_fields(self, fields: Dict) -> Dict:
        """Normalize extracted fields to expected format."""
        # Convert German number format to float
        for amount_field in ["net_amount", "tax_amount", "gross_amount"]:
            val = fields.get(amount_field)
            if isinstance(val, str):
                try:
                    val = val.replace(".", "").replace(",", ".").strip()
                    fields[amount_field] = float(val)
                except (ValueError, AttributeError):
                    fields[amount_field] = 0.0

        # Normalize tax_rate
        tax_rate = fields.get("tax_rate")
        if isinstance(tax_rate, str):
            try:
                fields["tax_rate"] = float(tax_rate.replace("%", "").strip())
            except (ValueError, AttributeError):
                fields["tax_rate"] = 19.0

        # Normalize IBAN (remove spaces)
        iban = fields.get("iban")
        if isinstance(iban, str):
            fields["iban"] = iban.replace(" ", "").upper()

        # Normalize line items
        line_items = fields.get("line_items")
        if isinstance(line_items, list):
            normalized_items = []
            for item in line_items:
                if isinstance(item, dict):
                    norm_item = {
                        "description": str(item.get("description", "Leistung")),
                        "quantity": float(item.get("quantity", 1) or 1),
                        "unit_price": float(item.get("unit_price", 0) or 0),
                    }
                    norm_item["net_amount"] = round(
                        norm_item["quantity"] * norm_item["unit_price"], 2
                    )
                    norm_item["tax_rate"] = float(
                        item.get("tax_rate", fields.get("tax_rate", 19)) or 19
                    )
                    normalized_items.append(norm_item)
            fields["line_items"] = normalized_items

        # Default currency
        if not fields.get("currency"):
            fields["currency"] = "EUR"

        return fields
