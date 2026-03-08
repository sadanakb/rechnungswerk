# RechnungsWerk — Deployment-Anleitung

## 1. Hetzner VPS bestellen

- Empfehlung: **CX22** (2 vCPU, 4 GB RAM) oder **CX32** (4 vCPU, 8 GB RAM)
- Betriebssystem: **Ubuntu 24.04**
- Standort: Falkenstein oder Nuernberg (DSGVO-konform)
- SSH-Key beim Erstellen hinterlegen

## 2. Server vorbereiten

```bash
# System aktualisieren
apt update && apt upgrade -y

# Docker installieren
curl -fsSL https://get.docker.com | sh

# Docker Compose ist in aktuellen Docker-Versionen enthalten
docker compose version

# Firewall einrichten
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw enable
```

## 3. Repository klonen

```bash
git clone https://github.com/DEIN-USER/rechnungswerk.git /opt/rechnungswerk
cd /opt/rechnungswerk
```

## 4. Umgebungsvariablen konfigurieren

```bash
cp .env.example .env
nano .env
```

Folgende Werte muessen gesetzt werden:

| Variable | Beschreibung | Beispiel |
|----------|-------------|----------|
| `DB_PASSWORD` | PostgreSQL-Passwort | sicheres-passwort-generieren |
| `STRIPE_SECRET_KEY` | Stripe Secret Key | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook Secret | `whsec_...` |

Passwort generieren:
```bash
openssl rand -base64 32
```

## 5. Domain + DNS konfigurieren

Beim Domain-Anbieter einen **A-Record** setzen:

| Typ | Name | Ziel |
|-----|------|------|
| A | rechnungswerk.de | `DEINE_SERVER_IP` |
| A | www.rechnungswerk.de | `DEINE_SERVER_IP` |

DNS-Propagation pruefen:
```bash
dig rechnungswerk.de +short
```

## 6. Caddyfile anpassen

Die Datei `Caddyfile` enthaelt bereits die Konfiguration fuer `rechnungswerk.de`.
Caddy holt automatisch ein Let's-Encrypt-Zertifikat.

Falls du eine andere Domain nutzt, passe die erste Zeile an:
```
deine-domain.de {
    ...
}
```

## 7. Starten

```bash
cd /opt/rechnungswerk
docker compose up -d
```

Erster Start dauert laenger (Container werden gebaut, Alembic-Migrationen laufen).

Status pruefen:
```bash
docker compose ps
docker compose logs backend --tail 50
```

Health-Check:
```bash
curl -f http://localhost:8001/api/health
```

## 8. Backup-Cron einrichten

```bash
crontab -e
```

Folgende Zeile hinzufuegen (taeglich um 03:00 Uhr):
```
0 3 * * * cd /opt/rechnungswerk && ./scripts/backup.sh >> /var/log/rechnungswerk-backup.log 2>&1
```

Optionaler S3-Upload (Hetzner Object Storage oder AWS):
```bash
# In .env oder als System-Umgebungsvariablen:
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export BACKUP_BUCKET=rechnungswerk-backups
```

## 9. Uptime Kuma konfigurieren

Uptime Kuma laeuft auf Port 3002. Beim ersten Aufruf:

1. `http://DEINE_SERVER_IP:3002` oeffnen
2. Admin-Account erstellen
3. Monitor hinzufuegen:
   - Typ: HTTP(s)
   - URL: `http://backend:8001/api/health`
   - Intervall: 60 Sekunden

## Updates deployen

```bash
cd /opt/rechnungswerk
./scripts/deploy.sh
```

Oder manuell:
```bash
git pull origin master
docker compose build
docker compose up -d
```

## Datenbank-Backups

### Restore

```bash
gunzip < backup.sql.gz | docker compose exec -T db psql -U rw rechnungswerk
```

### Restore testen

Es wird empfohlen, regelmaessig einen Restore auf einer Test-Instanz durchzufuehren,
um die Integritaet der Backups sicherzustellen.

## Troubleshooting

### Container starten nicht
```bash
docker compose logs <service-name>
```

### Datenbank-Migrationen schlagen fehl
```bash
docker compose exec backend alembic history
docker compose exec backend alembic current
```

### Caddy bekommt kein Zertifikat
- DNS muss korrekt auf die Server-IP zeigen
- Ports 80 und 443 muessen offen sein
- `docker compose logs caddy` pruefen
