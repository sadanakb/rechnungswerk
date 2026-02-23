"""
OCR package for RechnungsWerk.

Provides PaddleOCR-based text extraction, Ollama LLM field extraction,
confidence scoring, and batch processing capabilities.
"""
from app.ocr.paddleocr_engine import PaddleOCREngine
from app.ocr.confidence import ConfidenceScorer
from app.ocr.pipeline import OCRPipelineV2
from app.ocr.batch_processor import BatchProcessor

__all__ = ["PaddleOCREngine", "ConfidenceScorer", "OCRPipelineV2", "BatchProcessor"]
