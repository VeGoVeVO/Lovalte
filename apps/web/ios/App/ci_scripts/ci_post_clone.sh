#!/bin/sh
set -e

cd "$CI_WORKSPACE"

export npm_config_cache="${TMPDIR:-/tmp}/npm-cache"

npm ci
npm run sync:ios --workspace apps/web
