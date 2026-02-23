"""
Batch processing for multiple PDF invoices.

Processes multiple PDFs through the OCR pipeline concurrently,
tracking progress and results per file.
"""
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional
from dataclasses import dataclass, field
from enum import Enum

from app.ocr.pipeline import OCRPipelineV2

logger = logging.getLogger(__name__)


class BatchStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIAL = "partial"  # Some files succeeded, some failed


@dataclass
class BatchFileResult:
    """Result for a single file in a batch."""
    filename: str
    status: str = "pending"
    invoice_id: Optional[str] = None
    fields: Dict = field(default_factory=dict)
    confidence: float = 0.0
    field_confidences: Dict = field(default_factory=dict)
    error: Optional[str] = None
    source: str = ""


@dataclass
class BatchJob:
    """Tracks batch processing state."""
    batch_id: str
    total_files: int
    processed: int = 0
    succeeded: int = 0
    failed: int = 0
    status: str = BatchStatus.PENDING
    results: List[BatchFileResult] = field(default_factory=list)
    created_at: str = ""
    completed_at: Optional[str] = None

    def progress_percent(self) -> float:
        if self.total_files == 0:
            return 100.0
        return round((self.processed / self.total_files) * 100, 1)


# In-memory batch job store (production would use Redis/DB)
_batch_jobs: Dict[str, BatchJob] = {}


class BatchProcessor:
    """Process multiple PDFs through OCR pipeline."""

    def __init__(self):
        self.pipeline = OCRPipelineV2()

    def create_batch(self, filenames: List[str]) -> BatchJob:
        """Create a new batch job."""
        batch_id = f"batch-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6]}"
        job = BatchJob(
            batch_id=batch_id,
            total_files=len(filenames),
            status=BatchStatus.PENDING,
            results=[BatchFileResult(filename=f) for f in filenames],
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        _batch_jobs[batch_id] = job
        return job

    def process_batch(self, batch_id: str, file_paths: List[str]) -> BatchJob:
        """
        Process all files in a batch sequentially.

        Args:
            batch_id: Batch job ID
            file_paths: List of PDF file paths (same order as filenames in create_batch)

        Returns:
            Updated BatchJob with results
        """
        job = _batch_jobs.get(batch_id)
        if not job:
            raise ValueError(f"Batch {batch_id} nicht gefunden")

        job.status = BatchStatus.PROCESSING

        for i, file_path in enumerate(file_paths):
            result = job.results[i]
            result.status = "processing"

            try:
                logger.info(
                    "Batch %s: Processing file %d/%d: %s",
                    batch_id, i + 1, job.total_files, result.filename,
                )

                # Generate invoice ID for this file
                invoice_id = f"INV-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:8]}"
                result.invoice_id = invoice_id

                # Run OCR pipeline
                pipeline_result = self.pipeline.process(file_path)

                result.fields = pipeline_result.get("fields", {})
                result.confidence = pipeline_result.get("confidence", 0.0)
                result.field_confidences = pipeline_result.get("field_confidences", {})
                result.source = pipeline_result.get("source", "unknown")
                result.status = "completed"
                job.succeeded += 1

            except Exception as e:
                logger.error(
                    "Batch %s: File %s failed: %s", batch_id, result.filename, e
                )
                result.status = "failed"
                result.error = str(e)
                job.failed += 1

            job.processed += 1

        # Determine final batch status
        job.completed_at = datetime.now(timezone.utc).isoformat()
        if job.failed == 0:
            job.status = BatchStatus.COMPLETED
        elif job.succeeded == 0:
            job.status = BatchStatus.FAILED
        else:
            job.status = BatchStatus.PARTIAL

        logger.info(
            "Batch %s finished: %d/%d succeeded, %d failed",
            batch_id, job.succeeded, job.total_files, job.failed,
        )

        return job

    @staticmethod
    def get_batch(batch_id: str) -> Optional[BatchJob]:
        """Get batch job status."""
        return _batch_jobs.get(batch_id)

    @staticmethod
    def list_batches() -> List[BatchJob]:
        """List all batch jobs."""
        return list(_batch_jobs.values())
