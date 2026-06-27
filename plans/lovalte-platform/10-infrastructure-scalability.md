# 10 — Infrastructure & Scalability

> Implementation-ready reference for Lovalte's deployment topology, scaling strategy, caching, observability, CI/CD, and cost/SLO targets. Concrete — no hand-waving.

---

## 1. Deployment Topology

```
┌─────────────────────────────────────────────────────────────────┐
│  CDN (CloudFront / Cloudflare)                                  │
│  - Static React SPA (Vite build)                                │
│  - Signed .pkpass buffers (S3 origin, short TTL)               │
│  - Builder image assets (S3 origin, long TTL, immutable URLs)  │
└───────────────────┬─────────────────────────────────────────────┘
                    │
         ┌──────────▼──────────┐
         │  Load Balancer       │  (ALB / Nginx / Caddy)
         │  TLS termination     │  HTTP→HTTPS redirect
         │  /api/* → API tier   │  /* → SPA
         └──────────┬──────────┘
                    │
       ┌────────────▼────────────────────────────┐
       │  API Tier — Fastify (stateless)          │
       │  N × identical pods (Docker / ECS Fargate│
       │  or Kubernetes Deployment)               │
       │  Reads: req → Redis L1 → Postgres replica│
       │  Writes: req → Postgres primary          │
       └──────┬─────────────────┬────────────────┘
              │                 │
   ┌──────────▼──────┐   ┌──────▼─────────────────┐
   │  Redis Cluster   │   │  Postgres (primary)     │
   │  - Response cache│   │  + 1-2 read replicas    │
   │  - Rate limits   │   │  PgBouncer sidecar      │
   │  - QR nonce set  │   │  (transaction pool mode)│
   │  - BullMQ queues │   │  Row-Level Security on  │
   │  - Idempotency   │   │  every tenant table     │
   └─────────────────┘   └─────────────────────────┘
              │
   ┌──────────▼──────────────────────────────────────┐
   │  Worker Tier — BullMQ consumers (stateless)      │
   │  - apns-worker   : APNs push, retry w/ backoff   │
   │  - analytics-worker: event fan-out → read model  │
   │  - pkpass-worker : sign + upload .pkpass to S3   │
   └──────────────────────────────────────────────────┘
              │
   ┌──────────▼──────────────────────────────┐
   │  Object Storage (S3-compatible)          │
   │  Bucket: lovalte-passes                  │
   │    passes/{tenantId}/{serialNumber}.pkpass (signed presigned URL, 5 min TTL)
   │  Bucket: lovalte-assets                  │
   │    assets/{tenantId}/icon.png  strip.png  thumbnail.png  logo.png
   └──────────────────────────────────────────┘
```

**Process count rule-of-thumb (start small, scale on metrics):**

| Tier | Start | Scale trigger |
|---|---|---|
| API pods | 2 | CPU > 60 % sustained 3 min |
| apns-worker replicas | 2 | BullMQ `apns` queue depth > 500 |
| analytics-worker replicas | 2 | BullMQ `analytics` queue depth > 2 000 |
| pkpass-worker replicas | 1 | BullMQ `pkpass` queue depth > 50 |

---

## 2. Horizontal Scaling — API Layer

All Fastify instances are fully **stateless** (no local cache, no sticky sessions):

```typescript
// src/infrastructure/http/server.ts
const fastify = Fastify({ logger: pinoLogger });
fastify.register(fastifyRateLimit, {
  redis,                      // shared Redis — consistent across all pods
  max: 60, timeWindow: '1m',
  keyGenerator: (req) => req.ip,
});
```

- Session tokens are stateless JWTs (HS256, 15 min expiry; refresh token in HttpOnly cookie stored in Redis for revocation).
- `tenant_id` extracted from JWT sub-claim, validated on every request handler via `preHandler` hook.
- Health endpoint `GET /healthz` returns `{ db: ok, redis: ok }` — used by LB to drain unhealthy instances.

---

## 3. Postgres: Read Replicas + Connection Pooling

```
                      ┌──────────────────┐
API write path ──────▶│  Primary          │◀── worker writes
API read path ──────▶ │  Read Replica ×1  │    (async replication, <10 ms lag)
                      └──────────────────┘
```

**PgBouncer** runs as a sidecar on each DB host (transaction pool mode):

```ini
# pgbouncer.ini
[databases]
lovalte = host=pg-primary port=5432 dbname=lovalte
lovalte_ro = host=pg-replica-1 port=5432 dbname=lovalte

[pgbouncer]
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 20      ; per DB user
min_pool_size = 5
```

**Kysely configuration:**

```typescript
// src/infrastructure/db/kyselyConfig.ts
export const db = new Kysely<DB>({
  dialect: new PostgresDialect({
    pool: new Pool({ connectionString: process.env.DATABASE_URL }),  // primary
  }),
});
export const dbRo = new Kysely<DB>({
  dialect: new PostgresDialect({
    pool: new Pool({ connectionString: process.env.DATABASE_RO_URL }),  // replica
  }),
});
```

Query handlers use `dbRo` for reads; command handlers use `db` for writes. Repositories accept the connection as a constructor parameter (injected via DI).

**RLS policy pattern** (applied to every tenant-scoped table):

```sql
ALTER TABLE passes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON passes
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
-- Application sets: SET LOCAL app.tenant_id = '<id>'  inside each transaction.
```

---

## 4. Redis: Cache, Rate-Limiting, Idempotency, Queues

| Namespace | Key pattern | TTL | Purpose |
|---|---|---|---|
| Cache | `pass:v:{serial}:{version}` | 5 min | Signed .pkpass S3 URL |
| Cache | `template:{templateId}` | 10 min | PassTemplate DTO |
| Rate-limit | `rl:{ip}` | sliding 60 s | Per-IP API rate limiter |
| Rate-limit | `rl:scan:{staffId}` | sliding 10 s | Scan endpoint (5 req/10 s) |
| QR nonce | `qr:nonce:{nonce}` | 10 min | Single-use nonce; SET NX |
| Idempotency | `idem:scan:{scanId}` | 24 h | Redemption dedup |
| BullMQ | `bull:apns:*` | — | APNs push jobs |
| BullMQ | `bull:analytics:*` | — | Analytics event ingestion |
| BullMQ | `bull:pkpass:*` | — | Pass signing jobs |
| Session | `session:{jti}` | 7 d | Refresh token revocation set |

Redis is deployed as a **3-node cluster** (1 primary + 2 replicas, sentinel) for HA. Use `ioredis` in cluster mode:

```typescript
const redis = new Redis.Cluster([{ host: process.env.REDIS_HOST, port: 6379 }]);
```

---

## 5. BullMQ Workers

```
src/infrastructure/workers/
  apns.worker.ts          # consumes bull:apns queue
  analytics.worker.ts     # consumes bull:analytics queue
  pkpass.worker.ts        # consumes bull:pkpass queue; signs + uploads
```

**APNs worker** — handles Apple Push Notifications for pass updates:

```typescript
// src/infrastructure/workers/apns.worker.ts
const worker = new Worker('apns', async (job) => {
  const { pushToken, passTypeId } = job.data;
  await apnsAdapter.sendBackgroundPush({ pushToken, passTypeId, priority: 5 });
}, {
  connection: redis,
  concurrency: 20,
  limiter: { max: 200, duration: 1000 },  // 200 APNs pushes/sec per worker
});
worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'APNs push failed'));
```

APNs retry policy: `attempts: 5`, exponential backoff starting at 2 s. Dead-letter queue (`bull:apns:failed`) for manual inspection.

**pkpass worker** — signs and caches pass buffers:

```typescript
const worker = new Worker('pkpass', async (job) => {
  const { serialNumber, tenantId } = job.data;
  const passBuffer = await passSigner.sign(serialNumber);        // infra: passkit-generator
  const key = `passes/${tenantId}/${serialNumber}.pkpass`;
  await s3Client.putObject({ Bucket: 'lovalte-passes', Key: key, Body: passBuffer });
  await redis.setex(`pass:v:${serialNumber}:${job.data.version}`, 300, key);
}, { connection: redis, concurrency: 5 });
```

---

## 6. Object Storage + CDN

### Buckets

| Bucket | Contents | ACL | CDN |
|---|---|---|---|
| `lovalte-passes` | Signed .pkpass buffers | Private | No — presigned URL only |
| `lovalte-assets` | Builder images (icon, strip, logo, thumbnail) | Private | Yes — immutable, 1 y TTL |

**Pass delivery flow:**

```
Client downloads pass →
  API generates presigned S3 URL (5 min) →
  Client fetches directly from S3 (bypasses API tier)
```

**Asset upload:**

```typescript
// src/infrastructure/storage/s3AssetUploader.ts
await s3.putObject({
  Bucket: 'lovalte-assets',
  Key: `assets/${tenantId}/${hash}.png`,   // content-addressed; immutable URL
  ContentType: 'image/png',
  CacheControl: 'public, max-age=31536000, immutable',
});
```

### Caching Strategy for Signed Pass Buffers

```
PassFieldsUpdated event raised
  → pkpass-worker signs new buffer (version = lastUpdated epoch-ms)
  → uploads to S3 at passes/{tenantId}/{serial}.pkpass
  → writes Redis key  pass:v:{serial}:{version}  TTL 5 min
  → API GET /v1/passes/{serial}.pkpass
      checks Redis for cached S3 key → if hit return presigned URL
      else trigger pkpass-worker job (sync wait or 202 + poll)
```

Old version S3 objects are replaced in place; no versioning needed — the CDN-bypassed presigned URL always hits the latest object.

---

## 7. Observability

### Structured Logs (pino)

```typescript
const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  serializers: pino.stdSerializers,
  base: { service: 'lovalte-api', env: process.env.NODE_ENV },
});
// Every request log: { tenantId, userId, method, path, statusCode, durationMs, traceId }
```

Ship to **CloudWatch Logs** / **Loki** via pino transport. Never log PII (email/name) — log IDs only.

### Metrics (Prometheus + Grafana)

| Metric | Labels | Alert threshold |
|---|---|---|
| `http_request_duration_seconds` (histogram) | method, route, status | p99 > 500 ms |
| `bullmq_job_duration_seconds` (histogram) | queue | apns p95 > 3 s |
| `postgres_pool_wait_count` (gauge) | db | > 10 waiting |
| `redis_memory_used_bytes` (gauge) | — | > 80 % max |
| `qr_replay_rejected_total` (counter) | tenantId | > 10/min (fraud alert) |
| `apns_push_failed_total` (counter) | — | > 50/5 min |
| `cert_expiry_days` (gauge) | passTypeId | < 30 d → page on-call |

Expose `GET /metrics` (Prometheus scrape, internal only — not behind auth but firewall-restricted).

### Distributed Tracing (OpenTelemetry)

```typescript
// src/infrastructure/telemetry/otel.ts
const sdk = new NodeSDK({
  resource: new Resource({ [SemanticResourceAttributes.SERVICE_NAME]: 'lovalte-api' }),
  traceExporter: new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT }),
  instrumentations: [getNodeAutoInstrumentations()],
});
sdk.start();
```

Trace every inbound request → DB query → Redis op → queue publish. `traceId` propagated in all log lines.

### Certificate Expiry Alert

```typescript
// src/infrastructure/jobs/certExpiryCheck.ts  (cron: daily)
const cert = await keyStore.getPassCert(passTypeId);
const daysLeft = differenceInDays(cert.notAfter, new Date());
metrics.setGauge('cert_expiry_days', daysLeft, { passTypeId });
if (daysLeft < 30) await alerting.page('cert-expiry', { passTypeId, daysLeft });
```

---

## 8. CI/CD Pipeline

```
┌──────────────────────────────────────────────────────────┐
│  Stage 1: lint + typecheck                               │
│    eslint --max-warnings 0                               │
│    tsc --noEmit                                          │
│  Stage 2: unit + integration tests                        │
│    vitest run --coverage  (frontend)                     │
│    node --test  (backend domain + application layers)    │
│    Postgres + Redis via Docker Compose                   │
│  Stage 3: build Docker images                            │
│    docker buildx build --platform linux/amd64 ...       │
│    Push to ECR / GHCR (tag = git sha)                   │
│  Stage 4: deploy to staging                              │
│    kubectl set image / ecs update-service                │
│    Run smoke tests + Playwright E2E                      │
│  Stage 5: promote to production (manual gate)            │
│    Blue/green deploy; shift traffic 10 % → 100 %        │
│    Auto-rollback if p99 latency spikes > 2 s within 5 min│
└──────────────────────────────────────────────────────────┘
```

Branch strategy: `main` = production; `dev` = staging auto-deploy; feature branches deploy to ephemeral preview envs (Vite preview + stub API).

---

## 9. Secrets & Environment Management

All runtime secrets fetched from **AWS Secrets Manager** (or Vault) at startup; NEVER committed to the repo or stored in the DB.

| Secret | Key in store | Rotation |
|---|---|---|
| Postgres password | `lovalte/prod/pg-password` | 90 d, auto |
| Redis auth token | `lovalte/prod/redis-auth` | 180 d |
| JWT signing key | `lovalte/prod/jwt-secret` | 90 d (dual-key rollover) |
| Pass signing cert (.p12 + passphrase) | `lovalte/prod/pass-cert` | on Apple renewal |
| WWDR G4 cert | `lovalte/prod/wwdr-g4` | on Apple renewal |
| S3 credentials | IAM role (no key needed on EC2/ECS) | — |
| APNs private key | `lovalte/prod/apns-key` | on Apple renewal |

```typescript
// src/infrastructure/secrets/secretsManager.ts
export async function getSecret(name: string): Promise<string> {
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION });
  const res = await client.send(new GetSecretValueCommand({ SecretId: name }));
  return res.SecretString!;
}
```

Secrets cached in-process for 5 min (avoid per-request latency). Environment-specific config (`DATABASE_URL`, `REDIS_URL`, etc.) injected as container env vars from the deploy system; no `.env` files in production images.

---

## 10. SLOs & Capacity Notes

| SLO | Target | Measure |
|---|---|---|
| API availability | 99.9 % monthly | LB 5xx rate |
| Pass download latency (p95) | < 400 ms | CloudFront + API combined |
| QR scan → redemption latency (p99) | < 600 ms | trace span |
| APNs push delivery (p95) | < 10 s from event | BullMQ job `completedOn - timestamp` |
| Postgres backup RPO | < 5 min | WAL streaming to S3 |
| Postgres RTO | < 15 min | Failover to replica |

**Capacity (starting, 10k active passes, ~50 tenants):**

| Resource | Spec | Monthly est. (USD) |
|---|---|---|
| API (2 × Fargate 0.5 vCPU / 1 GB) | On-demand | ~$40 |
| Worker (2 × Fargate 0.25 vCPU / 512 MB) | On-demand | ~$20 |
| Postgres (db.t4g.medium, 1 replica) | RDS | ~$100 |
| Redis (cache.t4g.small, 3-node) | ElastiCache | ~$60 |
| S3 + CloudFront | Pay-per-use | ~$5 |
| **Total baseline** | | **~$225/mo** |

Scale inflection: at ~200 tenants / 500k passes, migrate Postgres to `db.r7g.large` with connection pooling tuned to 50 connections per PgBouncer pool; add a second read replica; split analytics writes to a separate Postgres schema or TimescaleDB instance.

---

## 11. Multi-Region Considerations

**Phase 1 (launch):** single AWS region (e.g. `us-east-1`). CDN provides global edge caching for static assets.

**Phase 2 (when EU/APAC tenants onboard):**

- **Tenant-pinned regions**: each tenant's `tenant_id` maps to a home region; all their data lives in that region's Postgres cluster. Cross-region read is not needed.
- **Global load balancer** (Route 53 latency routing) directs `api.lovalte.app` to the nearest regional API cluster.
- **Pass signing**: certificates are region-scoped (Apple Wallet `passTypeIdentifier` is per-cert; each region holds its own cert in Secrets Manager).
- **APNs**: HTTP/2 connections to `api.push.apple.com` — stateless; any region can push to any device.
- **GDPR**: EU tenants provisioned exclusively in `eu-west-1` or `eu-central-1`; no transatlantic PII transfer.
- Shared Redis across regions is **not** used — each region has its own cluster to avoid cross-region latency for nonce checks.
