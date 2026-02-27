"""Storage backend abstraction for file operations.

Supports local filesystem and S3-compatible storage.
Configure via STORAGE_BACKEND=local|s3 environment variable.
"""
import logging
from abc import ABC, abstractmethod
from pathlib import Path

logger = logging.getLogger(__name__)


class StorageBackend(ABC):
    """Abstract storage backend interface."""

    @abstractmethod
    def save(self, path: str, data: bytes) -> str:
        """Save data to path. Returns the storage key/path."""

    @abstractmethod
    def read(self, path: str) -> bytes:
        """Read data from path."""

    @abstractmethod
    def delete(self, path: str) -> None:
        """Delete file at path."""

    @abstractmethod
    def url(self, path: str) -> str:
        """Return a URL or path to access the file."""

    @abstractmethod
    def exists(self, path: str) -> bool:
        """Check if file exists."""


class LocalStorage(StorageBackend):
    """Local filesystem storage backend (default)."""

    def __init__(self, base_dir: str = "data"):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def save(self, path: str, data: bytes) -> str:
        full_path = self.base_dir / path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_bytes(data)
        return str(full_path)

    def read(self, path: str) -> bytes:
        full_path = self.base_dir / path
        return full_path.read_bytes()

    def delete(self, path: str) -> None:
        full_path = self.base_dir / path
        if full_path.exists():
            full_path.unlink()

    def url(self, path: str) -> str:
        return f"/static/{path}"

    def exists(self, path: str) -> bool:
        return (self.base_dir / path).exists()


class S3Storage(StorageBackend):
    """S3-compatible storage backend (AWS S3, MinIO, Cloudflare R2)."""

    def __init__(
        self,
        bucket: str,
        region: str,
        access_key: str,
        secret_key: str,
        endpoint_url: str = None,
    ):
        import boto3
        self.bucket = bucket
        self.client = boto3.client(
            "s3",
            region_name=region,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            endpoint_url=endpoint_url,
        )

    def save(self, path: str, data: bytes) -> str:
        self.client.put_object(Bucket=self.bucket, Key=path, Body=data)
        return path

    def read(self, path: str) -> bytes:
        response = self.client.get_object(Bucket=self.bucket, Key=path)
        return response["Body"].read()

    def delete(self, path: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=path)

    def url(self, path: str) -> str:
        return f"https://{self.bucket}.s3.amazonaws.com/{path}"

    def exists(self, path: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=path)
            return True
        except Exception:
            return False


def get_storage() -> StorageBackend:
    """Get the configured storage backend instance."""
    from app.config import settings
    backend = getattr(settings, "storage_backend", "local")
    if backend == "s3":
        return S3Storage(
            bucket=settings.aws_bucket,
            region=settings.aws_region,
            access_key=settings.aws_access_key_id,
            secret_key=settings.aws_secret_access_key,
        )
    return LocalStorage(base_dir="data")
