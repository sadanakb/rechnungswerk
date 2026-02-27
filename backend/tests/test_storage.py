"""Tests for storage backend abstraction (Task 5)."""
import pytest
import tempfile
import os
from unittest.mock import MagicMock, patch


class TestLocalStorage:

    def test_local_save_and_read(self):
        """LocalStorage should save bytes and read them back correctly."""
        from app.storage import LocalStorage

        with tempfile.TemporaryDirectory() as tmpdir:
            storage = LocalStorage(base_dir=tmpdir)
            data = b"test invoice data"
            storage.save("invoices/test.pdf", data)
            result = storage.read("invoices/test.pdf")
            assert result == data

    def test_local_delete(self):
        """LocalStorage.delete should remove the file."""
        from app.storage import LocalStorage

        with tempfile.TemporaryDirectory() as tmpdir:
            storage = LocalStorage(base_dir=tmpdir)
            storage.save("to_delete.txt", b"data")
            assert storage.exists("to_delete.txt")
            storage.delete("to_delete.txt")
            assert not storage.exists("to_delete.txt")

    def test_local_url_returns_static_path(self):
        """LocalStorage.url should return /static/ prefixed path."""
        from app.storage import LocalStorage

        with tempfile.TemporaryDirectory() as tmpdir:
            storage = LocalStorage(base_dir=tmpdir)
            url = storage.url("logos/org1.png")
            assert url == "/static/logos/org1.png"

    def test_get_storage_returns_local_by_default(self):
        """get_storage() should return LocalStorage when storage_backend=local."""
        from app.storage import get_storage, LocalStorage
        storage = get_storage()
        assert isinstance(storage, LocalStorage)
