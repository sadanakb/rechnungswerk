"""Tests for async email task dispatch (Task 2: Email ARQ Task)."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class TestEmailTaskDispatch:
    """Test that enqueue_email dispatches correctly."""

    @pytest.mark.asyncio
    async def test_enqueue_email_uses_arq_pool_when_available(self):
        """When arq_pool is provided, enqueue_email should enqueue a job."""
        from app.email_service import enqueue_email

        mock_pool = AsyncMock()
        mock_pool.enqueue_job = AsyncMock(return_value=None)

        result = await enqueue_email(
            mock_pool,
            "password_reset",
            to_email="test@example.com",
            reset_url="https://example.com/reset/tok123",
        )

        assert result is True
        mock_pool.enqueue_job.assert_called_once_with(
            "send_email_task",
            "password_reset",
            to_email="test@example.com",
            reset_url="https://example.com/reset/tok123",
        )

    @pytest.mark.asyncio
    async def test_enqueue_email_sync_fallback_when_pool_is_none(self):
        """When arq_pool is None, enqueue_email should call the sync email function."""
        from app.email_service import enqueue_email

        with patch("app.email_service.send_password_reset_email", return_value=True) as mock_send:
            result = await enqueue_email(
                None,
                "password_reset",
                to_email="test@example.com",
                reset_url="https://example.com/reset/tok123",
            )
            assert result is True
            mock_send.assert_called_once_with(
                to_email="test@example.com",
                reset_url="https://example.com/reset/tok123",
            )

    @pytest.mark.asyncio
    async def test_send_email_task_routes_to_correct_handler(self):
        """send_email_task should dispatch to the correct email_service function."""
        from app.tasks.worker import send_email_task

        ctx = {}
        with patch("app.email_service.send_mahnung_email", return_value=True) as mock_mahnung:
            result = await send_email_task(
                ctx,
                "mahnung",
                to_email="kunde@example.com",
                customer_name="Max Mustermann",
                invoice_number="RE-2026-0001",
                level=1,
                amount=500.0,
                due_date="2026-03-01",
                fees=0.0,
            )
            assert result["task_type"] == "mahnung"
            assert result["success"] is True
            mock_mahnung.assert_called_once()
