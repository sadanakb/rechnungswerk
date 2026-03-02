"""
Health check endpoints — split into liveness and readiness probes.

Security: no system internals, software versions, model names, or data
counts are exposed in any response.
"""
import time
from typing import Optional, Tuple

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.database import SessionLocal
from app.config import settings
from app.rate_limiter import limiter

router = APIRouter()

# ---------------------------------------------------------------------------
# Module-level cache for the readiness result (TTL = 60 seconds)
# ---------------------------------------------------------------------------
_CACHE_TTL: int = 60  # seconds
_cache_ts: float = 0.0
_cache_result: Optional[dict] = None


def _get_cached_ready() -> Optional[dict]:
    """Return cached readiness result if still valid, else None."""
    if _cache_result is not None and (time.monotonic() - _cache_ts) < _CACHE_TTL:
        return _cache_result
    return None


def _set_cache(result: dict) -> None:
    global _cache_ts, _cache_result
    _cache_ts = time.monotonic()
    _cache_result = result


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _check_database() -> str:
    """Run a minimal SELECT 1 to verify DB connectivity. Returns 'ok' or 'error'."""
    try:
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
            return "ok"
        finally:
            db.close()
    except Exception:
        return "error"


async def _check_kosit() -> str:
    """
    Probe KoSIT validator reachability.
    Returns 'ok', 'error', or 'not_configured'.
    """
    validator_url: str = settings.kosit_validator_url or ""

    # Treat the placeholder default as "not configured"
    if not validator_url or validator_url == "http://localhost:8081/validate":
        # Try the conventional default port as a best-effort probe
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                resp = await client.get("http://localhost:8080")
            return "ok" if resp.status_code < 500 else "error"
        except Exception:
            return "not_configured"

    # Strip the /validate path to probe the base URL with a lightweight GET
    base_url = validator_url.rsplit("/validate", 1)[0]
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(base_url)
        return "ok" if resp.status_code < 500 else "error"
    except Exception:
        return "error"


async def _build_readiness_response() -> Tuple[dict, int]:
    """
    Perform all readiness checks and return (body_dict, http_status_code).
    Results are cached for _CACHE_TTL seconds.
    """
    cached = _get_cached_ready()
    if cached is not None:
        return cached, (200 if cached["status"] == "ok" else 503)

    db_status = _check_database()
    kosit_status = await _check_kosit()

    overall = "ok" if db_status == "ok" else "degraded"
    body = {
        "status": overall,
        "checks": {
            "database": db_status,
            "kosit_validator": kosit_status,
        },
    }
    _set_cache(body)
    http_status = 200 if overall == "ok" else 503
    return body, http_status


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/health/live", tags=["Health"])
async def liveness():
    """
    Liveness probe — instant, no external calls, no auth required.
    Returns 200 as long as the process is alive.
    """
    return {"status": "ok"}


@router.get("/health/ready", tags=["Health"])
@limiter.limit("10/minute")
async def readiness(request: Request):
    """
    Readiness probe — checks DB connectivity and KoSIT validator reachability.
    Rate-limited to 10 requests per minute. Result cached for 60 seconds.
    """
    body, status_code = await _build_readiness_response()
    return JSONResponse(content=body, status_code=status_code)


@router.get("/health", tags=["Health"])
@limiter.limit("10/minute")
async def health_check(request: Request):
    """
    Backward-compatible alias — delegates to the readiness probe.
    """
    body, status_code = await _build_readiness_response()
    return JSONResponse(content=body, status_code=status_code)
