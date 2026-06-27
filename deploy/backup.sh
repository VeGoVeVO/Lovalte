#!/usr/bin/env bash
# Nightly Postgres backup (gzip pg_dump), keeps 7 days locally.
# Schedule with cron on the droplet:
#   crontab -e
#   0 3 * * * /home/deploy/Lovalte/deploy/backup.sh >> /home/deploy/backup.log 2>&1
#
# Off-site copy (recommended): uncomment the rclone block and configure a remote
# pointing at a DigitalOcean Space (S3-compatible). A dropped droplet = lost data
# without an off-site copy.
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root

set -a; . ./.env.production; set +a
BACKUP_DIR="${BACKUP_DIR:-./backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/lovalte-$STAMP.sql.gz"
mkdir -p "$BACKUP_DIR"

echo "==> Dumping database to $OUT"
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "$OUT"

echo "==> Pruning backups older than 7 days"
find "$BACKUP_DIR" -name 'lovalte-*.sql.gz' -mtime +7 -delete

# ── Off-site copy to a DigitalOcean Space (optional but recommended) ──────────
# rclone copy "$OUT" do-space:lovalte-backups/   # configure with: rclone config

echo "==> Backup complete: $OUT"
