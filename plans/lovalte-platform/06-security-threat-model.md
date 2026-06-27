# Security & Threat Model — Lovalte Platform

**Version:** 1.0 | **Date:** 2026-06-27 | **Scope:** All 8 bounded contexts

---

## 1. Authentication

### 1.1 Dashboard — Session Cookies

| Attribute | Value |
|-----------|-------|
| Storage | HttpOnly, Secure, SameSite=Strict cookie |
| Session token | 256-bit random (crypto.randomBytes), stored in Redis with TTL = 8 h |
| Rotation | Re-issued on privilege change; old token invalidated immediately |
| MFA | TOTP (RFC 6238) enforced for `owner` role; optional for `manager` |
| Login endpoint | POST `/api/auth/login` — bcrypt (cost 12) hash comparison; locked after 5 failures/15 min |

```typescript
// presentation/rest/auth/loginHandler.ts
const session = await sessionService.create({ userId, tenantId, role });
reply.setCookie('sid', session.token, {
  httpOnly: true, secure: true, sameSite: 'Strict', path: '/',
  maxAge: 8 * 3600
});
```

### 1.2 QR / Pass Scanning — Signed Token

QR payload is a compact signed token (HMAC-SHA256 or JWT HS256):

```
{ passId, tenantId, nonce, iat, exp }
```

- **nonce**: 128-bit random, stored in Redis `nonces:{passId}` set at issuance
- **exp**: `iat + 300 s` for scan tokens re-generated per session; pass `authenticationToken` never changes (Apple requirement)
- **Verification**: `infrastructure/signing/QrTokenVerifier.ts` — verify signature → check exp → atomically `SETNX nonces:used:{nonce}` (TTL 24 h) to detect replay before processing

---

## 2. Authorization — RBAC Matrix

| Action | Owner | Manager | Staff |
|--------|:-----:|:-------:|:-----:|
| Create / edit CardTemplate | Y | N | N |
| Publish template / issue passes | Y | Y | N |
| View dashboard + analytics | Y | Y | N |
| Scan QR (award/redeem points) | Y | Y | Y |
| Manage staff accounts | Y | Y | N |
| Export customer PII | Y | N | N |
| Delete tenant / GDPR wipe | Y | N | N |
| View audit log | Y | Y | N |
| Rotate signing secrets | Y (via KMS UI) | N | N |

RBAC is enforced in `application/` command handlers via `AuthorizationService.assertRole(actor, requiredRole)`. No role check inside `domain/`; no direct DB access in `presentation/`.

---

## 3. Tenant Isolation — Row-Level Security

Every tenant-owned table carries `tenant_id UUID NOT NULL`. Postgres RLS enforces isolation at the DB layer as a second line of defence behind application-layer scoping.

```sql
-- Applied to: card_templates, passes, members, scan_events, analytics_events, audit_log
ALTER TABLE passes ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON passes
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Set per connection/transaction in infrastructure/db/connection.ts
await db.executeQuery(
  sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`
);
```

Rules:
- All Kysely queries include `.where('tenant_id', '=', tenantId)` — belt-and-suspenders
- No cross-tenant joins; no shared sequences; separate S3 key prefixes per tenant (`tenants/{tenantId}/...`)
- Super-admin operations (Lovalte staff) go through a separate internal API with its own auth path and never touch the RLS connection pool

---

## 4. Injection Prevention

### 4.1 Parameterized SQL (Kysely)

```typescript
// infrastructure/db/repositories/PassRepository.ts
const pass = await db
  .selectFrom('passes')
  .where('id', '=', passId)       // bound param
  .where('tenant_id', '=', tenantId)
  .selectAll()
  .executeTakeFirstOrThrow();
```

String concatenation into SQL is forbidden by ESLint rule `no-sql-string-concat` (custom plugin). Raw `sql` tagged template used only in migration files.

### 4.2 Zod Boundary Validation

Every REST endpoint and BullMQ job handler validates with a Zod schema before touching the application layer. Unknown fields are stripped (`z.object({...}).strict()`).

```typescript
// presentation/rest/scan/scanSchema.ts
export const ScanRequestSchema = z.object({
  token: z.string().min(32).max(512),
  staffId: z.string().uuid(),
}).strict();
```

### 4.3 Output Encoding

- All HTML rendered by React (XSS-safe by default; `dangerouslySetInnerHTML` banned by ESLint)
- REST responses: `Content-Type: application/json`; no raw HTML in API responses
- Pass fields sanitized with `DOMPurify` on the builder before submission; re-validated on server against `[A-Za-z0-9 \-,.!?]+` patterns for freeform text fields

---

## 5. QR / Redemption Threat Mitigations

| Threat | Attack Vector | Mitigation |
|--------|--------------|------------|
| **Forgery** | Attacker crafts a fake QR | HMAC-SHA256 signature; verification fails without the signing key |
| **Replay** | Screenshot/copy of a valid QR used twice | Redis atomic `SETNX nonces:used:{nonce}` — second use returns 409 |
| **Double-spend** | Race condition: two scans arrive within ms | Idempotency key `idem:{passId}:{staffId}:{windowSec}` with Redis `SET NX PX 5000`; second wins lock, first returns cached result |
| **Token sharing** | Customer shares QR with non-member | `passId` bound to member; scan checks active membership status; staff sees photo on scan result screen |
| **Expired token** | Reuse after pass is cancelled | `exp` field enforced; cancelled passes flagged in Redis `passes:revoked:{passId}` checked before award |
| **Brute-force scan** | Attacker enumerates passId | Per-IP rate limit 20 req/min on `/api/scan`; per-staff-account limit 60 req/min; exponential back-off |
| **Mass issuance abuse** | Tenant auto-issues fake passes | Pass issuance requires authenticated owner/manager; usage metered per tenant plan |

### Idempotency Flow

```
POST /api/scan
  → validate token (zod)
  → verify HMAC + exp
  → SET nonces:used:{nonce} NX EX 86400  (Redis)
      ↳ conflict → 409 Already redeemed
  → SET idem:{passId}:{staffId}:{window} NX PX 5000
      ↳ conflict → return cached award result
  → domain: ScanningContext.recordScan(passId, staffId)
  → publish domain event → Membership context awards points
  → respond 200
```

---

## 6. Secrets & Certificate Handling

| Secret | Storage | Rotation |
|--------|---------|----------|
| QR signing key (HMAC-SHA256) | AWS KMS (AES-256 CMK) | 90-day automated rotation; old key kept 7 days for in-flight tokens |
| Apple Pass signing cert (`.p12`) | AWS Secrets Manager, never repo | Re-upload on renewal; `passkit-generator` loads at startup via `SecretsFetcher` |
| WWDR G4 intermediate cert | Bundled read-only in `infrastructure/apple/certs/` | Updated on Apple release; CI alert on expiry < 60 days |
| DB credentials | AWS Secrets Manager; injected as env at runtime | Rotated via RDS automatic rotation |
| Redis AUTH | Secrets Manager | Rotated quarterly |
| S3 presign key | IAM role (no static keys) | Automatic via instance profile |

```typescript
// infrastructure/secrets/SecretsFetcher.ts
export class SecretsFetcher {
  async getPassSigningCert(): Promise<Buffer> {
    const result = await secretsManager.getSecretValue({ SecretId: 'lovalte/pass-cert' });
    return Buffer.from(result.SecretBinary as Uint8Array);
  }
}
```

**Cert expiry alarms:** CloudWatch alarm fires at 60 days, 30 days, 7 days before Apple cert expiry. `scripts/check-cert-expiry.ts` runs nightly in CI and posts to Slack.

---

## 7. OWASP Top 10 Mapping

| OWASP 2021 | Lovalte Mitigation |
|------------|-------------------|
| A01 Broken Access Control | RBAC in application layer + Postgres RLS; tenant_id on all queries; no IDOR (UUIDs + ownership check) |
| A02 Cryptographic Failures | TLS 1.3 only; HMAC-SHA256 for QR; bcrypt cost 12 for passwords; secrets in KMS; no secrets in logs |
| A03 Injection | Kysely parameterized SQL; zod strict schemas; ESLint no-sql-string-concat; output encoding in React |
| A04 Insecure Design | DDD boundary enforcement; threat model (this doc); security review gate in CI |
| A05 Security Misconfiguration | Fastify security headers (helmet); CSP; CORS allow-list; no debug endpoints in production |
| A06 Vulnerable Components | Dependabot weekly scans; `npm audit` in CI; lockfile committed |
| A07 Auth & Session Failures | HttpOnly/Secure/SameSite cookies; session invalidation; MFA for owner; 5-failure lockout |
| A08 Software & Data Integrity | Signed QR tokens; S3 object integrity checksums; CI pipeline requires passing tests to deploy |
| A09 Security Logging & Monitoring | Append-only audit log (see §9); CloudWatch alerts; SIEM ingestion of audit events |
| A10 SSRF | No user-supplied URLs fetched server-side; S3 presign URLs generated server-side with allow-list bucket |

---

## 8. PII / GDPR

### 8.1 Data Map

| Data Element | Table | Classification | Retention |
|-------------|-------|---------------|-----------|
| Member email | `members.email` | PII | Until delete request |
| Member name | `members.display_name` | PII | Until delete request |
| Device push token | `device_registrations.push_token` | PII | Until device unregisters |
| Scan timestamp + location | `scan_events` | Pseudonymous | 2 years |
| Analytics aggregates | `analytics_daily_*` | Non-PII | 5 years |
| Audit log entries | `audit_log` | Operational | 7 years (regulatory) |

### 8.2 Minimization

- QR token carries `passId` only (no name/email on wire)
- Analytics pipeline strips PII before writing to `analytics_events`; only `memberId` hash retained
- Apple pass fields: first name only (no surname); no email on pass face

### 8.3 Export & Delete

```typescript
// application/gdpr/ExportMemberDataHandler.ts  (owner role only)
// Collects: member profile, scan history, pass metadata → ZIP → presigned S3 URL (15 min TTL)

// application/gdpr/DeleteMemberDataHandler.ts
// 1. Soft-delete member row (deleted_at = NOW())
// 2. Null-out PII columns: email, display_name
// 3. Revoke all passes (set passes.status = 'revoked')
// 4. Delete device_registrations (APNs tokens)
// 5. Enqueue APNs void-pass push
// 6. Write audit_log entry (immutable)
// Audit log entries kept but member_id foreign key set to NULL
```

Deletion completes within 72 hours (BullMQ job). Member can exercise rights via the business; Lovalte DPA requires businesses to action within 30 days.

### 8.4 Data Residency

Tenants can select region (EU / US / APAC) at sign-up. PostgreSQL, Redis, and S3 buckets are provisioned in the selected region. Cross-region replication disabled by default.

---

## 9. Append-Only Audit Log

```sql
CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  actor_id    UUID NOT NULL,          -- user who performed the action
  actor_role  TEXT NOT NULL,
  action      TEXT NOT NULL,          -- e.g. 'TEMPLATE_PUBLISHED', 'MEMBER_DELETED'
  target_type TEXT,                   -- e.g. 'Pass', 'Member'
  target_id   UUID,
  metadata    JSONB,                  -- sanitized, no PII values
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- No UPDATE/DELETE on audit_log — enforced by RLS + revoked write grants
CREATE POLICY audit_log_insert_only ON audit_log
  FOR INSERT WITH CHECK (true);
-- No SELECT policy for staff; owner/manager read via application layer only
```

Logged actions: login/logout, template publish, pass issuance, scan/redemption, points adjustment, member export/delete, secret rotation, role changes, billing events.

Audit log exported to CloudWatch Logs Insights + S3 Glacier after 90 days for long-term retention.

---

## 10. Abuse Cases & Mitigations

| Abuse Case | Impact | Mitigation |
|-----------|--------|------------|
| Tenant floods scan endpoint | DDoS, cost amplification | 60 req/min per staff account; 200 req/min per tenant; 429 with Retry-After |
| Attacker harvests pass IDs via scan | Mass replay attempt | Nonce consumed on first use; pass ID alone insufficient (signature required) |
| Rogue staff awards points to friends | Loyalty fraud | Scan events logged with staffId; anomaly alert > 10 scans/staff/hour |
| Tenant over-issues passes beyond plan | Revenue leakage | Pass count enforced at issuance via plan quota check (Redis counter) |
| Compromised signing key | All tokens forgeable | KMS key revocation + immediate re-sign all active passes; nonce namespace rotated |
| Apple cert expires silently | Passes stop updating | CloudWatch alarm at 60/30/7 days; automated Slack + PagerDuty alert |
| Builder XSS via card field | Stored XSS on other tenants' dashboards | DOMPurify on client; server-side pattern validation; CSP blocks inline scripts |
| SSRF via webhook URL (future feature) | Internal network access | Webhook URLs validated against public IP allow-list; no private RFC 1918 ranges |
| Bulk member import with fake emails | Spam, account pollution | Email format validation (zod); per-tenant import rate limit; disposable domain block-list |
| Parallel GDPR delete + scan race | Inconsistent state | Soft-delete sets `status = 'deleted'`; scan handler rejects deleted members atomically |

---

*File:* `plans/lovalte-platform/06-security-threat-model.md`
