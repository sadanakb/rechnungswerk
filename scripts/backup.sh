#!/bin/bash
# RechnungsWerk Database Backup
# Aufruf via Cron: 0 3 * * * /path/to/rechnungswerk/scripts/backup.sh

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="rechnungswerk_${TIMESTAMP}.sql.gz"
RETENTION_DAYS=30

mkdir -p "${BACKUP_DIR}"

# Dump und komprimieren
docker compose exec -T db pg_dump -U rw rechnungswerk | gzip > "${BACKUP_DIR}/${BACKUP_FILE}"

# Optional: Upload zu S3/Hetzner Object Storage
if [ -n "${AWS_ACCESS_KEY_ID:-}" ] && [ -n "${BACKUP_BUCKET:-}" ]; then
    aws s3 cp "${BACKUP_DIR}/${BACKUP_FILE}" "s3://${BACKUP_BUCKET}/db-backups/${BACKUP_FILE}"
    echo "[$(date)] Backup uploaded to S3: ${BACKUP_FILE}"
fi

# Alte lokale Backups loeschen
find "${BACKUP_DIR}" -name "rechnungswerk_*.sql.gz" -mtime +${RETENTION_DAYS} -delete

echo "[$(date)] Backup erstellt: ${BACKUP_FILE}"
