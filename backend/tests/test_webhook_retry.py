"""Tests for webhook retry mechanism with exponential backoff (Task 3)."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class TestWebhookRetry:

    @pytest.mark.asyncio
    async def test_successful_delivery_not_retried(self):
        """A delivery with status='success' should be skipped immediately."""
        from app.tasks.worker import webhook_retry_task

        mock_delivery = MagicMock()
        mock_delivery.status = "success"

        ctx = {}
        with patch("app.database.SessionLocal") as mock_session_cls:
            mock_db = MagicMock()
            mock_session_cls.return_value = mock_db
            mock_db.query.return_value.filter.return_value.first.return_value = mock_delivery

            result = await webhook_retry_task(ctx, delivery_id=42)

        assert result == {"skipped": True}

    @pytest.mark.asyncio
    async def test_failed_delivery_enqueues_retry(self):
        """A failed delivery should enqueue a retry with the first delay (60s)."""
        from app.tasks.worker import webhook_retry_task

        mock_delivery = MagicMock()
        mock_delivery.status = "pending"
        mock_delivery.attempts = 0
        mock_delivery.subscription_id = 1
        mock_delivery.payload = {"event": "invoice.created"}
        mock_delivery.event_type = "invoice.created"
        mock_delivery.id = 99

        mock_sub = MagicMock()
        mock_sub.url = "https://example.com/webhook"
        mock_sub.secret = "secret"

        mock_redis = AsyncMock()
        ctx = {"redis": mock_redis}

        with patch("app.database.SessionLocal") as mock_session_cls, \
             patch("app.webhook_service._deliver", new_callable=AsyncMock) as mock_deliver:

            mock_db = MagicMock()
            mock_session_cls.return_value = mock_db
            mock_db.query.return_value.filter.return_value.first.side_effect = [
                mock_delivery, mock_sub
            ]
            mock_deliver.return_value = (False, 500, "Internal Server Error")

            result = await webhook_retry_task(ctx, delivery_id=99)

        assert result["retrying"] is True
        assert result["attempt"] == 1
        mock_redis.enqueue_job.assert_called_once_with(
            "webhook_retry_task", 99, _defer_by=60
        )

    @pytest.mark.asyncio
    async def test_max_5_attempts_permanently_fails(self):
        """After 5 attempts, delivery should be permanently marked as failed."""
        from app.tasks.worker import webhook_retry_task

        mock_delivery = MagicMock()
        mock_delivery.status = "pending"
        mock_delivery.attempts = 5

        ctx = {}
        with patch("app.database.SessionLocal") as mock_session_cls:
            mock_db = MagicMock()
            mock_session_cls.return_value = mock_db
            mock_db.query.return_value.filter.return_value.first.return_value = mock_delivery

            result = await webhook_retry_task(ctx, delivery_id=77)

        assert result == {"final_failure": True, "delivery_id": 77}
        assert mock_delivery.status == "failed"

    @pytest.mark.asyncio
    async def test_retry_task_delivers_correctly_on_success(self):
        """When retry succeeds, status should be set to 'success'."""
        from app.tasks.worker import webhook_retry_task

        mock_delivery = MagicMock()
        mock_delivery.status = "pending"
        mock_delivery.attempts = 2
        mock_delivery.subscription_id = 1
        mock_delivery.payload = {"event": "invoice.paid"}
        mock_delivery.event_type = "invoice.paid"
        mock_delivery.id = 55

        mock_sub = MagicMock()
        mock_sub.url = "https://partner.example.com/hook"
        mock_sub.secret = "whsec_abc"

        ctx = {}
        with patch("app.database.SessionLocal") as mock_session_cls, \
             patch("app.webhook_service._deliver", new_callable=AsyncMock) as mock_deliver:

            mock_db = MagicMock()
            mock_session_cls.return_value = mock_db
            mock_db.query.return_value.filter.return_value.first.side_effect = [
                mock_delivery, mock_sub
            ]
            mock_deliver.return_value = (True, 200, "OK")

            result = await webhook_retry_task(ctx, delivery_id=55)

        assert result == {"success": True, "delivery_id": 55}
        assert mock_delivery.status == "success"
        assert mock_delivery.attempts == 3
