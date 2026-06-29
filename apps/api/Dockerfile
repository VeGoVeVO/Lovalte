# syntax=docker/dockerfile:1
# ── Build the Fastify API (build context = repo root, for the npm workspace) ──
FROM node:22-alpine AS builder
WORKDIR /app
# Install deps against the lockfile (needs every workspace's package.json present).
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
# Compile + copy the forward-only SQL migrations next to the compiled runner,
# then drop dev dependencies so the runtime image ships prod-only node_modules.
COPY apps/api apps/api
RUN npm run build --workspace apps/api \
 && cp -r apps/api/src/db/migrations apps/api/dist/db/migrations \
 && npm prune --omit=dev --workspaces

# ── Minimal runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/apps/api/dist ./dist
COPY --from=builder --chown=node:node /app/apps/api/package.json ./package.json
USER node
EXPOSE 3001
# Lightweight liveness probe (no curl in alpine node image).
HEALTHCHECK --interval=30s --timeout=4s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
