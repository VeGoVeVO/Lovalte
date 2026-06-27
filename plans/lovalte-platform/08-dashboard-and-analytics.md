# 08 — Dashboard & Analytics

> Implementation-ready specification. Analytics bounded context is a **read model only** (CQRS write side = domain events + BullMQ ingestion; read side = `analytics_events` append-only table + rollup materialized views + REST query API). Never share domain objects across contexts — consume events via Anti-Corruption Layer.

---

## 1. Page Map (React Router, `presentation/dashboard/`)

| Route | Component file | Access |
|---|---|---|
| `/` | `OverviewPage.tsx` | owner, manager |
| `/members` | `MembersPage.tsx` | owner, manager |
| `/scans` | `ScansPage.tsx` | owner, manager, staff |
| `/card-editor` | redirect → Card Builder | owner |
| `/analytics` | `AnalyticsPage.tsx` | owner, manager |
| `/settings` | `SettingsPage.tsx` | owner |
| `/settings/staff` | `StaffPage.tsx` | owner |

Layout shell: `DashboardShell.tsx` — frosted-glass sidebar using `--halo-surface-glass`, `--halo-blur`, `--halo-border-subtle` design tokens. RBAC gate: `<RequireRole roles={["owner","manager"]} />` HOC reads from Zustand `useAuthStore`.

---

## 2. Overview KPI Cards (`OverviewPage.tsx`)

Six KPI cards rendered in a `<KpiGrid>` (CSS Grid, 3 cols desktop / 2 tablet / 1 mobile):

| KPI | Source table/view | Recharts component |
|---|---|---|
| Active members (30 d) | `mv_member_activity_30d` | `<RadialBarChart>` sparkline |
| New members this month | `mv_member_cohorts` | `<AreaChart>` mini |
| Points issued vs redeemed | `mv_points_flow_daily` | `<BarChart>` stacked |
| Redemption rate (%) | `mv_redemption_rate_7d` | `<PieChart>` donut |
| Peak hour heatmap | `mv_scan_hourly` | custom `<Cell>` heatmap |
| Points liability (balance × avg value) | `mv_points_liability` | `<LineChart>` |

Data fetched with TanStack Query, `staleTime: 60_000`. Polling interval 30 s on `/api/v1/analytics/overview`.

---

## 3. Event Model — `analytics_events` (append-only)

### 3.1 Table DDL

```sql
-- migrations/0008_analytics_events.sql
CREATE TABLE analytics_events (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     UUID        NOT NULL,
  event_type    TEXT        NOT NULL CHECK (event_type IN (
                  'scan','redeem','pass_issued','pass_added',
                  'points_earned','points_redeemed','member_created',
                  'tier_upgraded','pass_voided')),
  member_id     UUID,
  pass_id       UUID,
  location_id   UUID,
  staff_user_id UUID,
  points_delta  INT,
  metadata      JSONB       NOT NULL DEFAULT '{}',
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY RANGE (occurred_at);

-- Monthly partitions (automate with pg_partman or cron)
CREATE TABLE analytics_events_2026_06
  PARTITION OF analytics_events
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

-- RLS: every query MUST supply tenant_id
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON analytics_events
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE INDEX ON analytics_events (tenant_id, occurred_at DESC);
CREATE INDEX ON analytics_events (tenant_id, event_type, occurred_at DESC);
CREATE INDEX ON analytics_events (tenant_id, member_id, occurred_at DESC);
```

**Append-only invariant:** no UPDATE or DELETE; corrections via compensating events. `metadata` holds event-specific fields (e.g. `{ "scan_token_nonce": "...", "tier_before": "silver", "tier_after": "gold" }`).

### 3.2 Event Shapes (TypeScript, `domain/analytics/`)

```ts
// domain/analytics/AnalyticsEvent.ts  (<300 lines total including all variants)
export type EventType =
  | 'scan' | 'redeem' | 'pass_issued' | 'pass_added'
  | 'points_earned' | 'points_redeemed' | 'member_created'
  | 'tier_upgraded' | 'pass_voided';

export interface AnalyticsEventPayload {
  tenantId:    string;
  eventType:   EventType;
  memberId?:   string;
  passId?:     string;
  locationId?: string;
  staffUserId?:string;
  pointsDelta?:number;
  metadata:    Record<string, unknown>;
  occurredAt:  Date;
}
```

---

## 4. Ingestion Pipeline (BullMQ → Postgres)

```
Domain event bus (in-process EventEmitter or Redis Streams)
  └─ AnalyticsEventProducer  [infrastructure/analytics/AnalyticsEventProducer.ts]
       └─ BullMQ queue  "analytics-ingest"  (Redis, maxRetries 5, backoff exponential)
            └─ AnalyticsWorker  [infrastructure/analytics/AnalyticsWorker.ts]
                 └─ INSERT INTO analytics_events  (parameterized, batched 50/flush or 200 ms)
```

`AnalyticsEventProducer` listens on these domain events (Anti-Corruption Layer maps domain → `AnalyticsEventPayload`):

| Domain event (source context) | analytics `event_type` |
|---|---|
| `ScanRecorded` (Scanning&Redemption) | `scan` |
| `RedemptionApplied` | `redeem` |
| `PassIssued` (Pass Issuance) | `pass_issued` |
| `DeviceRegistered` (Delivery) | `pass_added` |
| `PointsEarned` (Loyalty) | `points_earned` |
| `PointsRedeemed` | `points_redeemed` |
| `MemberCreated` | `member_created` |
| `TierUpgraded` | `tier_upgraded` |
| `PassVoided` | `pass_voided` |

Worker file `infrastructure/analytics/AnalyticsWorker.ts`:
```ts
// Batched insert — parameterized, never string concat
async function flushBatch(rows: AnalyticsEventPayload[], db: Kysely<DB>) {
  await db.insertInto('analytics_events')
    .values(rows.map(r => ({
      tenant_id:     r.tenantId,
      event_type:    r.eventType,
      member_id:     r.memberId ?? null,
      pass_id:       r.passId ?? null,
      location_id:   r.locationId ?? null,
      staff_user_id: r.staffUserId ?? null,
      points_delta:  r.pointsDelta ?? null,
      metadata:      JSON.stringify(r.metadata),
      occurred_at:   r.occurredAt,
    })))
    .execute();
}
```

---

## 5. Rollup Tables & Materialized Views

Refreshed by a **BullMQ scheduled job** (`analytics-rollup`, cron `*/15 * * * *`) or `pg_cron`.

```sql
-- mv_member_activity_30d: active members per tenant last 30 days
CREATE MATERIALIZED VIEW mv_member_activity_30d AS
SELECT tenant_id,
       COUNT(DISTINCT member_id) AS active_members
FROM   analytics_events
WHERE  event_type IN ('scan','redeem','points_earned')
  AND  occurred_at >= now() - INTERVAL '30 days'
GROUP  BY tenant_id;

CREATE UNIQUE INDEX ON mv_member_activity_30d (tenant_id);

-- mv_points_flow_daily: daily issued vs redeemed
CREATE MATERIALIZED VIEW mv_points_flow_daily AS
SELECT tenant_id,
       occurred_at::DATE            AS day,
       SUM(CASE WHEN event_type = 'points_earned'   THEN points_delta ELSE 0 END) AS issued,
       SUM(CASE WHEN event_type = 'points_redeemed' THEN ABS(points_delta) ELSE 0 END) AS redeemed
FROM   analytics_events
WHERE  event_type IN ('points_earned','points_redeemed')
  AND  occurred_at >= now() - INTERVAL '90 days'
GROUP  BY tenant_id, day;

CREATE UNIQUE INDEX ON mv_points_flow_daily (tenant_id, day);

-- mv_scan_hourly: heatmap data (hour of day × day of week)
CREATE MATERIALIZED VIEW mv_scan_hourly AS
SELECT tenant_id,
       EXTRACT(DOW  FROM occurred_at) AS dow,
       EXTRACT(HOUR FROM occurred_at) AS hour,
       COUNT(*)                        AS scan_count
FROM   analytics_events
WHERE  event_type = 'scan'
  AND  occurred_at >= now() - INTERVAL '28 days'
GROUP  BY tenant_id, dow, hour;

CREATE UNIQUE INDEX ON mv_scan_hourly (tenant_id, dow, hour);

-- mv_redemption_rate_7d
CREATE MATERIALIZED VIEW mv_redemption_rate_7d AS
SELECT tenant_id,
       COUNT(*) FILTER (WHERE event_type = 'redeem')::NUMERIC /
       NULLIF(COUNT(*) FILTER (WHERE event_type = 'scan'), 0) AS rate
FROM   analytics_events
WHERE  occurred_at >= now() - INTERVAL '7 days'
GROUP  BY tenant_id;

CREATE UNIQUE INDEX ON mv_redemption_rate_7d (tenant_id);

-- mv_points_liability: SUM of all unredeemed points per tenant
CREATE MATERIALIZED VIEW mv_points_liability AS
SELECT tenant_id,
       SUM(points_delta) AS liability_points
FROM   analytics_events
WHERE  event_type IN ('points_earned','points_redeemed')
GROUP  BY tenant_id;

CREATE UNIQUE INDEX ON mv_points_liability (tenant_id);

-- mv_member_cohorts: new members per month
CREATE MATERIALIZED VIEW mv_member_cohorts AS
SELECT tenant_id,
       DATE_TRUNC('month', occurred_at) AS month,
       COUNT(*) AS new_members
FROM   analytics_events
WHERE  event_type = 'member_created'
GROUP  BY tenant_id, month;

CREATE UNIQUE INDEX ON mv_member_cohorts (tenant_id, month);
```

Refresh procedure (called by BullMQ job):
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_member_activity_30d;
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_points_flow_daily;
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_scan_hourly;
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_redemption_rate_7d;
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_points_liability;
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_member_cohorts;
```

---

## 6. Query Examples (parameterized — Kysely)

```ts
// application/analytics/queries/GetOverviewQuery.ts

// Active members
const active = await db
  .selectFrom('mv_member_activity_30d')
  .select('active_members')
  .where('tenant_id', '=', tenantId)   // bound param — never interpolated
  .executeTakeFirst();

// Points flow last N days
const flow = await db
  .selectFrom('mv_points_flow_daily')
  .select(['day', 'issued', 'redeemed'])
  .where('tenant_id', '=', tenantId)
  .where('day', '>=', sql<Date>`now() - make_interval(days => ${days})`)
  .orderBy('day', 'asc')
  .execute();

// Scan heatmap
const heatmap = await db
  .selectFrom('mv_scan_hourly')
  .select(['dow', 'hour', 'scan_count'])
  .where('tenant_id', '=', tenantId)
  .execute();

// Per-location breakdown (raw analytics_events, scoped by tenant RLS)
const byLocation = await db
  .selectFrom('analytics_events')
  .select(['location_id', db.fn.count('id').as('scans')])
  .where('tenant_id', '=', tenantId)         // belt-and-suspenders; RLS also enforces
  .where('event_type', '=', 'scan')
  .where('occurred_at', '>=', sql`now() - INTERVAL '30 days'`)
  .groupBy('location_id')
  .execute();
```

---

## 7. CQRS Read-Model API (`presentation/rest/analytics/`)

All routes prefixed `/api/v1/analytics`. Auth: `verifyJWT` + `requireRole(['owner','manager'])` Fastify hooks. `tenant_id` extracted from JWT, never from request body.

| GET endpoint | Handler | Response |
|---|---|---|
| `/overview` | `getOverviewHandler` | `{ activeMembers, newThisMonth, pointsFlow[], redemptionRate, liability }` |
| `/members?page&q` | `getMembersHandler` | paginated member list with points + tier |
| `/scans/feed?after` | `getScansFeedHandler` | `{ events[], cursor }` (cursor-based, DESC) |
| `/heatmap` | `getHeatmapHandler` | `{ cells: [{dow,hour,count}] }` |
| `/cohorts` | `getCohortsHandler` | `{ months: [{month,newMembers}] }` |
| `/points-liability` | `getLiabilityHandler` | `{ liabilityPoints, estimatedValue }` |

Rate limit: 120 req/min per tenant (Redis sliding window via `fastify-rate-limit`). Response cache: `GET /overview` cached 30 s in Redis keyed `analytics:overview:{tenantId}`. Cache invalidated by rollup job after refresh.

---

## 8. Real-Time Scan Feed (SSE)

```
GET /api/v1/analytics/scans/stream
  Accept: text/event-stream
  Authorization: Bearer <jwt>
```

Server-Sent Events handler (`presentation/rest/analytics/scanStreamHandler.ts`):
- On connect: send last 20 events from `analytics_events` (ORDER BY occurred_at DESC LIMIT 20).
- Poll `analytics_events` every **5 s** with `WHERE occurred_at > $lastSeen AND tenant_id = $tenantId` (parameterized). Push new rows as `data: <JSON>\n\n`.
- Keep-alive comment `": ping\n\n"` every 25 s (proxy timeout prevention).
- Max 200 concurrent SSE connections per tenant (reject 429 above threshold).

Frontend (`ScansPage.tsx`): use `EventSource` wrapped in a custom hook `useScanStream()`. TanStack Query manages the REST feed; SSE updates the live list via Zustand `useScanFeedStore`.

---

## 9. Analytics Page — Chart Assignments (`AnalyticsPage.tsx`)

| Metric | Recharts component | Config notes |
|---|---|---|
| Daily points issued vs redeemed (90 d) | `<BarChart>` stacked bars | Two `<Bar>` — `issued` (#halo-accent), `redeemed` (#halo-warning) |
| Active members trend (daily, 30 d) | `<AreaChart>` | `<Area type="monotone">`, gradient fill |
| New vs returning members | `<PieChart>` donut | `innerRadius={60}`, two `<Pie>` cells |
| Redemption rate trend (14 d) | `<LineChart>` | Single `<Line>` with reference line at 20% |
| Peak hours heatmap (7×24) | Custom `<ResponsiveContainer>` + `<Cell>` grid | Map `mv_scan_hourly.scan_count` → fill opacity |
| Per-location scan count | `<BarChart>` horizontal | `layout="vertical"`, `<YAxis type="category">` |
| Points liability over time | `<LineChart>` | `<ReferenceLine>` at 0; fill area below = exposure zone |
| Member cohort retention | `<BarChart>` grouped | Months on X; bars = new / retained |

All charts: `<ResponsiveContainer width="100%" height={260}>`. Colors from CSS custom properties via `getComputedStyle` — not hardcoded hex.

---

## 10. Members Page (`MembersPage.tsx`)

Table columns: Name, Email (masked per GDPR — last 3 chars before @), Points balance, Tier, Last scan date, Pass status (active/voided). Pagination: cursor-based (`after=<memberId>`), 25 per page.

Search (`q=` param): full-text on `members.name` via `to_tsvector`; bounded to tenant. Staff role sees name + points only (no email).

Actions (owner/manager): Adjust points (opens modal → `POST /api/v1/members/:id/adjust-points`), Void pass (`DELETE /api/v1/passes/:passId`). Both actions written to **audit_log** (append-only, same RLS pattern).

---

## 11. Staff Management (`StaffPage.tsx` / `SettingsPage.tsx`)

Invite flow: owner enters email → `POST /api/v1/staff/invite` → creates `tenant_invitations` row + sends email (BullMQ Notifications queue). Invitee clicks link → `POST /api/v1/staff/accept/:token` → creates `tenant_memberships` with role `staff` or `manager`. Token: HMAC-SHA256 signed, 48 h TTL, single-use (Redis nonce check).

Table: list `tenant_memberships JOIN users` for tenant. Columns: Name, Email, Role, Joined, Last login. Actions: Change role (manager/staff), Revoke access.

---

## 12. Security & Multi-Tenant Notes

- `SET LOCAL app.tenant_id = $1` at start of every DB transaction; RLS policies enforce it on **every** analytics table and view.
- Analytics query handlers **never** accept `tenant_id` from request body — always from verified JWT claim.
- `metadata` JSONB column: sanitize/strip PII fields (names, emails) before insertion; store only IDs + behavioural signals.
- Audit log (`audit_log` table, append-only, RLS) records: `pass_voided`, `points_adjusted`, `staff_invited`, `staff_revoked`, `role_changed`. Each row: `(tenant_id, actor_user_id, action, target_id, before_state JSONB, after_state JSONB, occurred_at)`.
- GDPR: `DELETE /api/v1/members/:id/gdpr-erase` anonymises `analytics_events` rows for that member (`UPDATE … SET member_id = NULL, metadata = '{}'`) and hard-deletes PII from `members`. Requires owner role + 2FA confirmation.
