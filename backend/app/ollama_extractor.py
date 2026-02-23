"""
Ollama-based invoice field extraction.

Strategy:
  1. Extract text from PDF (pdfplumber) — fast, accurate for digital PDFs
  2. If text found → qwen2.5:14b text analysis (best for German invoices)
  3. If no text (scanned PDF) → gemma3:latest vision analysis
  4. If Ollama unavailable → Tesseract OCR fallback

Response format fix: response.message.content (not response["message"]["content"])
"""
import base64
import json
import logging
import re

logger = logging.getLogger(__name__)

OLLAMA_TEXT_MODEL = "qwen2.5:14b"
OLLAMA_VISION_MODEL = "gemma3:latest"

EXPECTED_FIELDS = [
    "invoice_number", "invoice_date", "due_date",
    "seller_name", "seller_vat_id", "seller_address",
    "seller_endpoint_id",
    "buyer_name", "buyer_vat_id", "buyer_address",
    "buyer_reference", "buyer_endpoint_id",
    "iban", "bic", "payment_account_name",
    "net_amount", "tax_rate", "tax_amount", "gross_amount",
    "currency", "line_items",
]

_TEXT_PROMPT = """\
Analysiere diesen Rechnungstext und extrahiere alle Felder als JSON.
Gib NUR gültiges JSON zurück, kein anderer Text:

{{
  "invoice_number": "Rechnungsnummer oder null",
  "invoice_date": "YYYY-MM-DD oder null",
  "due_date": "Fälligkeitsdatum YYYY-MM-DD oder null",
  "seller_name": "Firmenname/Name des Rechnungsstellers oder null",
  "seller_vat_id": "USt-IdNr Verkäufer z.B. DE123456789 oder null",
  "seller_address": "Vollständige Adresse Verkäufer oder null",
  "seller_endpoint_id": "E-Mail-Adresse des Rechnungsstellers oder null",
  "buyer_name": "Firmenname/Name des Rechnungsempfängers oder null",
  "buyer_vat_id": "USt-IdNr Käufer oder null",
  "buyer_address": "Vollständige Adresse Käufer oder null",
  "buyer_reference": "Leitweg-ID oder Bestellnummer oder Käuferreferenz oder null",
  "buyer_endpoint_id": "E-Mail-Adresse des Rechnungsempfängers oder null",
  "iban": "IBAN ohne Leerzeichen oder null",
  "bic": "BIC/SWIFT-Code oder null",
  "payment_account_name": "Kontoinhaber oder null",
  "net_amount": 0.00,
  "tax_rate": 19,
  "tax_amount": 0.00,
  "gross_amount": 0.00,
  "currency": "EUR",
  "line_items": [
    {{"description": "Leistungsbeschreibung", "quantity": 1.0, "unit_price": 0.00}}
  ]
}}

Rechnungstext:
{text}"""

_VISION_PROMPT = """\
Analysiere dieses Rechnungsbild und extrahiere alle Felder als JSON.
Gib NUR gültiges JSON zurück, kein anderer Text:

{
  "invoice_number": "Rechnungsnummer oder null",
  "invoice_date": "YYYY-MM-DD oder null",
  "due_date": "Fälligkeitsdatum YYYY-MM-DD oder null",
  "seller_name": "Firmenname/Name des Rechnungsstellers oder null",
  "seller_vat_id": "USt-IdNr Verkäufer z.B. DE123456789 oder null",
  "seller_address": "Vollständige Adresse Verkäufer oder null",
  "seller_endpoint_id": "E-Mail-Adresse des Rechnungsstellers oder null",
  "buyer_name": "Firmenname/Name des Rechnungsempfängers oder null",
  "buyer_vat_id": "USt-IdNr Käufer oder null",
  "buyer_address": "Vollständige Adresse Käufer oder null",
  "buyer_reference": "Leitweg-ID oder Bestellnummer oder Käuferreferenz oder null",
  "buyer_endpoint_id": "E-Mail-Adresse des Rechnungsempfängers oder null",
  "iban": "IBAN ohne Leerzeichen oder null",
  "bic": "BIC/SWIFT-Code oder null",
  "payment_account_name": "Kontoinhaber oder null",
  "net_amount": 0.00,
  "tax_rate": 19,
  "tax_amount": 0.00,
  "gross_amount": 0.00,
  "currency": "EUR",
  "line_items": [
    {"description": "Leistungsbeschreibung", "quantity": 1.0, "unit_price": 0.00}
  ]
}"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _is_ollama_available() -> bool:
    try:
        import ollama
        ollama.list()
        return True
    except Exception:
        return False


def _extract_pdf_text(pdf_path: str) -> str:
    """Extract text from PDF using pdfplumber (best for digital PDFs)."""
    try:
        import pdfplumber
        with pdfplumber.open(pdf_path) as pdf:
            pages_text = [page.extract_text() or "" for page in pdf.pages]
        return "\n".join(pages_text).strip()
    except ImportError:
        pass
    except Exception as exc:
        logger.debug("pdfplumber failed: %s", exc)

    # Fallback: PyPDF2
    try:
        import PyPDF2
        with open(pdf_path, "rb") as f:
            reader = PyPDF2.PdfReader(f)
            return "\n".join(p.extract_text() or "" for p in reader.pages).strip()
    except Exception:
        pass

    return ""


def _pdf_to_base64_png(pdf_path: str, dpi: int = 150) -> str:
    """Convert first PDF page to base64-encoded PNG for vision model."""
    import tempfile
    import os
    from pdf2image import convert_from_path
    images = convert_from_path(pdf_path, first_page=1, last_page=1, dpi=dpi)
    if not images:
        raise ValueError("pdf2image returned no pages")
    fd, img_path = tempfile.mkstemp(suffix=".png", prefix="rw_vision_")
    os.close(fd)
    try:
        images[0].save(img_path, format="PNG")
        with open(img_path, "rb") as fh:
            return base64.b64encode(fh.read()).decode()
    finally:
        os.unlink(img_path)


def _parse_json(raw: str) -> dict:
    """Extract JSON object from model output (3 strategies)."""
    # 1. Fenced code block
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            pass

    # 2. First complete { ... } block (handles nested lists via greedy)
    m = re.search(r"(\{.*\})", raw, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            pass

    # 3. Direct parse
    try:
        return json.loads(raw.strip())
    except json.JSONDecodeError:
        pass

    return {}


def _compute_confidence(fields: dict) -> float:
    if not fields:
        return 0.0
    filled = sum(
        1 for k in EXPECTED_FIELDS
        if fields.get(k) not in (None, "", 0, 0.0, [])
    )
    return round((filled / len(EXPECTED_FIELDS)) * 100, 2)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def extract_invoice_fields(pdf_path: str) -> dict:
    """
    Extract invoice fields from a PDF.

    Delegates to OCRPipelineV2 (PaddleOCR + Ollama + Confidence).
    Falls back to legacy Tesseract pipeline if V2 fails.

    Returns dict: {fields, confidence, source, raw_text}
    """
    try:
        from app.ocr.pipeline import OCRPipelineV2
        pipeline = OCRPipelineV2()
        result = pipeline.process(pdf_path)
        if result.get("fields"):
            return {
                "fields": result["fields"],
                "confidence": result.get("confidence", 0.0),
                "source": result.get("source", "pipeline-v2"),
                "raw_text": result.get("raw_text", ""),
            }
    except Exception as exc:
        logger.warning("Pipeline V2 failed (%s), trying legacy path", exc)

    return _tesseract_fallback(pdf_path)


def _tesseract_fallback(pdf_path: str) -> dict:
    """Last-resort: Tesseract OCR pipeline."""
    try:
        from app.ocr_pipeline import OCRPipeline
        logger.info("Tesseract fallback for '%s'", pdf_path)
        pipeline = OCRPipeline()
        extracted_text, confidence = pipeline.extract_text_from_pdf(pdf_path)
        if not extracted_text:
            return {"fields": {}, "confidence": 0.0, "source": "error", "raw_text": ""}
        fields = pipeline.extract_invoice_fields(extracted_text)
        return {
            "fields": fields,
            "confidence": round(float(confidence), 2),
            "source": "tesseract",
            "raw_text": extracted_text,
        }
    except Exception as exc:
        logger.error("Tesseract fallback also failed: %s", exc)
        return {"fields": {}, "confidence": 0.0, "source": "error", "raw_text": ""}
