"""
Health check endpoint
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Invoice
from app.schemas import HealthResponse
from app.config import settings
import subprocess
import shutil
import httpx

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health_check(db: Session = Depends(get_db)):
    """
    Health check for RechnungsWerk API

    Checks:
    - Database connection + total invoice count
    - Tesseract OCR installation + version
    - KoSIT validator availability (optional)
    """
    # --- Database ---
    try:
        total_invoices = db.query(Invoice).count()
        db_status = "connected"
    except Exception:
        total_invoices = 0
        db_status = "error"

    # --- Tesseract ---
    tesseract_installed = shutil.which("tesseract") is not None
    tesseract_version: str | None = None
    if tesseract_installed:
        try:
            result = subprocess.run(
                ["tesseract", "--version"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            # First line of stderr typically: "tesseract 5.3.4"
            output = result.stdout or result.stderr
            first_line = output.strip().splitlines()[0] if output.strip() else ""
            tesseract_version = first_line  # e.g. "tesseract 5.3.4"
        except Exception:
            tesseract_version = "unknown"

    # --- KoSIT Validator (optional, non-blocking) ---
    kosit_status = "not_configured"
    validator_url = settings.kosit_validator_url
    if validator_url and validator_url != "http://localhost:8081/validate":
        # Try a lightweight GET on the base URL (the /validate path is POST-only)
        base_url = validator_url.rsplit("/validate", 1)[0]
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(base_url)
            kosit_status = "available" if resp.status_code < 500 else "error"
        except Exception:
            kosit_status = "unavailable"
    else:
        # Try default KoSIT port 8080 on localhost
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                resp = await client.get("http://localhost:8080")
            kosit_status = "available" if resp.status_code < 500 else "error"
        except Exception:
            kosit_status = "not_running"

    # --- Ollama ---
    ollama_available = False
    try:
        import ollama as _ollama
        _ollama.list()
        ollama_available = True
    except Exception:
        pass

    # --- PaddleOCR ---
    paddleocr_available = False
    try:
        from paddleocr import PaddleOCR as _PaddleOCR
        paddleocr_available = True
    except ImportError:
        pass

    if paddleocr_available and ollama_available:
        ocr_engine = "paddleocr+ollama-text+vision"
    elif ollama_available:
        ocr_engine = "ollama-text+vision"
    elif paddleocr_available:
        ocr_engine = "paddleocr+tesseract"
    else:
        ocr_engine = "tesseract"
    overall_status = "healthy" if db_status == "connected" else "degraded"

    return HealthResponse(
        status=overall_status,
        database=db_status,
        tesseract_installed=tesseract_installed,
        tesseract_version=tesseract_version,
        kosit_validator=kosit_status,
        total_invoices=total_invoices,
        xrechnung_version=settings.xrechnung_version,
        ollama_available=ollama_available,
        ollama_primary_model="qwen2.5:14b",
        ollama_vision_model="qwen2-vl:7b",
        ocr_engine=ocr_engine,
    )
