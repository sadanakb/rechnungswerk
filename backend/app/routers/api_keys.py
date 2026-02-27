"""API Key management router.

Endpoints:
- GET  /api/api-keys        — List active keys for the caller's org
- POST /api/api-keys        — Create a new key (full key returned ONCE)
- DELETE /api/api-keys/{id} — Soft-delete (revoke) a key

Keys are stored as bcrypt_sha256 hashes; only the first 12 chars (prefix)
are stored in plaintext for display purposes.
"""
import secrets
import logging
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ApiKey, OrganizationMember
from app.auth_jwt import get_current_user, hash_password

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

ALLOWED_SCOPES = {
    "read:invoices",
    "write:invoices",
    "read:suppliers",
    "write:suppliers",
}


class ApiKeyCreate(BaseModel):
    name: str
    scopes: List[str] = []
    expires_at: Optional[datetime] = None


class ApiKeyResponse(BaseModel):
    id: int
    name: str
    key_prefix: str
    scopes: List[str]
    created_at: Optional[datetime]
    last_used_at: Optional[datetime]
    expires_at: Optional[datetime]
    is_active: bool

    class Config:
        from_attributes = True


class ApiKeyCreateResponse(ApiKeyResponse):
    """Returned only on creation — includes the full plaintext key."""
    full_key: str
    warning: str = "Wird nur einmal angezeigt"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_org_id(current_user: dict, db: Session) -> int:
    """Resolve the organization id for the current user."""
    user_id = int(current_user["user_id"])
    member = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.user_id == user_id)
        .first()
    )
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Benutzer ist keiner Organisation zugeordnet",
        )
    return member.organization_id


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=List[ApiKeyResponse])
def list_api_keys(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all active API keys for the caller's organisation.

    key_hash is never included in the response.
    """
    org_id = _get_org_id(current_user, db)
    keys = (
        db.query(ApiKey)
        .filter(ApiKey.org_id == org_id, ApiKey.is_active == True)  # noqa: E712
        .order_by(ApiKey.created_at.desc())
        .all()
    )
    return keys


@router.post("", response_model=ApiKeyCreateResponse, status_code=status.HTTP_201_CREATED)
def create_api_key(
    payload: ApiKeyCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new API key.

    Generates a ``rw_live_`` + 24-byte URL-safe token as the full key.
    Only the prefix (first 12 chars) and a bcrypt hash are persisted.
    The full key is returned **only in this response**.
    """
    org_id = _get_org_id(current_user, db)
    user_id = int(current_user["user_id"])

    # Validate name
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name darf nicht leer sein")

    # Validate scopes
    invalid = set(payload.scopes) - ALLOWED_SCOPES
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"Unbekannte Scopes: {', '.join(sorted(invalid))}",
        )

    # Generate the key: "rw_live_" (8 chars) + 24 bytes URL-safe → total ~40 chars
    raw_suffix = secrets.token_urlsafe(24)
    full_key = f"rw_live_{raw_suffix}"
    key_prefix = full_key[:12]          # "rw_live_xxxx"
    key_hash = hash_password(full_key)  # bcrypt_sha256 hash

    api_key = ApiKey(
        org_id=org_id,
        user_id=user_id,
        name=name,
        key_prefix=key_prefix,
        key_hash=key_hash,
        scopes=payload.scopes,
        expires_at=payload.expires_at,
        is_active=True,
    )
    db.add(api_key)
    db.commit()
    db.refresh(api_key)

    logger.info(
        "[ApiKey] Created key '%s' (prefix=%s) for org=%d user=%d",
        name, key_prefix, org_id, user_id,
    )

    return ApiKeyCreateResponse(
        id=api_key.id,
        name=api_key.name,
        key_prefix=api_key.key_prefix,
        scopes=api_key.scopes or [],
        created_at=api_key.created_at,
        last_used_at=api_key.last_used_at,
        expires_at=api_key.expires_at,
        is_active=api_key.is_active,
        full_key=full_key,
        warning="Wird nur einmal angezeigt",
    )


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_api_key(
    key_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Soft-delete (revoke) an API key.

    Only keys belonging to the caller's organisation may be revoked.
    """
    org_id = _get_org_id(current_user, db)
    api_key = (
        db.query(ApiKey)
        .filter(
            ApiKey.id == key_id,
            ApiKey.org_id == org_id,
            ApiKey.is_active == True,  # noqa: E712
        )
        .first()
    )
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API-Schluessel nicht gefunden oder bereits widerrufen",
        )

    api_key.is_active = False
    db.commit()

    logger.info(
        "[ApiKey] Revoked key id=%d (prefix=%s) for org=%d",
        key_id, api_key.key_prefix, org_id,
    )
