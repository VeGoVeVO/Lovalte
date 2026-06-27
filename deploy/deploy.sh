#!/usr/bin/env bash
# Pull pre-built images (built in CI), run DB migrations, restart. Idempotent.
# The droplet never builds — images come from the registry (GHCR).
# Requires a one-time `docker login ghcr.io` on the droplet (see deploy/README.md).
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root

COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.production"

echo "==> Pulling latest images"
$COMPOSE pull

echo "==> Running database migrations"
$COMPOSE run --rm api node dist/db/migrate.js

echo "==> Starting / updating services"
$COMPOSE up -d

echo "==> Pruning old images"
docker image prune -f

echo "==> Deployed. Status:"
$COMPOSE ps
