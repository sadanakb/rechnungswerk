"""
API-Key Authentifizierung für RechnungsWerk.

Alle Endpoints außer /health und /docs werden geschützt.
API-Key wird via Header "X-API-Key" oder Query-Parameter "api_key" übergeben.
"""
import secrets
import logging
from pathlib import Path

from fastapi import Depends, HTTPException, Security
from fastapi.security import APIKeyHeader, APIKeyQuery

from app.config import settings

logger = logging.getLogger(__name__)

API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=False)
API_KEY_QUERY = APIKeyQuery(name="api_key", auto_error=False)

# Pfad für den generierten API-Key
_API_KEY_FILE = Path("data/.api_key")


def _get_or_create_api_key() -> str:
    """Liest den API-Key aus der Datei oder generiert einen neuen."""
    _API_KEY_FILE.parent.mkdir(parents=True, exist_ok=True)

    if _API_KEY_FILE.exists():
        key = _API_KEY_FILE.read_text().strip()
        if key:
            return key

    key = secrets.token_urlsafe(32)
    _API_KEY_FILE.write_text(key)
    _API_KEY_FILE.chmod(0o600)
    logger.info("Neuer API-Key generiert und in %s gespeichert", _API_KEY_FILE)
    return key


# Key wird beim Import einmalig geladen
ACTIVE_API_KEY = _get_or_create_api_key()


async def verify_api_key(
    header_key: str = Security(API_KEY_HEADER),
    query_key: str = Security(API_KEY_QUERY),
) -> str:
    """FastAPI Dependency: prüft API-Key aus Header oder Query."""
    # Wenn auth deaktiviert ist (z.B. für lokale Entwicklung)
    if not settings.require_api_key:
        return "dev-mode"

    key = header_key or query_key
    if not key:
        raise HTTPException(
            status_code=401,
            detail="API-Key fehlt. Header 'X-API-Key' oder Query '?api_key=' setzen.",
        )

    if not secrets.compare_digest(key, ACTIVE_API_KEY):
        raise HTTPException(status_code=403, detail="Ungültiger API-Key")

    return key
