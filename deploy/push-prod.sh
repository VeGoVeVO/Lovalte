#!/usr/bin/env bash
# Push current main live to prod: SSH to the droplet, pull, build, migrate, restart.
# Mirrors what CI does (.github/workflows/deploy.yml) but runnable on demand.
#
#   bash deploy/push-prod.sh
#
# Requires: the droplet deploy key loaded in your ssh agent / default key
# (same one your interactive `ssh deploy@164.92.243.43` already uses).
set -euo pipefail

HOST="${DEPLOY_HOST:-deploy@164.92.243.43}"
APP_DIR="${DEPLOY_APP_DIR:-/home/deploy/Lovalte}"

echo "==> Deploying to $HOST:$APP_DIR"
ssh -o ConnectTimeout=20 "$HOST" \
  "cd '$APP_DIR' && git pull --ff-only && bash deploy/deploy.sh"
echo "==> Live."
