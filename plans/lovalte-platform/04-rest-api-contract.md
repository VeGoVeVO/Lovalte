# 04 — REST API Contract

Two URL namespaces are served by the same Fastify process on different router prefixes:

| Prefix | Audience | Auth |
|---|---|---|
| `/api/v1` | Dashboard, Builder, staff scanner (React SPA + mobile) | JWT Bearer (RS256) |
| `/wallet/v1` | Apple PassKit web service (iOS Wallet) | `ApplePass` per-pass token |

All `/api/v1` routes enforce **tenant isolation** via `tenant_id` claim in the JWT; every query is additionally scoped by tenant at the DB layer (RLS). All times ISO 8601. All money-values are integer cents.

---

## Standard Envelopes

**Success (single)**
```jsonc
{ "data": { ... } }
```
**Success (list)**
```jsonc
{ "data": [...], "meta": { "page": 1, "pageSize": 25, "total": 412 } }
```
**Error**
```jsonc
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
```

**Pagination query params (all list endpoints):** `?page=1&pageSize=25` (max 100). Cursor-based available via `?cursor=<opaque>` on high-volume analytics queries.

**CORS:** Allowed origins configured per-tenant via `tenantAllowedOrigins`; default `https://app.lovalte.com`. Credentials=true. CSRF: SameSite=Strict cookies + `X-Requested-With` double-submit on mutation routes called from the browser.

---

## 1. Auth & Session — `/api/v1/auth`

### POST `/api/v1/auth/register`
Register a new tenant account (owner).

| Field | |
|---|---|
| Auth | None |
| Rate-limit | 5 req/IP/min |
| Idempotency | None |

**Request (zod)**
```ts
z.object({
  email: z.string().email().max(254),
  password: z.string().min(12).max(128),
  businessName: z.string().min(1).max(100),
  planId: z.string().uuid(),
})
```
**Response 201** `{ data: { tenantId, userId, email } }`
**Errors:** 409 EMAIL_TAKEN, 422 VALIDATION_ERROR

---

### POST `/api/v1/auth/login`
| Auth | None | Rate-limit | 10 req/IP/min (then lockout 5 min) |
|---|---|---|---|

**Request**
```ts
z.object({ email: z.string().email(), password: z.string().max(128) })
```
**Response 200** `{ data: { accessToken, expiresIn: 900, refreshToken } }`
Tokens are RS256 JWTs. `accessToken` TTL 15 min; `refreshToken` TTL 30 days, stored HttpOnly Secure cookie.

---

### POST `/api/v1/auth/refresh`
| Auth | `refreshToken` cookie | Rate-limit | 30 req/user/min |
|---|---|---|---|

**Response 200** `{ data: { accessToken, expiresIn: 900 } }`

---

### POST `/api/v1/auth/logout`
Invalidates refresh token (Redis blocklist). **Response 204.**

---

## 2. Tenant & User Management — `/api/v1/tenants`

### GET `/api/v1/tenants/me`
| Auth | JWT (owner/manager) | Rate-limit | 60/min |
|---|---|---|---|

**Response 200** `{ data: { tenantId, businessName, plan, createdAt } }`

---

### PATCH `/api/v1/tenants/me`
```ts
z.object({
  businessName: z.string().min(1).max(100).optional(),
  logoUrl: z.string().url().optional(),
}).strict()
```
**Response 200** `{ data: { tenantId, businessName, updatedAt } }` | **400** VALIDATION_ERROR

---

### GET `/api/v1/tenants/me/users`
| Auth | JWT (owner) | |
|---|---|---|

**Response 200** list of `{ userId, email, role, createdAt }`

---

### POST `/api/v1/tenants/me/users`
Invite staff or manager.
```ts
z.object({ email: z.string().email(), role: z.enum(["manager","staff"]) })
```
**Response 201** `{ data: { userId, email, role } }` | **409** if already member

---

### DELETE `/api/v1/tenants/me/users/:userId`
| Auth | JWT (owner) | Response | 204 |
|---|---|---|---|

---

## 3. Card Template CRUD + Publish — `/api/v1/card-templates`

### GET `/api/v1/card-templates`
**Response 200** paginated list of templates for the calling tenant.

---

### POST `/api/v1/card-templates`
| Auth | JWT (owner/manager) | Rate-limit | 20/min |
|---|---|---|---|

```ts
z.object({
  name: z.string().min(1).max(100),
  organizationName: z.string().min(1).max(100),
  description: z.string().max(255),
  foregroundColor: z.string().regex(/^rgb\(\d{1,3},\s*\d{1,3},\s*\d{1,3}\)$/),
  backgroundColor: z.string().regex(/^rgb\(\d{1,3},\s*\d{1,3},\s*\d{1,3}\)$/),
  labelColor: z.string().regex(/^rgb\(\d{1,3},\s*\d{1,3},\s*\d{1,3}\)$/),
  logoText: z.string().max(50).optional(),
  fields: z.array(z.object({
    key: z.string(), label: z.string(), type: z.enum(["primary","secondary","auxiliary","header","back"])
  })).max(20),
  stripImageKey: z.string().optional(),   // S3 object key
  iconImageKey: z.string(),
  logoImageKey: z.string(),
}).strict()
```
**Response 201** `{ data: { templateId, name, status: "draft", createdAt } }`

---

### GET `/api/v1/card-templates/:templateId`
**Response 200** full template object | **404** NOT_FOUND

---

### PATCH `/api/v1/card-templates/:templateId`
Same shape as POST but all fields optional. Only allowed when `status = "draft"`.
**Response 200** `{ data: { templateId, updatedAt } }`

---

### POST `/api/v1/card-templates/:templateId/publish`
Transitions `draft → active`. Triggers `passkit-generator` validation (certificate check, required image sizes). Idempotent — publishing an already-active template returns 200.
| Auth | JWT (owner) | Rate-limit | 5/min |
|---|---|---|---|

**Response 200** `{ data: { templateId, status: "active", publishedAt } }`
**Errors:** 409 ALREADY_ACTIVE, 422 VALIDATION_ERROR (e.g. missing icon, bad color)

---

### DELETE `/api/v1/card-templates/:templateId`
Soft-delete; only allowed when no active passes reference the template.
**Response 204** | **409** PASSES_EXIST

---

### POST `/api/v1/card-templates/:templateId/assets`
Upload builder image asset (logo, strip, icon). `multipart/form-data`.
```
field: file (max 2 MB, PNG/JPEG)
field: assetType (enum: icon|logo|strip|thumbnail)
```
Server stores to S3-compatible object storage, returns signed S3 key.
**Response 200** `{ data: { key, url } }`
**Errors:** 413 FILE_TOO_LARGE, 415 UNSUPPORTED_MEDIA_TYPE

> Apple strip image must be exactly **375 × 144 px** at 1×; supply @2x (750 × 288) and @3x (1125 × 432).

---

## 4. Pass Issuance & Add-to-Wallet — `/api/v1/passes`

### POST `/api/v1/passes`
Issue a `.pkpass` for a member. Idempotent: if a pass already exists for `(tenantId, memberId, templateId)` returns the existing pass.
| Auth | JWT (owner/manager) | Rate-limit | 60/min |
| Idempotency | `Idempotency-Key` header (UUID); stored 24 h in Redis | |

```ts
z.object({
  memberId: z.string().uuid(),
  templateId: z.string().uuid(),
})
```
**Response 201** `{ data: { passId, serialNumber, memberId, createdAt } }`
**409** if template is not `active`. **404** if member not found.

---

### GET `/api/v1/passes/:passId/pkpass`
Download the signed `.pkpass` for Add-to-Wallet link.
| Auth | JWT (owner/manager/staff) OR signed short-lived download token (see below) |
|---|---|

**Response 200**
```
Content-Type: application/vnd.apple.pkpass
Content-Disposition: attachment; filename="lovalte.pkpass"
```
Body = signed `.pkpass` Buffer (from S3 cache; re-signed and recached on miss).
**304** if `If-Modified-Since` ≥ `pass.updatedAt`. **404** NOT_FOUND.

---

### POST `/api/v1/passes/:passId/download-token`
Mint a short-lived (5 min) signed download token so the member's email/SMS link can download the `.pkpass` without a full JWT session.
**Response 200** `{ data: { downloadUrl, expiresAt } }`

---

## 5. QR Token Mint — `/api/v1/passes/:passId/qr-token`

### POST `/api/v1/passes/:passId/qr-token`
Mint a single-use QR payload token for a member's pass. Stored nonce in Redis (TTL = token expiry, default 5 min).
| Auth | JWT (owner/manager/staff) | Rate-limit | 30/min per tenant |
|---|---|---|---|

**Response 200**
```jsonc
{ "data": { "token": "<compact-signed-jwt>", "expiresAt": "...", "qrImageUrl": "..." } }
```
QR payload JWT claims: `{ passId, tenantId, nonce, iat, exp }` signed with HMAC-SHA256 (key from KMS). `qrImageUrl` is a pre-rendered PNG data-URL or a QR generation endpoint URL.

---

## 6. Scan & Redeem — `/api/v1/scans`

### POST `/api/v1/scans`
Staff scans a member QR; awards or redeems points.
| Auth | JWT (staff/manager/owner) | Rate-limit | 120/min per tenant |
| Idempotency | `Idempotency-Key` header (UUID) **REQUIRED**; stored 24 h Redis | |

```ts
z.object({
  qrToken: z.string().min(1),
  action: z.enum(["earn","redeem"]),
  points: z.number().int().min(1).max(100000),
  locationId: z.string().uuid().optional(),
}).strict()
```

**Server flow:** verify JWT signature → check nonce not in Redis seen-set → resolve `passId`/`tenantId` → validate tenant match → apply points → mark nonce consumed → emit `PointsEarned` / `PointsRedeemed` domain event → trigger APNs push (BullMQ job). Idempotency-Key deduplicates double-tap retries independently of nonce.

**Response 201**
```jsonc
{ "data": { "scanId", "memberId", "pointsDelta", "newBalance", "tier", "scanAt" } }
```
**Errors:** 401 INVALID_TOKEN, 409 TOKEN_ALREADY_USED, 422 INSUFFICIENT_POINTS, 404 PASS_NOT_FOUND

---

### GET `/api/v1/scans`
| Auth | JWT (owner/manager) | |
|---|---|---|

Query params: `?memberId=&locationId=&from=&to=&page=&pageSize=`
**Response 200** paginated list `{ scanId, action, points, staffId, scanAt }`

---

## 7. Members — `/api/v1/members`

### POST `/api/v1/members`
| Auth | JWT (owner/manager) | Idempotency | `Idempotency-Key` |
|---|---|---|---|

```ts
z.object({
  externalId: z.string().max(100).optional(),   // tenant's own customer id
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  name: z.string().max(100).optional(),
}).strict()
```
**Response 201** `{ data: { memberId, externalId, tier, balance: 0, createdAt } }`

---

### GET `/api/v1/members/:memberId`
**Response 200** `{ data: { memberId, email, name, tier, balance, lifetimePoints, linkedPassSerialNumbers, createdAt } }`

---

### PATCH `/api/v1/members/:memberId/points`
Manual points adjustment (owner only).
```ts
z.object({ delta: z.number().int(), reason: z.string().max(255) })
```
**Response 200** `{ data: { memberId, newBalance, tier } }` | Idempotency-Key required.

---

## 8. Dashboard & Analytics — `/api/v1/analytics`

All analytics endpoints are **read-only** (GET), return **pre-aggregated** metrics from the analytics read model. Heavy queries are cached in Redis (TTL 60 s).

### GET `/api/v1/analytics/overview`
| Auth | JWT (owner/manager) | Rate-limit | 30/min |
|---|---|---|---|

Query: `?from=2026-01-01&to=2026-06-30`

**Response 200**
```jsonc
{ "data": {
    "totalMembers": 4200,
    "activeMembers30d": 812,
    "totalScans30d": 3100,
    "pointsIssued30d": 124000,
    "pointsRedeemed30d": 38000,
    "passesIssued": 4200,
    "walletInstalls": 3100
}}
```

---

### GET `/api/v1/analytics/scans/timeseries`
Query: `?from=&to=&interval=day|week|month&locationId=`
**Response 200** `{ data: [{ date, earnCount, redeemCount, pointsIssued, pointsRedeemed }] }`

---

### GET `/api/v1/analytics/members/tiers`
**Response 200** `{ data: [{ tier, count, pct }] }`

---

### GET `/api/v1/analytics/members/top`
Query: `?limit=20&by=balance|lifetime|scans`
**Response 200** paginated `[{ memberId, name, value }]`

---

### GET `/api/v1/analytics/passes/wallet-installs`
Timeseries of APNs registrations (device registrations).
**Response 200** `{ data: [{ date, installs, uninstalls, net }] }`

---

## 9. Apple PassKit Web Service — `/wallet/v1`

These 5 endpoints implement the PassKit web service spec verbatim (research/06). `{webServiceURL}` in the pass = `https://passes.lovalte.com/wallet/v1/`. **No tenant JWT** — auth is per-pass `ApplePass` token.

### 9.1 Register device for a pass
```
POST /wallet/v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}/{serialNumber}
Authorization: ApplePass {authenticationToken}
Content-Type: application/json
Body: { "pushToken": "<APNs device push token>" }
```
Handler: `RegisterDeviceCommand` — validates `authenticationToken` against `passes` table, upserts `devices` row (refresh push token on conflict), inserts `registrations` row.
**201** new registration | **200** already registered | **401** bad token

Rate-limit: 60/device-id/min.

---

### 9.2 Get serial numbers of updated passes
```
GET /wallet/v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}?passesUpdatedSince={tag}
(no auth required per spec)
```
Handler: `GetUpdatedSerialsQuery` — queries `registrations JOIN passes` where `pass.updated_at > passesUpdatedSince` (omit filter on first call).
**200** `{ "serialNumbers": [...], "lastUpdated": "<epoch-string>" }` | **204** nothing changed

`lastUpdated` = `EXTRACT(EPOCH FROM MAX(passes.updated_at))::text` — monotonic opaque string echoed back by the device as `passesUpdatedSince`.

---

### 9.3 Get latest version of a pass
```
GET /wallet/v1/passes/{passTypeIdentifier}/{serialNumber}
Authorization: ApplePass {authenticationToken}
If-Modified-Since: {HTTP-date}   (optional, device sends on repeat polls)
```
Handler: `GetLatestPassQuery` — validate token; compare `pass.updated_at` with `If-Modified-Since`; serve from S3 buffer cache (re-sign on miss); set `Last-Modified`.
**200** `Content-Type: application/vnd.apple.pkpass` + `Last-Modified` header | **304** not modified | **401** bad token

---

### 9.4 Unregister device
```
DELETE /wallet/v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}/{serialNumber}
Authorization: ApplePass {authenticationToken}
```
Handler: `UnregisterDeviceCommand` — validate token; delete `registrations` row; if device has no remaining registrations, delete `devices` row.
**200** | **401**

---

### 9.5 Device log
```
POST /wallet/v1/log
Content-Type: application/json
Body: { "logs": ["..."] }
(no auth)
```
Forward to structured logger. **200** always (never expose internals).

Rate-limit: 30/IP/min.

---

## 10. Rate-Limit Summary

| Endpoint group | Limit | Window |
|---|---|---|
| `POST /auth/register` | 5 req | 1 min / IP |
| `POST /auth/login` | 10 req | 1 min / IP; lockout 5 min |
| Auth (other) | 30 req | 1 min / user |
| CRUD mutations | 60 req | 1 min / tenant |
| `POST /scans` | 120 req | 1 min / tenant |
| Analytics GETs | 30 req | 1 min / tenant |
| `/wallet/v1/log` | 30 req | 1 min / IP |
| `/wallet/v1` (other) | 60 req | 1 min / device-id |

All limits enforced via **Redis sliding window** (BullMQ rate-limiter or `ioredis` MULTI/EXEC). On breach: **429** `{ "error": { "code": "RATE_LIMITED", "retryAfter": 42 } }` + `Retry-After` header.

---

## 11. Idempotency Contract

Routes that accept `Idempotency-Key`:

| Route | Required? | TTL |
|---|---|---|
| `POST /api/v1/passes` | Optional | 24 h |
| `POST /api/v1/scans` | **Required** | 24 h |
| `PATCH /api/v1/members/:id/points` | **Required** | 24 h |
| `POST /api/v1/members` | Optional | 24 h |

Server stores `SHA256(tenantId + Idempotency-Key)` → serialized response in Redis. On replay: return cached response with status `200` (or original 201) and header `Idempotency-Replayed: true`. Mismatch (same key, different body) returns **422** IDEMPOTENCY_CONFLICT.

QR nonces are a separate single-use layer: consumed atomically with `SET nonce EX 300 NX` in Redis; duplicate scan yields **409 TOKEN_ALREADY_USED** regardless of Idempotency-Key.
