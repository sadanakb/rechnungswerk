#!/bin/bash
set -e
echo "[Entrypoint] Running database migrations..."
alembic upgrade head
echo "[Entrypoint] Starting application..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8001 --workers 4
