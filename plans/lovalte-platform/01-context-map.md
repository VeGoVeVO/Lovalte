# 01 — Bounded Context Map

> Implementation-ready reference. Every integration point names the exact event, the exact payload
> (IDs only — no shared domain objects), and where an Anti-Corruption Layer (ACL) sits.

---

## 1. ASCII Context Map

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           LOVALTE PLATFORM                                      │
│                                                                                 │
│  ┌─────────────────┐  CardTemplatePublished  ┌─────────────────────────────┐   │
│  │  Card Design /  │ ──────────────────────► │     Pass Issuance           │   │
│  │  Builder        │                         │  (Pass, .pkpass, QR token)  │   │
│  │  (upstream)     │ ◄── ACL ──────────────  │                             │   │
│  └─────────────────┘                         └──────────┬──────────────────┘   │
│                                                          │ PassIssued           │
│  ┌─────────────────┐  MemberEnrolled          PassFieldsUpdated                 │
│  │  Identity &     │ ──────────────────────►  │                                 │
│  │  Access         │  UserRoleChanged         ▼                                 │
│  │  (upstream)     │                ┌─────────────────────────────┐             │
│  └─────────────────┘                │     Membership / Loyalty    │             │
│           │                         │  (Member, points, tiers)    │             │
│           │ TenantProvisioned        └──────────┬──────────────────┘            │
│           ▼                                     │ PointsEarned                  │
│  ┌─────────────────┐                            │ TierUpgraded                  │
│  │  Analytics      │ ◄──── (all contexts) ──────┼──────────────────────────     │
│  │  (read model)   │       ScanRecorded          │ BalanceUpdated               │
│  │  (downstream)   │       PointsEarned          ▼                              │
│  └─────────────────┘  ┌─────────────────────────────────────────────────────┐  │
│                        │     Scanning & Redemption                           │  │
│  ┌─────────────────┐   │  (Scan, RedemptionEvent — idempotent, nonce-guarded)│  │
│  │  Notifications  │ ◄─│                                                     │  │
│  │  (supporting)   │   └──────────┬──────────────────────────────────────────┘  │
│  └─────────────────┘              │ ScanRecorded / RedemptionCompleted          │
│                                   ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  Delivery (Device, Registration, APNs)                                  │    │
│  │  PassFieldsUpdated ──► APNs background push (priority 5)                │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  Certificate & Key Mgmt  (pure supporting infra — no domain events)     │    │
│  │  Provides: IPassSigningPort, ICertificateStore to Pass Issuance infra   │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────┘

  ──►  domain event flow (upstream → downstream)
  ACL  Anti-Corruption Layer translates foreign model before entering context
```

---

## 2. Context Responsibilities & Ubiquitous Language

### 2.1 Identity & Access (IAC)
**Responsibilities:** tenant provisioning, user accounts, authentication (JWT/session), RBAC
(owner / manager / staff), plan entitlements, audit log of privileged actions.

**Ubiquitous language:**

| Term | Meaning |
|---|---|
| `Tenant` | A registered business; root of multi-tenancy. |
| `User` | A human authenticated to the platform. |
| `Role` | `owner`, `manager`, `staff` — scoped per tenant. |
| `Entitlement` | Feature flag or plan limit (e.g. max active passes). |

**Owns:** `tenants`, `users`, `roles`, `audit_log` tables. Every tenant-owned row in other contexts
carries `tenant_id` + Postgres Row-Level Security referencing this context's tenant.

---

### 2.2 Card Design / Builder
**Responsibilities:** visual WYSIWYG editor, card template creation/versioning, image asset upload
to S3, publishing a finalized `CardTemplate` that pass issuance will render.

**Ubiquitous language:**

| Term | Meaning |
|---|---|
| `CardTemplate` | A versioned visual design (colors, fields, images, logo). |
| `TemplateVersion` | Immutable snapshot on publish. |
| `AssetRef` | Signed S3 key for an uploaded image (strip 375×144 px, icon, logo, thumbnail). |
| `FieldLayout` | Ordered list of front/back field definitions with keys and labels. |
| `Published` | Template version frozen and eligible for pass generation. |

**Owns:** `card_templates`, `template_versions`, `template_assets` tables.

---

### 2.3 Pass Issuance
**Responsibilities:** mint `Pass` aggregates from a `CardTemplate`, sign `.pkpass` buffers via
`passkit-generator` (WWDR G4), generate HMAC-SHA256 QR tokens (payload: `{passId, tenantId,
nonce, iat}`), serve the 5 PassKit web-service endpoints (device registration, serial list,
latest pass, unregister, log). `authenticationToken` is immutable after issuance.

**Ubiquitous language:**

| Term | Meaning |
|---|---|
| `Pass` | Issued instance; owns `SerialNumber`, `AuthenticationToken`, field values. |
| `PassTemplate` | Local read-model of `CardTemplate` (ACL translation). |
| `SerialNumber` | Globally unique, opaque string — the Apple identity for a pass. |
| `AuthenticationToken` | ≥32 random bytes, hex-encoded; set once, never changed. |
| `lastUpdated` | Opaque monotonic tag; drives `If-Modified-Since` comparison. |
| `BarcodePayload` | Signed QR token string embedded in `pass.json`. |
| `.pkpass buffer` | PKCS#7-signed ZIP returned as `application/vnd.apple.pkpass`. |

**Owns:** `passes`, `pass_templates` (local ACL copy) tables.

---

### 2.4 Membership / Loyalty
**Responsibilities:** `Member` lifecycle (enroll, suspend), points ledger, tier computation,
reward rule evaluation, points earn/redeem business logic.

**Ubiquitous language:**

| Term | Meaning |
|---|---|
| `Member` | A customer enrolled in a tenant's loyalty programme; root aggregate. |
| `MemberId` | Value object; UUID. |
| `PointsBalance` | Current points (non-negative invariant). |
| `Tier` | Derived classification (Bronze / Silver / Gold) from balance or spend. |
| `RewardRule` | Configurable earn/burn rule owned by the tenant. |
| `PointsLedgerEntry` | Append-only row; source of truth for balance. |

**Owns:** `members`, `points_ledger`, `reward_rules`, `tiers` tables.

---

### 2.5 Scanning & Redemption
**Responsibilities:** validate incoming QR token (HMAC-SHA256 verify, nonce check via Redis,
expiry check), record `Scan`, apply points via command to Loyalty, enforce idempotency (Redis
key: `redemption:{nonce}` with TTL), emit `ScanRecorded` + `RedemptionCompleted`.

**Ubiquitous language:**

| Term | Meaning |
|---|---|
| `Scan` | An atomic event of a staff member reading a customer QR. |
| `RedemptionEvent` | Business outcome of a scan (earn or redeem points). |
| `Nonce` | Single-use token component; server-side Redis set prevents replay. |
| `ScanResult` | `accepted` / `rejected` / `already-redeemed`. |

**Owns:** `scans`, `redemption_events` tables. Redis keys: `nonce:{nonce}`.

---

### 2.6 Delivery (Device Registration & APNs)
**Responsibilities:** implement Apple's 5 PassKit web-service REST endpoints; store
`Device` + `Registration`; push background APNs notifications (priority 5, `content-available: 1`)
via BullMQ queue when `PassFieldsUpdated` is received.

**Ubiquitous language:**

| Term | Meaning |
|---|---|
| `Device` | Identified by opaque `deviceLibraryIdentifier` from Apple. |
| `PushToken` | APN device token; updated on re-registration. |
| `Registration` | Link between `(Device, PassTypeId, SerialNumber)`. |
| `WebServiceURL` | Embedded in `pass.json`; base URL Apple calls back on. |

**Owns:** `devices`, `registrations` tables. PassKit endpoints:
`POST /v1/devices/{devId}/registrations/{passTypeId}/{serial}`,
`DELETE /v1/devices/{devId}/registrations/{passTypeId}/{serial}`,
`GET /v1/devices/{devId}/registrations/{passTypeId}`,
`GET /v1/passes/{passTypeId}/{serial}`,
`POST /v1/log`.

---

### 2.7 Analytics
**Responsibilities:** pure read model; ingests domain events via BullMQ; materializes metrics
(scans/day, points issued/redeemed, tier distribution, active members) into denormalized tables
or time-series; serves dashboard queries via `GET /analytics/*`.

**Ubiquitous language:**

| Term | Meaning |
|---|---|
| `MetricSnapshot` | Aggregated count for a time window and tenant. |
| `EventProjection` | Handler that maps a domain event to analytics rows. |
| `TimeSeriesPoint` | `(tenant_id, metric, bucket, value)`. |

**Owns:** `analytics_events`, `metric_snapshots`, `time_series` tables (append-only).

---

### 2.8 Notifications (Supporting)
**Responsibilities:** email/SMS confirmations (enrolment, tier upgrade); orchestrates delivery
via external providers; decoupled from all other contexts via events. Does not own member data.

**Ubiquitous language:** `NotificationJob`, `Channel` (email/sms), `Template`, `DeliveryStatus`.

---

### 2.9 Certificate & Key Mgmt (Supporting Infrastructure)
**Responsibilities:** store Apple Pass Type Certificate (`.p12`), WWDR G4, and per-tenant
signing passphrases in KMS / secret store; expose `ICertificateStore` port to Pass Issuance
infrastructure; handle cert rotation without pass re-issuance.

No domain events emitted. Purely supporting. Credentials NEVER in DB or repo.

---

## 3. Upstream / Downstream Relationships

```
IAC ──(upstream)──► All contexts   (TenantId scopes every query; UserRole gates commands)
Card Design ──(upstream)──► Pass Issuance   (via CardTemplatePublished + ACL)
IAC ──(upstream)──► Membership     (via MemberEnrolled carrying TenantId, UserId)
Membership ──(upstream)──► Pass Issuance    (PointsEarned → PassFieldsUpdated)
Membership ──(upstream)──► Analytics        (PointsEarned, TierUpgraded)
Pass Issuance ──(upstream)──► Delivery      (PassFieldsUpdated → APNs push)
Pass Issuance ──(upstream)──► Analytics     (PassIssued)
Scanning ──(upstream)──► Membership         (ScanRecorded → EarnPoints command)
Scanning ──(upstream)──► Analytics          (ScanRecorded, RedemptionCompleted)
Scanning ──(upstream)──► Notifications      (RedemptionCompleted → confirm SMS)
Delivery ──(upstream)──► Analytics          (DeviceRegistered)
Cert & Key Mgmt ──(infra port)──► Pass Issuance infra  (ICertificateStore)
```

---

## 4. Anti-Corruption Layers

| ACL location | Translates | Reason |
|---|---|---|
| Pass Issuance ← Card Design | `CardTemplate` event payload → `PassTemplate` domain object | Card Design speaks in visual/design terms; Pass Issuance speaks in `pass.json` field semantics. ACL maps `rgb()` colors, image asset refs, field layout to PassKit-specific VOs. |
| Membership ← IAC | `UserCreated` event → `Member` enrolment command | IAC owns `User`; Membership owns `Member`. Not the same concept. ACL extracts only `(tenantId, userId, email-hash)` — no PII beyond what loyalty needs. |
| Analytics ← all contexts | Raw domain event → `AnalyticsEvent` projection row | Analytics has its own read model; it must not import domain types from producers. ACL in analytics `EventProjection` handlers maps each event payload to local metric DTO. |

---

## 5. Domain Event Catalog

| Event Name | Producer Context | Consumer Context(s) | Payload (IDs only) |
|---|---|---|---|
| `TenantProvisioned` | IAC | All (via tenant_id propagation) | `{ tenantId, planId, ownerId }` |
| `UserRoleChanged` | IAC | IAC (RBAC cache invalidate) | `{ tenantId, userId, role }` |
| `CardTemplatePublished` | Card Design | Pass Issuance (via ACL) | `{ tenantId, templateId, versionId }` |
| `MemberEnrolled` | IAC | Membership (via ACL) | `{ tenantId, userId, enrolledAt }` |
| `PassIssued` | Pass Issuance | Analytics, Notifications | `{ tenantId, passId, memberId, serialNumber, issuedAt }` |
| `PassFieldsUpdated` | Pass Issuance | Delivery, Analytics | `{ tenantId, passId, serialNumber, passTypeId, lastUpdated }` |
| `PassVoided` | Pass Issuance | Delivery, Analytics | `{ tenantId, passId, serialNumber, passTypeId, voidedAt }` |
| `PointsEarned` | Membership | Pass Issuance, Analytics, Notifications | `{ tenantId, memberId, passId, delta, newBalance, source }` |
| `PointsRedeemed` | Membership | Pass Issuance, Analytics, Notifications | `{ tenantId, memberId, passId, delta, newBalance, redemptionEventId }` |
| `TierUpgraded` | Membership | Pass Issuance, Analytics, Notifications | `{ tenantId, memberId, passId, previousTier, newTier }` |
| `ScanRecorded` | Scanning | Membership (earn cmd), Analytics | `{ tenantId, scanId, passId, memberId, staffUserId, nonce, scannedAt }` |
| `RedemptionCompleted` | Scanning | Analytics, Notifications | `{ tenantId, scanId, redemptionEventId, memberId, outcome }` |
| `DeviceRegistered` | Delivery | Analytics | `{ tenantId, deviceId, passTypeId, serialNumber, registeredAt }` |

---

## 6. Key Integration Chains

### 6.1 Points Earn → Wallet Update (critical path)
```
Staff scans QR
  → Scanning: validate token (HMAC + Redis nonce check)
  → Scanning emits ScanRecorded { scanId, passId, memberId, nonce }
  → Membership handler: EarnPointsCommand → Member.earn(delta) → PointsEarned
  → Pass Issuance handler: UpdatePassFieldsCommand → Pass.updateFields(newBalance, tier)
      → Pass emits PassFieldsUpdated { serialNumber, passTypeId, lastUpdated }
  → Delivery handler: query registrations by (passTypeId, serialNumber)
      → BullMQ job: APNs background push (priority 5, content-available: 1)
  → Apple device calls GET /v1/passes/{passTypeId}/{serial}
      → Pass Issuance signs fresh .pkpass and returns 200 application/vnd.apple.pkpass
```

### 6.2 Template Publish → New Pass Generation
```
Owner publishes CardTemplate v2
  → Card Design emits CardTemplatePublished { templateId, versionId }
  → ACL in Pass Issuance: translate to PassTemplate VO (rgb() colors, field layout, asset refs)
  → Pass Issuance stores local PassTemplate read-model
  → IssuePassCommand uses this PassTemplate for all subsequent .pkpass builds
```

### 6.3 Tier Upgrade → Wallet Notification
```
Membership: TierUpgraded emitted
  → Pass Issuance: update Pass tier field → PassFieldsUpdated
  → Delivery: APNs push (same chain as 6.1 from PassFieldsUpdated onward)
  → Notifications: send tier-upgrade congratulations email (via NotificationJob)
```

---

## 7. Source File Layout (context-to-path mapping)

```
src/
  domain/
    identity-access/          # IAC domain objects
    card-design/              # CardTemplate aggregate
    pass-issuance/            # Pass, PassTemplate (ACL copy), PassDocumentBuilder
    membership-loyalty/       # Member, PointsBalance, RewardRule
    scanning-redemption/      # Scan, RedemptionEvent, nonce policy
    delivery/                 # Device, Registration
    analytics/                # (no aggregates — read model; projections in application/)
    notifications/            # NotificationJob value objects
  application/
    identity-access/
    card-design/
    pass-issuance/
    membership-loyalty/
    scanning-redemption/
    delivery/
    analytics/
    notifications/
  infrastructure/
    postgres/                 # Kysely repos per context
    passkit/                  # passkit-generator adapter (IPassSigningPort)
    apns/                     # APNs adapter (IPushNotificationPort)
    s3/                       # asset upload / signed-URL adapter
    redis/                    # nonce store, rate limiter, response cache
    cert-store/               # ICertificateStore — KMS/secret store adapter
    queue/                    # BullMQ workers: apns-push, analytics-ingest
  presentation/
    rest/                     # Fastify route handlers per context
    passkit-webservice/       # 5 Apple PassKit REST endpoints (maps to Delivery handlers)
```
