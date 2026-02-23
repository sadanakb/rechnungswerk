"""
Lieferanten-Verwaltung (Supplier Management) Endpoints

CRUD-Operationen und Suche fuer bekannte Lieferanten.
"""
import logging
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import verify_api_key
from app.database import get_db
from app.models import Supplier

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------

class SupplierCreate(BaseModel):
    """Schema zum Anlegen eines neuen Lieferanten."""
    name: str = Field(..., min_length=1, max_length=255, description="Firmenname")
    vat_id: str = Field(..., min_length=1, max_length=50, description="USt-IdNr (z.B. DE123456789)")
    address: Optional[str] = Field(None, description="Anschrift")
    iban: Optional[str] = Field(None, max_length=34, description="IBAN")
    bic: Optional[str] = Field(None, max_length=11, description="BIC/SWIFT")
    email: Optional[str] = Field(None, max_length=255, description="E-Mail-Adresse")
    default_account: Optional[str] = Field(None, max_length=10, description="Standard-Konto (SKR03/04)")
    notes: Optional[str] = Field(None, description="Notizen")


class SupplierUpdate(BaseModel):
    """Schema zum Aktualisieren eines Lieferanten. Alle Felder optional."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    vat_id: Optional[str] = Field(None, min_length=1, max_length=50)
    address: Optional[str] = None
    iban: Optional[str] = Field(None, max_length=34)
    bic: Optional[str] = Field(None, max_length=11)
    email: Optional[str] = Field(None, max_length=255)
    default_account: Optional[str] = Field(None, max_length=10)
    notes: Optional[str] = None


class SupplierResponse(BaseModel):
    """Antwort-Schema fuer einen einzelnen Lieferanten."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    vat_id: str
    address: Optional[str] = None
    iban: Optional[str] = None
    bic: Optional[str] = None
    email: Optional[str] = None
    default_account: Optional[str] = None
    notes: Optional[str] = None
    invoice_count: int = 0
    total_volume: Decimal = Decimal("0.00")
    created_at: datetime
    updated_at: Optional[datetime] = None


class SupplierListResponse(BaseModel):
    """Paginierte Liste von Lieferanten."""
    items: List[SupplierResponse]
    total: int
    skip: int
    limit: int


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(
    prefix="/api/suppliers",
    tags=["Suppliers"],
    dependencies=[Depends(verify_api_key)],
)


# WICHTIG: /search muss VOR /{supplier_id} definiert werden, damit FastAPI
# den Pfad nicht als supplier_id="search" interpretiert.

@router.get("/search", response_model=List[SupplierResponse])
async def search_suppliers(
    q: str = Query(..., min_length=1, description="Suchbegriff (Name oder USt-IdNr)"),
    limit: int = Query(default=20, ge=1, le=100, description="Max. Ergebnisse"),
    db: Session = Depends(get_db),
):
    """
    Lieferanten nach Name oder USt-IdNr durchsuchen.

    Der Suchbegriff wird als Teilstring-Match (ILIKE) angewendet.
    """
    search_term = f"%{q}%"
    results = (
        db.query(Supplier)
        .filter(
            or_(
                Supplier.name.ilike(search_term),
                Supplier.vat_id.ilike(search_term),
            )
        )
        .order_by(Supplier.name)
        .limit(limit)
        .all()
    )
    return results


@router.get("", response_model=SupplierListResponse)
async def list_suppliers(
    skip: int = Query(default=0, ge=0, description="Anzahl zu ueberspringender Eintraege"),
    limit: int = Query(default=50, ge=1, le=200, description="Max. Eintraege (1-200)"),
    db: Session = Depends(get_db),
):
    """Alle Lieferanten mit Paginierung auflisten."""
    total = db.query(Supplier).count()
    suppliers = (
        db.query(Supplier)
        .order_by(Supplier.name)
        .offset(skip)
        .limit(limit)
        .all()
    )
    return SupplierListResponse(items=suppliers, total=total, skip=skip, limit=limit)


@router.post("", response_model=SupplierResponse, status_code=201)
async def create_supplier(
    payload: SupplierCreate,
    db: Session = Depends(get_db),
):
    """Neuen Lieferanten anlegen."""
    # Eindeutigkeit der USt-IdNr pruefen
    existing = db.query(Supplier).filter(Supplier.vat_id == payload.vat_id).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Lieferant mit USt-IdNr '{payload.vat_id}' existiert bereits (ID: {existing.id})",
        )

    supplier = Supplier(**payload.model_dump())
    db.add(supplier)
    db.commit()
    db.refresh(supplier)

    logger.info("Lieferant angelegt: id=%d, name=%s", supplier.id, supplier.name)
    return supplier


@router.get("/{supplier_id}", response_model=SupplierResponse)
async def get_supplier(
    supplier_id: int = Path(..., ge=1, description="Lieferanten-ID"),
    db: Session = Depends(get_db),
):
    """Einzelnen Lieferanten abrufen."""
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Lieferant nicht gefunden")
    return supplier


@router.put("/{supplier_id}", response_model=SupplierResponse)
async def update_supplier(
    payload: SupplierUpdate,
    supplier_id: int = Path(..., ge=1, description="Lieferanten-ID"),
    db: Session = Depends(get_db),
):
    """Lieferanten aktualisieren. Nur uebergebene Felder werden geaendert."""
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Lieferant nicht gefunden")

    update_data = payload.model_dump(exclude_unset=True)

    # Falls USt-IdNr geaendert wird, Eindeutigkeit pruefen
    if "vat_id" in update_data and update_data["vat_id"] != supplier.vat_id:
        conflict = (
            db.query(Supplier)
            .filter(Supplier.vat_id == update_data["vat_id"], Supplier.id != supplier_id)
            .first()
        )
        if conflict:
            raise HTTPException(
                status_code=409,
                detail=f"USt-IdNr '{update_data['vat_id']}' wird bereits von Lieferant '{conflict.name}' verwendet",
            )

    for field, value in update_data.items():
        setattr(supplier, field, value)

    db.commit()
    db.refresh(supplier)

    logger.info("Lieferant aktualisiert: id=%d, name=%s", supplier.id, supplier.name)
    return supplier


@router.delete("/{supplier_id}")
async def delete_supplier(
    supplier_id: int = Path(..., ge=1, description="Lieferanten-ID"),
    db: Session = Depends(get_db),
):
    """Lieferanten loeschen."""
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Lieferant nicht gefunden")

    supplier_name = supplier.name
    db.delete(supplier)
    db.commit()

    logger.info("Lieferant geloescht: id=%d, name=%s", supplier_id, supplier_name)
    return {"message": "Lieferant geloescht", "supplier_id": supplier_id}
