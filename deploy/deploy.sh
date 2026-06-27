#!/usr/bin/env bash
# Build images on the droplet, run migrations, restart. Idempotent.
# Called by CI (after `git pull`) and runnable by hand. No registry needed.
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root

set -a; . ./.env.production; set +a
C="docker compose -f docker-compose.prod.yml --env-file .env.production"

# Version = git commit count, as major.minor.patch where patch rolls 0→99 then
# bumps minor, minor rolls 0→9 then bumps major (0.0.99 → 0.1.0 → … → 1.0.0).
N=$(git rev-list --count HEAD)
APP_VERSION="$(( N / 1000 )).$(( (N / 100) % 10 )).$(( N % 100 ))"
echo "==> Building images (version $APP_VERSION, $N commits)"
docker build -f apps/api/Dockerfile -t "$API_IMAGE" .
docker build --build-arg APP_VERSION="$APP_VERSION" -f apps/web/Dockerfile -t "$WEB_IMAGE" .

echo "==> Running database migrations"
$C run --rm api node dist/db/migrate.js

echo "==> Starting / updating services"
$C up -d

echo "==> Pruning old images"
docker image prune -f

echo "==> Deployed. Status:"
$C ps
