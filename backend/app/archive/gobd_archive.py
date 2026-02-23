"""
GoBD-konforme Archivierung — Revisionssichere Speicherung von Rechnungen.

GoBD (Grundsaetze zur ordnungsmaessigen Fuehrung und Aufbewahrung von
Buechern, Aufzeichnungen und Unterlagen in elektronischer Form) erfordert:

1. Unveraenderbarkeit (Integritaet via SHA-256 Hash)
2. Nachvollziehbarkeit (Zeitstempel, Versionierung)
3. Ordnungsmaessigkeit (eindeutige Zuordnung)
4. Verfuegbarkeit (jederzeitiger Zugriff)
"""
import hashlib
import logging
import os
from datetime import datetime, timezone
from typing import Dict, Optional

logger = logging.getLogger(__name__)


class GoBDArchive:
    """GoBD-compliant document archiving with integrity verification."""

    def __init__(self, archive_dir: str = "data/archive"):
        self.archive_dir = archive_dir
        os.makedirs(archive_dir, exist_ok=True)

    def archive_document(
        self,
        document_content: bytes,
        document_type: str,
        invoice_id: str,
        metadata: Optional[Dict] = None,
    ) -> Dict:
        """
        Archive a document with GoBD compliance.

        Args:
            document_content: Raw bytes of the document
            document_type: "xrechnung_xml", "zugferd_pdf", "original_pdf"
            invoice_id: Associated invoice ID
            metadata: Additional metadata

        Returns:
            {
                "archive_id": str,
                "sha256_hash": str,
                "timestamp": str,
                "archive_path": str,
                "document_type": str,
                "file_size": int,
            }
        """
        # Calculate SHA-256 hash for integrity
        sha256_hash = hashlib.sha256(document_content).hexdigest()

        # Timestamp (ISO 8601 with timezone)
        timestamp = datetime.now(timezone.utc).isoformat()

        # Archive path: archive/{year}/{month}/{invoice_id}_{type}_{hash[:8]}
        now = datetime.now(timezone.utc)
        year_dir = os.path.join(self.archive_dir, str(now.year))
        month_dir = os.path.join(year_dir, f"{now.month:02d}")
        os.makedirs(month_dir, exist_ok=True)

        ext = ".xml" if "xml" in document_type else ".pdf"
        filename = f"{invoice_id}_{document_type}_{sha256_hash[:8]}{ext}"
        archive_path = os.path.join(month_dir, filename)

        # Write file (immutable — no overwrite)
        if os.path.exists(archive_path):
            logger.warning("Archive file already exists: %s", archive_path)
        else:
            with open(archive_path, "wb") as f:
                f.write(document_content)
            # Make read-only (immutable)
            os.chmod(archive_path, 0o444)

        archive_id = f"arch-{sha256_hash[:12]}"

        # Write metadata sidecar file
        meta_path = archive_path + ".meta"
        if not os.path.exists(meta_path):
            import json
            meta = {
                "archive_id": archive_id,
                "invoice_id": invoice_id,
                "document_type": document_type,
                "sha256_hash": sha256_hash,
                "timestamp": timestamp,
                "file_size": len(document_content),
                "filename": filename,
                **(metadata or {}),
            }
            with open(meta_path, "w") as f:
                json.dump(meta, f, indent=2, ensure_ascii=False)
            os.chmod(meta_path, 0o444)

        logger.info(
            "Archived %s for %s: hash=%s, size=%d",
            document_type, invoice_id, sha256_hash[:16], len(document_content),
        )

        return {
            "archive_id": archive_id,
            "sha256_hash": sha256_hash,
            "timestamp": timestamp,
            "archive_path": archive_path,
            "document_type": document_type,
            "file_size": len(document_content),
        }

    def verify_integrity(self, archive_path: str) -> Dict:
        """
        Verify document integrity by recalculating hash.

        Returns:
            {"valid": bool, "expected_hash": str, "actual_hash": str}
        """
        import json

        meta_path = archive_path + ".meta"
        if not os.path.exists(meta_path):
            return {"valid": False, "error": "Metadaten-Datei nicht gefunden"}

        with open(meta_path, "r") as f:
            meta = json.load(f)

        expected_hash = meta.get("sha256_hash", "")

        if not os.path.exists(archive_path):
            return {
                "valid": False,
                "expected_hash": expected_hash,
                "actual_hash": "",
                "error": "Archivdatei nicht gefunden",
            }

        with open(archive_path, "rb") as f:
            actual_hash = hashlib.sha256(f.read()).hexdigest()

        is_valid = actual_hash == expected_hash

        if not is_valid:
            logger.error(
                "INTEGRITY VIOLATION: %s — expected %s, got %s",
                archive_path, expected_hash[:16], actual_hash[:16],
            )

        return {
            "valid": is_valid,
            "expected_hash": expected_hash,
            "actual_hash": actual_hash,
        }
