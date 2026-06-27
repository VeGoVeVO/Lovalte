#!/usr/bin/env bash
# Build images on the droplet, run migrations, restart. Idempotent.
# Called by CI (after `git pull`) and runnable by hand. No registry needed.
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root

set -a; . ./.env.production; set +a
C="docker compose -f docker-compose.prod.yml --env-file .env.production"

echo "==> Building images"
docker build -f apps/api/Dockerfile -t "$API_IMAGE" .
docker build -f apps/web/Dockerfile -t "$WEB_IMAGE" .

echo "==> Running database migrations"
$C run --rm api node dist/db/migrate.js

echo "==> Starting / updating services"
$C up -d

echo "==> Pruning old images"
docker image prune -f

echo "==> Deployed. Status:"
$C ps
