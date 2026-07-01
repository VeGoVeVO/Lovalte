#!/bin/sh
set -eux

cd "${CI_PRIMARY_REPOSITORY_PATH:-${CI_WORKSPACE:-$(pwd)}}"

export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
export npm_config_cache="${TMPDIR:-/tmp}/npm-cache"

if ! command -v npm >/dev/null 2>&1; then
  if ! command -v brew >/dev/null 2>&1; then
    echo "npm was not found and Homebrew is unavailable."
    exit 127
  fi
  brew install node@22
fi

node --version
npm --version
npm ci
npm run sync:ios --workspace apps/web
