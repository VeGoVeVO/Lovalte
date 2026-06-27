# 12 — Lovalte Implementation Roadmap

> Milestone-based build order. Every milestone has a concrete file list (DDD layer assignment), dependencies, and a Definition of Done gate. The master file inventory follows. All files stay ≤ 300–400 lines.

---

## M0 — Scaffold + CI (Day 0–2)

**Goals:** mono-repo skeleton, shared config, CI pipeline green on empty project.

### Files to create

| Layer | File | Description |
|---|---|---|
| root | `package.json` (workspaces) | `apps/api`, `apps/web`, `packages/shared-types` |
| root | `turbo.json` | build/test/lint pipeline |
| root | `.github/workflows/ci.yml` | typecheck + build + test + Vitest on PR |
| `apps/api` | `tsconfig.json`, `biome.json` | strict TS, lint |
| `apps/api` | `src/index.ts` | Fastify server bootstrap (≤80 lines) |
| `apps/api` | `src/config.ts` | env schema (zod), fail-fast on bad env |
| `apps/web` | `vite.config.ts`, `tsconfig.json` | React 19 + path aliases |
| `packages/shared-types` | `src/index.ts` | tenant, member, pass DTOs shared across apps |

**Dependencies:** None (greenfield).

**Definition of Done:**
- `npm run build` exits 0 across all workspaces.
- `npm run typecheck` zero errors.
- CI passes on an empty push to `main`.
- No secrets in repo; `.env.example` documents all required vars.

---

## M1 — Identity & Tenancy (Week 1)

**Goals:** Tenant sign-up, user login, RBAC (owner/manager/staff), multi-tenant isolation enforced at DB level.

### Bounded context: Identity & Access

#### Domain layer — `apps/api/src/domain/identity/`

| File | Contents |
|---|---|
| `Tenant.ts` | `Tenant` aggregate root; `TenantId` VO; `TenantCreated` event |
| `User.ts` | `User` aggregate; `UserId`, `Email`, `HashedPassword` VOs; `Role` enum |
| `TenantMembership.ts` | entity linking `UserId` ↔ `TenantId` with `Role` |
| `ports/ITenantRepository.ts` | interface |
| `ports/IUserRepository.ts` | interface |

#### Application layer — `apps/api/src/application/identity/`

| File | Contents |
|---|---|
| `CreateTenantCommand.ts` | handler: create Tenant + owner User atomically |
| `InviteUserCommand.ts` | handler: create User with role, emit `UserInvited` |
| `LoginQuery.ts` | verify credentials, return signed JWT DTO |
| `dtos.ts` | `TenantDTO`, `UserDTO` (never expose domain objects) |

#### Infrastructure layer — `apps/api/src/infrastructure/identity/`

| File | Contents |
|---|---|
| `SqlTenantRepository.ts` | Kysely, maps row ↔ `Tenant` |
| `SqlUserRepository.ts` | Kysely |
| `migrations/001_identity.sql` | `tenants`, `users`, `tenant_memberships`; `tenant_id` FK + RLS policy |

#### Presentation layer — `apps/api/src/presentation/identity/`

| File | Contents |
|---|---|
| `authRoutes.ts` | `POST /auth/register`, `POST /auth/login` → zod-validated, returns JWT |
| `tenantRoutes.ts` | `GET /tenants/me`, `POST /tenants/:id/invite` — RBAC guard |

**Dependencies:** M0.

**DoD:** RLS active (`SET app.tenant_id`); RBAC middleware returns 403 on wrong role; JWT RS256 signed (private key in secret store); rate-limit 5 req/min on `/auth/login`.

---

## M2 — Card Builder & Templates (Week 2–3)

**Goals:** Visual builder UI; `CardTemplate` aggregate persisted; image upload to S3; preview rendering.

### Bounded context: Card Design / Builder

#### Domain layer — `apps/api/src/domain/builder/`

| File | Contents |
|---|---|
| `CardTemplate.ts` | `CardTemplate` aggregate; `CardTemplateId`, `RgbColor`, `TemplateField` VOs; `TemplatePublished` event |
| `TemplateValidator.ts` | domain service: validates field count (≤4 secondary+aux with QR), color format `rgb()` |
| `ports/ICardTemplateRepository.ts` | interface |
| `ports/IImageAssetStore.ts` | interface (upload/sign URLs) |

#### Application layer — `apps/api/src/application/builder/`

| File | Contents |
|---|---|
| `SaveTemplateCommand.ts` | upsert draft template, validate via domain service |
| `PublishTemplateCommand.ts` | mark published, emit `TemplatePublished` |
| `GetTemplateQuery.ts` | returns `CardTemplateDTO` |
| `RequestImageUploadCommand.ts` | generate S3 presigned PUT URL |
| `dtos.ts` | `CardTemplateDTO`, `TemplateFieldDTO` |

#### Infrastructure layer — `apps/api/src/infrastructure/builder/`

| File | Contents |
|---|---|
| `SqlCardTemplateRepository.ts` | Kysely |
| `S3ImageAssetStore.ts` | implements `IImageAssetStore`; presigned URLs, multipart |
| `migrations/002_builder.sql` | `card_templates`, `template_fields`, `template_images` |

#### Presentation — `apps/api/src/presentation/builder/`

| File | Contents |
|---|---|
| `templateRoutes.ts` | CRUD + publish; zod body validation |

#### Frontend — `apps/web/src/presentation/builder/`

| File | Contents |
|---|---|
| `BuilderPage.tsx` | layout shell, drag-and-drop field placer |
| `FieldEditor.tsx` | per-field key/label/value config |
| `ColorPicker.tsx` | outputs `rgb()` string only |
| `ImageUploader.tsx` | presigned PUT, shows strip preview (375×144) |
| `TemplatePreview.tsx` | static Wallet card mockup |
| `useTemplate.ts` | TanStack Query hooks |

**Dependencies:** M1 (tenant scoping).

**DoD:** Upload, save, publish round-trip works. Strip image stored at S3 key `tenants/{tenantId}/templates/{id}/strip@2x.png`. Color rejected if not `rgb(…)`. Image dimensions validated server-side on finalize.

---

## M3 — Pass Issuance & Signing (Week 3–4)

**Goals:** Issue `.pkpass` per member; sign with passkit-generator v3.5.7 + WWDR G4; download endpoint.

### Bounded context: Pass Issuance

#### Domain layer — `apps/api/src/domain/passes/`

| File | Contents |
|---|---|
| `Pass.ts` | `Pass` aggregate; `SerialNumber`, `AuthenticationToken`, `BarcodePayload`, `PassFieldValue` VOs; `PassIssued`, `PassFieldsUpdated`, `PassVoided` events |
| `PassTemplate.ts` | read-only VO mirror of `CardTemplate` (ACL from builder context) |
| `PassDocumentBuilder.ts` | pure domain service: `Pass + PassTemplate → pass.json POJO` |
| `ports/IPassRepository.ts` | interface |
| `ports/IPassSigningPort.ts` | `sign(passJson, images): Promise<Buffer>` |
| `ports/ICertificateStore.ts` | `getSigningMaterial(): Promise<{signerCert,signerKey,wwdr,passphrase}>` |
| `ports/IPassTemplateRepository.ts` | interface |

#### Application layer — `apps/api/src/application/passes/`

| File | Contents |
|---|---|
| `IssuePassCommand.ts` | mint `SerialNumber` (`crypto.randomUUID`), mint `AuthenticationToken` (`crypto.randomBytes(32).toString('hex')`); `PassDocumentBuilder`; sign; persist; return Buffer + MIME |
| `VoidPassCommand.ts` | mark voided; push update |
| `GetPassBufferQuery.ts` | validate `authToken`; `If-Modified-Since` check; sign-on-demand or cache hit |
| `dtos.ts` | `PassIssuedDTO`, `PassStatusDTO` |

#### Infrastructure layer — `apps/api/src/infrastructure/passes/`

| File | Contents |
|---|---|
| `SqlPassRepository.ts` | Kysely; never expose row |
| `PassKitSigningAdapter.ts` | `PKPass.from(model, certs, props).getAsBuffer()`; `mimeType` = `application/vnd.apple.pkpass` |
| `KmsCertificateStore.ts` | reads PEM + passphrase from AWS/GCP KMS / Vault |
| `S3PassCacheStore.ts` | cache signed buffer by `serial+version`; invalidate on update |
| `models/lovalte-loyalty.pass/` | static model folder: `pass.json` skeleton, `icon.png @1x/2x/3x`, `logo.png`, `strip.png @2x` (375×144 pts = 750×288 px @2x) |
| `migrations/003_passes.sql` | `passes`, `pass_type_configs` tables |

#### Presentation — `apps/api/src/presentation/passes/`

| File | Contents |
|---|---|
| `passIssuanceRoutes.ts` | `POST /members/:id/pass` → issue; `GET /passes/:serial/download` → `.pkpass` |

**Dependencies:** M1 (tenant), M2 (template). Certs in KMS pre-loaded (one-time ops).

**DoD:** AirDrop a generated `.pkpass` to an iPhone — it opens in Wallet showing the correct strip, logo, points field. `Content-Type: application/vnd.apple.pkpass`. `authenticationToken` is ≥32 hex chars; immutable on re-issue.

---

## M4 — QR Scan + Redemption (Week 4–5)

**Goals:** QR payload = compact signed token; staff scan endpoint; idempotent single-use redemption via Redis nonce.

### Bounded context: Scanning & Redemption

#### Domain layer — `apps/api/src/domain/scanning/`

| File | Contents |
|---|---|
| `RedemptionEvent.ts` | `RedemptionEvent` aggregate; `RedemptionId`, `ScanToken` VOs; `PointsAwarded`, `PointsRedeemed` events |
| `ScanTokenValidator.ts` | domain service: parse + validate HMAC-SHA256 detached JWT payload `{passId, tenantId, nonce, iat}`; reject if expired (>60s) |
| `ports/IRedemptionRepository.ts` | interface |
| `ports/INonceStore.ts` | `consumeNonce(nonce): Promise<boolean>` — single use |

#### Application layer — `apps/api/src/application/scanning/`

| File | Contents |
|---|---|
| `ScanQrCommand.ts` | validate token via domain service; consume nonce (Redis SET NX, TTL 48h); award/redeem points via `MembershipContext` command; persist `RedemptionEvent`; idempotency key on `redemptionId` |
| `GenerateQrTokenQuery.ts` | mint nonce (`crypto.randomBytes(16)`), sign HMAC-SHA256, return compact token (URL-safe base64) |
| `dtos.ts` | `ScanResultDTO`, `QrTokenDTO` |

#### Infrastructure layer — `apps/api/src/infrastructure/scanning/`

| File | Contents |
|---|---|
| `SqlRedemptionRepository.ts` | append-only insert |
| `RedisNonceStore.ts` | `SET nonce:{nonce} 1 NX PX 172800000`; returns false on collision (replay) |
| `migrations/004_scanning.sql` | `redemption_events` (append-only, no deletes) |

#### Presentation — `apps/api/src/presentation/scanning/`

| File | Contents |
|---|---|
| `scanRoutes.ts` | `POST /scan` (staff role); `GET /qr/:memberId` (generate QR) |

**Dependencies:** M1 (RBAC staff role), M3 (Pass with `SerialNumber`), Redis live.

**DoD:** Double-tap the same QR code within 60s → second request returns 409 (replay). Expired token (>60s) → 401. Forged HMAC → 401. Successful scan → `PointsAwarded` event persisted + member balance updated atomically.

---

## M5 — Delivery / APNs Updates (Week 5–6)

**Goals:** PassKit web-service (5 endpoints); APNs push on points change; `changeMessage` on lock screen.

### Bounded context: Delivery

#### Domain layer — `apps/api/src/domain/delivery/`

| File | Contents |
|---|---|
| `Device.ts` | `Device` aggregate; `DeviceLibraryIdentifier`, `PushToken` VOs |
| `Registration.ts` | entity `(DeviceLibraryIdentifier, PassTypeId, SerialNumber)` |
| `ports/IDeviceRepository.ts` | interface |
| `ports/IRegistrationRepository.ts` | interface |
| `ports/IPushNotificationPort.ts` | `notify(pushTokens, passTypeId): Promise<void>` |

#### Application layer — `apps/api/src/application/delivery/`

| File | Contents |
|---|---|
| `RegisterDeviceCommand.ts` | validate `authToken` against `Pass`; upsert `Device`; create `Registration`; 201/200/401 |
| `UnregisterDeviceCommand.ts` | validate token; delete `Registration`; 200/401 |
| `GetUpdatedSerialsQuery.ts` | return `{serialNumbers, lastUpdated}` or 204 |
| `GetLatestPassQuery.ts` | validate token; `If-Modified-Since` check; sign + return Buffer or 304 |
| `LogDeviceErrorCommand.ts` | accept `{logs:[]}` payload; write to logger; 200 |
| `PushPassUpdateCommand.ts` | load registrations for serial; call `IPushNotificationPort` |

#### Infrastructure layer — `apps/api/src/infrastructure/delivery/`

| File | Contents |
|---|---|
| `SqlDeviceRepository.ts` | Kysely |
| `SqlRegistrationRepository.ts` | Kysely |
| `ApnsAdapter.ts` | HTTP/2 to `api.push.apple.com`; empty `{}` payload; `apns-push-type: background`; `apns-priority: 5`; topic = passTypeId; removes device on 410 feedback |
| `migrations/005_delivery.sql` | `devices`, `registrations` tables |

#### Presentation — `apps/api/src/presentation/delivery/`

| File | Contents |
|---|---|
| `passkitWebServiceRoutes.ts` | All 5 PassKit endpoints under `/v1/`; zod path/query param validation; auth middleware for endpoints 1–4 |

**Event wiring:** `PointsAwarded` (from Scanning BC) → `PushPassUpdateCommand` via BullMQ worker.

**Dependencies:** M3 (Pass), M4 (PointsAwarded event), Redis + BullMQ.

**DoD:** Register a device, earn points → push arrives on the iPhone within 10s; Wallet fetches updated pass; lock-screen notification shows `changeMessage` (`"You now have %@ points"`). APNs 410 removes stale registration. `authenticationToken` unchanged across update.

---

## M6 — Dashboard & Analytics (Week 6–8)

**Goals:** Owner/manager dashboard; real-time metrics; Recharts charts; analytics event ingestion pipeline.

### Bounded context: Analytics (read model)

#### Domain layer — `apps/api/src/domain/analytics/`

| File | Contents |
|---|---|
| `AnalyticsEvent.ts` | `AnalyticsEvent` value type (no mutable state); `ScanEvent`, `IssuanceEvent`, `RedemptionEvent` subtypes |
| `MetricsSummary.ts` | VO: `totalScans`, `activeMembers`, `pointsIssued`, `redemptionRate` |
| `ports/IAnalyticsReadModel.ts` | interface for read queries |

#### Application layer — `apps/api/src/application/analytics/`

| File | Contents |
|---|---|
| `IngestEventCommand.ts` | BullMQ consumer; writes to `analytics_events` |
| `GetDashboardMetricsQuery.ts` | returns `MetricsSummaryDTO` for date range |
| `GetScanTimeSeriesQuery.ts` | returns time-series `[{date, count}]` for Recharts |
| `dtos.ts` | `MetricsSummaryDTO`, `TimeSeriesDTO` |

#### Infrastructure layer — `apps/api/src/infrastructure/analytics/`

| File | Contents |
|---|---|
| `SqlAnalyticsReadModel.ts` | Kysely; pure SELECT aggregates on `analytics_events` |
| `AnalyticsEventWorker.ts` | BullMQ `Worker('analytics', ...)` |
| `migrations/006_analytics.sql` | `analytics_events` (append-only, partitioned by month) |

#### Frontend — `apps/web/src/presentation/dashboard/`

| File | Contents |
|---|---|
| `DashboardPage.tsx` | metric cards + chart layout |
| `ScanTimeSeriesChart.tsx` | Recharts `LineChart` |
| `RedemptionRateChart.tsx` | Recharts `BarChart` |
| `MemberGrowthChart.tsx` | Recharts `AreaChart` |
| `MetricCard.tsx` | KPI tile with delta |
| `useDashboardMetrics.ts` | TanStack Query, auto-refresh 30s |

**Dependencies:** M4 (scan events emitted), M5 (pass events), BullMQ queue.

**DoD:** Dashboard loads within 2s (cached). Charts render 90-day history. Analytics pipeline handles 1k events/min without blocking the API. Tenant isolation: each query scoped by `tenant_id`.

---

## M7 — Hardening & Scale (Week 8–10)

**Goals:** Security audit, performance gates, GDPR, cert rotation plan, load test.

### Files / modules

| Area | File | Action |
|---|---|---|
| Rate limiting | `apps/api/src/infrastructure/rateLimit.ts` | Per-IP + per-account Redis sliding window |
| Audit log | `apps/api/src/infrastructure/AuditLogger.ts` | Append-only `audit_log` table; log all RBAC-gated mutations |
| GDPR | `apps/api/src/application/identity/ExportMemberDataQuery.ts` | Full PII export ZIP |
| GDPR | `apps/api/src/application/identity/DeleteMemberCommand.ts` | Pseudonymise + soft-delete |
| Cert rotation | `apps/api/src/infrastructure/passes/CertRotationScheduler.ts` | Cron check expiry; alert 60d before |
| Load shedding | `apps/api/src/presentation/middleware/circuitBreaker.ts` | opossum wrapping APNs + KMS |
| DB indices | `migrations/007_indices.sql` | Composite indices on hot query paths |
| APNs feedback | Extend `ApnsAdapter.ts` | Poll feedback service; prune stale devices |
| RLS audit | `migrations/008_rls_audit.sql` | Verify all tenant tables have RLS policies |

**DoD:** OWASP ZAP scan 0 high findings. Load test: 500 concurrent scans/s; p99 < 200ms. Signing key never touches process env (KMS only). GDPR export/delete verified with test tenant. Cert expiry alert fires in staging 60d before expiry date.

---

## Master File / Module Inventory

| Bounded Context | Domain | Application | Infrastructure | Presentation / Frontend |
|---|---|---|---|---|
| **Identity & Access** | `Tenant`, `User`, `TenantMembership`, `ports/ITenantRepo`, `ports/IUserRepo` | `CreateTenantCommand`, `InviteUserCommand`, `LoginQuery` | `SqlTenantRepo`, `SqlUserRepo`, `migration 001` | `authRoutes`, `tenantRoutes` |
| **Card Builder** | `CardTemplate`, `TemplateValidator`, `ports/ICardTemplateRepo`, `ports/IImageAssetStore` | `SaveTemplateCommand`, `PublishTemplateCommand`, `RequestImageUploadCommand` | `SqlCardTemplateRepo`, `S3ImageAssetStore`, `migration 002` | `templateRoutes`, `BuilderPage`, `FieldEditor`, `ColorPicker`, `ImageUploader`, `TemplatePreview` |
| **Pass Issuance** | `Pass`, `PassTemplate` (ACL VO), `PassDocumentBuilder`, `ports/IPassRepo`, `ports/IPassSigningPort`, `ports/ICertificateStore` | `IssuePassCommand`, `VoidPassCommand`, `GetPassBufferQuery` | `SqlPassRepo`, `PassKitSigningAdapter`, `KmsCertificateStore`, `S3PassCacheStore`, `migration 003`, `models/lovalte-loyalty.pass/` | `passIssuanceRoutes` |
| **Scanning & Redemption** | `RedemptionEvent`, `ScanTokenValidator`, `ports/IRedemptionRepo`, `ports/INonceStore` | `ScanQrCommand`, `GenerateQrTokenQuery` | `SqlRedemptionRepo`, `RedisNonceStore`, `migration 004` | `scanRoutes` |
| **Delivery** | `Device`, `Registration`, `ports/IDeviceRepo`, `ports/IRegistrationRepo`, `ports/IPushNotificationPort` | `RegisterDeviceCommand`, `UnregisterDeviceCommand`, `GetUpdatedSerialsQuery`, `GetLatestPassQuery`, `LogDeviceErrorCommand`, `PushPassUpdateCommand` | `SqlDeviceRepo`, `SqlRegistrationRepo`, `ApnsAdapter`, `migration 005` | `passkitWebServiceRoutes` |
| **Analytics** | `AnalyticsEvent`, `MetricsSummary`, `ports/IAnalyticsReadModel` | `IngestEventCommand`, `GetDashboardMetricsQuery`, `GetScanTimeSeriesQuery` | `SqlAnalyticsReadModel`, `AnalyticsEventWorker`, `migration 006` | `DashboardPage`, `ScanTimeSeriesChart`, `RedemptionRateChart`, `MemberGrowthChart`, `MetricCard` |
| **Membership / Loyalty** | `Member`, `PointsBalance`, `Tier`, reward rules, `ports/IMemberRepo` | `AwardPointsCommand`, `RedeemRewardCommand`, `GetMemberQuery` | `SqlMemberRepo`, `migration 007` | `memberRoutes` |
| **Notifications** | (supporting) | `SendWelcomeEmailCommand` | `SmtpEmailAdapter` | — |
| **Shared infra** | — | — | `rateLimit.ts`, `AuditLogger.ts`, `circuitBreaker.ts`, `CertRotationScheduler.ts` | `errorHandler.ts`, `authMiddleware.ts`, `rbacGuard.ts` |

---

## Risk Register

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Pass Type ID certificate expires (≈1 yr); cannot renew — must replace | High | High | `CertRotationScheduler` alert 60d prior; document replacement runbook in `docs/cert-rotation.md` |
| R2 | APNs push token stale (device reinstalled) → 410 response | High | Medium | `ApnsAdapter` removes registration on 410; periodic feedback poll |
| R3 | QR replay attack (double-scan race) | Medium | High | `RedisNonceStore` SET NX atomic; idempotency key on `redemptionId`; distributed lock if multi-instance |
| R4 | KMS unavailable → signing fails | Low | High | S3 pass cache serves last-signed buffer; circuit breaker on KMS client |
| R5 | S3 presigned URL leakage → unauthorized asset access | Medium | Medium | Short TTL (15 min); bucket policy denies public access; CloudFront signed cookies for preview |
| R6 | Multi-tenant row leak via missing `tenant_id` filter | Low | Critical | Postgres RLS enforced at DB level; integration tests assert cross-tenant 404 |
| R7 | `passkit-generator` major version break | Low | Medium | Pin `"passkit-generator": "3.5.7"` in `package.json`; E2E smoke test in CI generates real pass |
| R8 | WWDR G4 replaced by G5/G6 | Low | High | Monitor Apple PKI announcements; `ICertificateStore` abstracted for easy swap |
| R9 | Analytics event storm overwhelms DB | Medium | Medium | BullMQ concurrency limit; monthly table partitioning; read model separate from OLTP |
| R10 | Strip image wrong dimensions — Wallet shows blank | High | Medium | Server-side sharp validation on upload: reject if not 375×144 pts equivalent |

---

## First-PR Checklist

```
Before opening the first PR against main:

[ ] Mono-repo builds clean: `npm run build` exits 0 all workspaces
[ ] Zero TypeScript errors: `npm run typecheck`
[ ] Biome lint passes: `npm run lint`
[ ] Unit tests green: `npm test` (Vitest)
[ ] `.env.example` committed; `.env` in `.gitignore`
[ ] No secrets, certs, or `.p12` files tracked by git
[ ] `001_identity.sql` migration runs idempotently (includes RLS policy)
[ ] WWDR G4 PEM path documented in README — never committed
[ ] Fastify starts and `/health` returns 200
[ ] CI workflow file passes on GitHub Actions dry-run
[ ] PR description names the milestone (M0/M1/…) and links DoD items
[ ] Co-authored-by omitted (no `attribution.commit` in settings.json)
```

---

## Dependency Graph (simplified)

```
M0 (scaffold)
 └─ M1 (identity + tenancy)
     ├─ M2 (builder + templates)
     │   └─ M3 (pass issuance + signing)
     │       ├─ M4 (QR + scan + redeem)
     │       │   └─ M5 (delivery + APNs)
     │       │       └─ M6 (dashboard + analytics)
     │       │           └─ M7 (hardening + scale)
     │       └─ M5 (delivery — also needs M3 Pass)
     └─ M4 (RBAC staff role)
```

> Apple constraint reminders embedded in M3/M5:
> - Strip: `375×144` pts (`750×288 @2x`). Colors: `rgb()` only, no `stripColor`. MIME: `application/vnd.apple.pkpass`. WWDR: G4 only. `authenticationToken`: immutable. APNs push payload: `{}`. Priority: `5` (background). `passesUpdatedSince` tag: monotonically increasing opaque string.
