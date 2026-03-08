#!/bin/bash
set -euo pipefail
echo "=== RechnungsWerk Deploy ==="
cd /opt/rechnungswerk
echo "[1/4] Pulling latest code..."
git pull origin master
echo "[2/4] Building containers..."
docker compose build
echo "[3/4] Starting services..."
docker compose up -d
echo "[4/4] Checking health..."
sleep 10
curl -sf http://localhost:8001/api/health || echo "WARNING: Health check failed"
echo "=== Deploy complete ==="
