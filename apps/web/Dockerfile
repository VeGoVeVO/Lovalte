# syntax=docker/dockerfile:1
# ── Build the Vite SPA (build context = repo root) ───────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN npm ci
COPY apps/web apps/web
# The SPA calls the API at same-origin /api and /wallet (Caddy proxies them),
# so there is no build-time API URL to inject.
ARG APP_VERSION=0.0.0-dev
ENV VITE_APP_VERSION=$APP_VERSION
RUN npm run build --workspace apps/web

# ── Caddy serves the static SPA AND reverse-proxies the API (auto-HTTPS) ──────
FROM caddy:2-alpine AS runtime
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/apps/web/dist /srv
EXPOSE 80 443
