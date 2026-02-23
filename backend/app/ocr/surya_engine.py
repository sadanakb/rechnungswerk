"""
Surya OCR engine — drop-in replacement for PaddleOCREngine.

Surya achieves 97.7% accuracy on German documents vs 60-80% for Tesseract.
Fully compatible with macOS (no PaddlePaddle dependency).

Lazy initialization: model loads only on first call (~2-4 GB, cached by torch).
"""
import logging
import tempfile
import os
from typing import List, Optional

from PIL import Image

from app.ocr.paddleocr_engine import OCRDocumentResult, OCRPageResult, TextBlock

logger = logging.getLogger(__name__)


class SuryaOCREngine:
    """
    Surya-based text extraction — same interface as PaddleOCREngine.

    Uses FoundationPredictor + RecognitionPredictor + DetectionPredictor.
    Falls back to PaddleOCR (and then Tesseract) if Surya is unavailable.
    """

    def __init__(self, dpi: int = 300):
        self.dpi = dpi
        self._foundation = None
        self._recognizer = None
        self._detector = None

    def _get_predictors(self):
        """Lazy-initialize Surya predictors (heavy model download on first use)."""
        if self._recognizer is None:
            from surya.foundation import FoundationPredictor
            from surya.recognition import RecognitionPredictor
            from surya.detection import DetectionPredictor

            logger.info("Initializing Surya OCR predictors (first-time model load)...")
            self._foundation = FoundationPredictor()
            self._recognizer = RecognitionPredictor(self._foundation)
            self._detector = DetectionPredictor()
            # Suppress tqdm progress bars during inference
            self._recognizer.disable_tqdm = True
            self._detector.disable_tqdm = True
            logger.info("Surya OCR ready")
        return self._recognizer, self._detector

    def extract_from_pdf(self, pdf_path: str, max_pages: int = 0) -> OCRDocumentResult:
        """
        Extract text from all pages of a PDF using Surya OCR.

        Args:
            pdf_path: Path to PDF file
            max_pages: Maximum pages to process (0 = all pages)

        Returns:
            OCRDocumentResult — same structure as PaddleOCREngine
        """
        try:
            return self._extract_with_surya(pdf_path, max_pages)
        except ImportError:
            logger.warning("surya-ocr not installed, falling back to PaddleOCR")
            return self._fallback(pdf_path, max_pages)
        except Exception as e:
            logger.warning("Surya OCR failed (%s), falling back to PaddleOCR", e)
            return self._fallback(pdf_path, max_pages)

    def _extract_with_surya(self, pdf_path: str, max_pages: int) -> OCRDocumentResult:
        """Run Surya recognition on all PDF pages."""
        from pdf2image import convert_from_path

        kwargs = {"dpi": self.dpi}
        if max_pages > 0:
            kwargs["last_page"] = max_pages
        images: List[Image.Image] = convert_from_path(pdf_path, **kwargs)

        if not images:
            return OCRDocumentResult(engine="surya")

        recognizer, detector = self._get_predictors()

        # Batch-process all pages at once (Surya is optimized for batching)
        ocr_results = recognizer(images, det_predictor=detector)

        pages: List[OCRPageResult] = []
        all_text_parts: List[str] = []

        for page_num, (image, ocr_result) in enumerate(zip(images, ocr_results), start=1):
            page_result = self._build_page_result(ocr_result, page_num)
            pages.append(page_result)
            if page_result.text:
                all_text_parts.append(f"--- Seite {page_num} ---\n{page_result.text}")

        full_text = "\n\n".join(all_text_parts)
        avg_conf = (
            sum(p.avg_confidence for p in pages) / len(pages) if pages else 0.0
        )

        return OCRDocumentResult(
            pages=pages,
            full_text=full_text,
            avg_confidence=round(avg_conf, 2),
            total_pages=len(pages),
            engine="surya",
        )

    def _build_page_result(self, ocr_result, page_num: int) -> OCRPageResult:
        """Convert Surya OCRResult to our OCRPageResult format."""
        blocks: List[TextBlock] = []

        for line in ocr_result.text_lines:
            text = (line.text or "").strip()
            if not text:
                continue

            # Surya confidence is 0.0–1.0; scale to 0–100
            confidence = round((line.confidence or 0.0) * 100, 2)

            # bbox property returns [x_min, y_min, x_max, y_max]
            try:
                bbox = tuple(int(v) for v in line.bbox)
            except Exception:
                bbox = (0, 0, 0, 0)

            blocks.append(TextBlock(
                text=text,
                confidence=confidence,
                bbox=bbox,
                page=page_num,
            ))

        # Sort top-to-bottom, left-to-right (reading order)
        blocks.sort(key=lambda b: (b.bbox[1], b.bbox[0]))

        text = "\n".join(b.text for b in blocks)
        avg_conf = (
            sum(b.confidence for b in blocks) / len(blocks) if blocks else 0.0
        )

        return OCRPageResult(
            page_number=page_num,
            text=text,
            blocks=blocks,
            avg_confidence=round(avg_conf, 2),
        )

    def _fallback(self, pdf_path: str, max_pages: int) -> OCRDocumentResult:
        """Fall back to PaddleOCR → Tesseract chain."""
        from app.ocr.paddleocr_engine import PaddleOCREngine
        logger.info("Surya fallback: using PaddleOCR for '%s'", pdf_path)
        return PaddleOCREngine(dpi=self.dpi).extract_from_pdf(pdf_path, max_pages)
