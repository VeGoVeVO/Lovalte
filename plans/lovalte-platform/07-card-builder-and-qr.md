# 07 — Card Builder & QR Pipeline

## 1. Builder Domain Model (Card Design / Builder Context)

### 1.1 CardTemplate Aggregate

Root: **CardTemplate** · Identity: `CardTemplateId` (UUID VO)

| Field | Type | Notes |
|---|---|---|
| `tenantId` | `TenantId` VO | Row-Level Security anchor — on every query |
| `status` | `draft \| published` | Only `published` triggers issuance |
| `version` | integer | Monotonic; incremented on every `PublishCardTemplate` |
| `brand` | `BrandConfig` VO | Colors, fields, image refs, logoText, orgName |
| `rewardRule` | `RewardRule` VO | Points-per-visit, threshold, tier breakpoints |

Events: `CardTemplateCreated`, `CardTemplateSaved`, `CardTemplatePublished`

```typescript
// src/domain/card-design/CardTemplate.ts
export class CardTemplate {
  publish(): void {
    this._brand.validate();       // throws DomainError on invalid rgb()/field counts
    this._version += 1;
    this._status = TemplateStatus.Published;
    this._events.push(new CardTemplatePublished(this.id, this.tenantId, this._version));
  }
  // authenticationToken NEVER lives here — it lives on Pass, immutable after issuance
}
```

### 1.2 BrandConfig Value Object

```typescript
// src/domain/card-design/BrandConfig.ts
export class BrandConfig {
  validate(): void {
    validateRgb(this.backgroundColor);   // "rgb(r, g, b)" — hex silently breaks Wallet
    validateRgb(this.foregroundColor);
    if (this.labelColor) validateRgb(this.labelColor);
    const combined = this.secondaryFields.length + this.auxiliaryFields.length;
    if (combined > 4) throw new DomainError('secondaryFields + auxiliaryFields must be ≤ 4 with QR barcode');
    if (this.headerFields.length > 3) throw new DomainError('headerFields max 3');
    if (this.primaryFields.length !== 1) throw new DomainError('exactly 1 primaryField required');
  }
}
```

---

## 2. What the Merchant Configures (Builder UI)

The React builder sends `SaveCardTemplate` then `PublishCardTemplate`. All inputs are validated at the HTTP boundary with zod; domain invariants re-validated in aggregate.

| Section | Field | Constraint |
|---|---|---|
| **Brand** | `organizationName` | 1–64 chars |
| | `logoText` | optional, ≤24 chars |
| | `backgroundColor` | `rgb(r, g, b)` — validated; hex rejected |
| | `foregroundColor` | `rgb(r, g, b)` |
| | `labelColor` | `rgb(r, g, b)`, optional |
| **Images** | `iconS3Key` @1x/2x/3x | 29×29 / 58×58 / 87×87 px PNG; required |
| | `logoS3Key` @1x/2x/3x | ≤160×50 / ≤320×100 / ≤480×150 px PNG |
| | `stripS3Key` @1x/2x/3x | **375×144 / 750×288 / 1125×432 px PNG** (NOT 375×98) |
| **Fields** | `headerFields[]` | ≤3; e.g. `{ key:"tier", label:"TIER", valueTemplate:"{{tier}}" }` |
| | `primaryField` | exactly 1; e.g. points balance |
| | `secondaryFields[]` | combined with auxiliary ≤4 |
| | `auxiliaryFields[]` | combined with secondary ≤4 |
| | `backFields[]` | unlimited; must include org contact info |
| **Barcode** | (fixed, not configurable) | `PKBarcodeFormatQR`, `iso-8859-1` |
| **Location** | `locations[]` | optional, max 10, `{ lat, lng, relevantText }` |
| **Reward** | `pointsPerVisit` | integer ≥1 |
| | `rewardThreshold` | points to unlock a reward |
| | `tierRules[]` | e.g. `[{label:"Bronze",min:0},{label:"Gold",min:500}]` |

`changeMessage` on the points field **must contain `%@`** — Wallet shows it on the lock screen after an APNs update. Set to e.g. `"Your balance is now %@!"`.

---

## 3. Image Validation (Infrastructure, pre-publish gate)

`ImageValidationService` runs inside `PublishCardTemplateHandler` before calling `template.publish()`. Reads each S3 key, checks PNG dimensions and format.

| Asset | @1x px | @2x px | @3x px | Max file size |
|---|---|---|---|---|
| `icon.png` | 29×29 | 58×58 | 87×87 | 256 KB each |
| `logo.png` | ≤160×50 | ≤320×100 | ≤480×150 | 512 KB each |
| `strip.png` | **375×144** | **750×288** | **1125×432** | 1 MB each |

Rules: PNG only · sRGB · alpha allowed · CMYK rejected · all three scales required for icon and strip. Returns structured 422 errors with `{ asset, expected, actual, code }` so the builder UI can highlight the failing upload.

---

## 4. Publish Command

```
POST /api/tenants/:tenantId/card-templates/:id/publish
RBAC: owner | manager
```

`PublishCardTemplateHandler` (application layer):
1. Load `CardTemplate` scoped by `tenantId` (RLS enforced in SQL too)
2. `ImageValidationService.validate(brand.imageRefs)` → 422 on failure
3. `template.publish()` → domain validates colors, field counts
4. `ICardTemplateRepository.save(template)`
5. Emit `CardTemplatePublished` → consumed by Pass Issuance context
6. Return `{ id, version, status: "published" }`

---

## 5. Issuance Pipeline (IssuePass end-to-end)

### 5.1 Sequence Diagram

```
Client         IssuePassHandler      PassDocumentBuilder  IPassSigningPort   S3      Postgres
  |                  |                       |                   |            |          |
  |--IssuePassCmd -->|                       |                   |            |          |
  |                  |-- load Member ------->DB                  |            |          |
  |                  |-- load CardTemplate ->DB                  |            |          |
  |                  |-- mint serialNumber --(crypto.randomUUID) |            |          |
  |                  |-- mint authToken -----(randomBytes(32))   |            |          |
  |                  |-- mint qrNonce -------(randomBytes(16))   |            |          |
  |                  |-- build(pass,tmpl,member) ->|             |            |          |
  |                  |<-- PassDocument (pure DTO) --|            |            |          |
  |                  |-- sign(passDoc, imageRefs) ------------->|            |          |
  |                  |<-- .pkpass Buffer ---------------------------          |          |
  |                  |-- PUT buffer ---------------------------------------->|          |
  |                  |   key: passes/{tenantId}/{serial}/{version}.pkpass    |          |
  |                  |-- persist Pass --------------------------------------->|          |
  |                  |-- SET pkpass:{serial}:{ver} (Redis, 24h TTL)          |          |
  |<-- .pkpass buf --|                                                        |          |
```

### 5.2 PassDocumentBuilder (domain service — pure, zero I/O)

```typescript
// src/domain/pass-issuance/PassDocumentBuilder.ts
export class PassDocumentBuilder {
  build(pass: Pass, template: CardTemplate, member: MemberSnapshot): PassDocument {
    return {
      formatVersion: 1,
      passTypeIdentifier: pass.passTypeId.value,   // e.g. "pass.com.lovalte.loyalty"
      serialNumber: pass.serialNumber.value,
      teamIdentifier: template.brand.teamIdentifier,
      organizationName: template.brand.organizationName,
      description: `${template.brand.organizationName} loyalty card`,
      backgroundColor: template.brand.backgroundColor.toRgbString(),
      foregroundColor: template.brand.foregroundColor.toRgbString(),
      labelColor: template.brand.labelColor?.toRgbString(),
      logoText: template.brand.logoText,
      webServiceURL: 'https://passes.lovalte.com/v1/',
      authenticationToken: pass.authenticationToken.value,  // immutable, ≥32 random chars
      barcodes: [{
        format: 'PKBarcodeFormatQR',
        message: QrTokenFactory.build(pass.id, member.tenantId, pass.qrNonce),
        messageEncoding: 'iso-8859-1',
        altText: `Member #${member.memberNumber}`,
      }],
      storeCard: this.resolveFields(template.brand.fieldSpecs, member),
    };
  }
  // resolveFields substitutes {{points}}, {{tier}}, {{memberName}} from MemberSnapshot
}
```

### 5.3 IPassSigningPort → PassKitSigningAdapter (infrastructure)

```typescript
// src/domain/pass-issuance/ports.ts
export interface IPassSigningPort {
  sign(doc: PassDocument, imageRefs: ImageRefs): Promise<Buffer>;
}

// src/infrastructure/pass-issuance/PassKitSigningAdapter.ts  (passkit-generator v3.5.7)
export class PassKitSigningAdapter implements IPassSigningPort {
  async sign(doc: PassDocument, imageRefs: ImageRefs): Promise<Buffer> {
    const certs = await this.certStore.getSigningMaterial(); // from KMS — WWDR G4 + p12
    const pass = await PKPass.from(
      { model: this.buildModelFolder(imageRefs) },  // static model with icon/logo/strip
      { ...doc, certificates: certs },
    );
    return pass.getAsBuffer();  // MIME: application/vnd.apple.pkpass
  }
}
```

### 5.4 Pre-generate + Cache (GET /v1/passes/:passTypeId/:serial)

Serving handler checks in order:
1. Load `Pass` by `(passTypeId, serialNumber)`, verify `Authorization: ApplePass <token>` → 401 on mismatch
2. Compare `pass.updatedAt` vs `If-Modified-Since` → **304** if unchanged
3. Check Redis key `pkpass:{serial}:{version}` → hit: serve from S3 signed URL, return `Last-Modified`
4. Cache miss → `PassDocumentBuilder.build()` + `IPassSigningPort.sign()` → write S3 + Redis → serve buffer
5. Response: `Content-Type: application/vnd.apple.pkpass`, `Last-Modified: updatedAt.toUTCString()`

---

## 6. QR Token Format & Signing

The barcode `message` is a compact **HS256 JWT** — not a cleartext member ID.

```
Header: { "alg": "HS256", "typ": "JWT" }
Claims: {
  "sub": "<passId UUID>",     // Pass aggregate ID
  "tid": "<tenantId UUID>",   // verified on every scan — tenant isolation
  "nce": "<16-byte hex>",     // single-use nonce, Redis-tracked
  "iat": <epoch seconds>,
  "exp": <iat + 315360000>    // 10-year nominal expiry; nonce is the real guard
}
Signed with: HMAC-SHA256(header.claims, tenantQrSecret)
```

`tenantQrSecret`: 32-byte per-tenant secret, stored in KMS. Never in DB or repo.

---

## 7. Scan → Verify → RedeemScan Flow

### 7.1 Sequence Diagram

```
Staff App      ScanController    RedeemScanHandler     Redis          MemberRepo  ScanRepo
    |                |                  |                 |               |           |
    |--POST /scan -->|                  |                 |               |           |
    | {qrPayload,    |                  |                 |               |           |
    |  scanId(uuid)} |                  |                 |               |           |
    |                |--RedeemScanCmd ->|                 |               |           |
    |                |                  |--verify JWT --->|               |           |
    |                |                  | (sig+exp+tid)   |               |           |
    |                |                  |--SETNX qr:nonce:{nce} EX 90d ->|           |
    |                |                  |<-- 0 (replay) or 1 (fresh) ----|           |
    |                |                  | [0 → 409 Conflict]             |           |
    |                |                  |--GET scan:idem:{scanId} ------->|           |
    |                |                  | [hit → return cached result]   |           |
    |                |                  |--load Member ---------------------------------------->|
    |                |                  |--member.earnPoints(N) (domain) |               |           |
    |                |                  |--save Member ---------------------------------------->|
    |                |                  |--save RedemptionEvent -------------------------------->|
    |                |                  |--SET scan:idem:{scanId} EX 30s->|           |
    |                |                  |--emit PointsEarned ------------->               |           |
    |<--200 OK ------|                  |                                 |               |           |
    | {points, balance, tier}           |                                 |               |           |
```

### 7.2 Idempotency & Replay Defense (two Redis guards)

| Guard | Redis key | TTL | On collision |
|---|---|---|---|
| **QR replay** | `qr:nonce:{nce}` | 90 days | 409 "QR already redeemed" |
| **Double-tap idempotency** | `scan:idem:{scanId}` | 30 seconds | 200 with cached result |

Both use `SET key value NX` (atomic set-if-not-exists). `scanId` is a UUID v4 generated per tap by the staff app.

```typescript
// src/application/scanning/RedeemScanHandler.ts (key excerpt)
const claims = await this.qrVerifier.verify(cmd.qrPayload);  // throws on bad sig/exp
if (claims.tid !== cmd.tenantId.value) throw new ForbiddenError('tenant mismatch');

const fresh = await this.redis.set(`qr:nonce:${claims.nce}`, '1', 'NX', 'EX', 7776000);
if (!fresh) throw new ConflictError('QR already redeemed');

const cached = await this.redis.get(`scan:idem:${cmd.scanId}`);
if (cached) return JSON.parse(cached);  // double-tap safe

// ... award points, persist, cache result for 30 s
```

---

## 8. Pre-generate + Cache Strategy

**S3 key:** `passes/{tenantId}/{serialNumber}/{version}.pkpass`
**Redis key:** `pkpass:{serialNumber}:{version}` (TTL 24 h) — stores S3 object key or signed URL

On `PointsEarned` or `TierUpgraded` events:
1. `UpdatePassFieldsHandler` bumps `pass.updatedAt` (monotonic tag), increments `pass.templateVersion`
2. BullMQ job `regenerate-pass:{passId}` queued (idempotent by passId, deduplicated)
3. Job: `PassDocumentBuilder.build()` + `IPassSigningPort.sign()` → write new S3 object → set new Redis key → delete old Redis key
4. APNs push: `apns-push-type: background`, `apns-priority: 5`, payload `{}`, topic = `passTypeIdentifier`
5. On next device poll, handler serves from new S3 buffer with updated `Last-Modified`

---

## 9. Edge Cases

### 9.1 Republish while passes live

`CardTemplatePublished@version N+1` triggers a BullMQ `bulk-republish:{templateId}` job. It pages through all active passes for that template and enqueues individual `regenerate-pass:{passId}` jobs. Each job:
- Reloads `Pass` + `CardTemplate@latest`
- Rebuilds + re-signs the pass buffer
- Writes new S3 object at `…/{serial}/{newVersion}.pkpass`
- Bumps `pass.template_version`, `pass.updated_at`
- Invalidates old Redis cache key
- Pushes APNs (one push per changed pass serial, not per device — let Apple fan out)

Until the job completes, devices poll and receive the old version. **`authenticationToken` is never touched** during republish — Apple's hard requirement.

### 9.2 Image validation failures

`PublishCardTemplateHandler` calls `ImageValidationService.validate()` before `template.publish()`. On failure, `CardTemplate` stays in `draft`; no event is raised. HTTP 422:
```json
{ "error": "IMAGE_VALIDATION_FAILED",
  "details": [{ "asset": "strip@2x", "expected": "750x288", "actual": "750x300" }] }
```

### 9.3 QR expiry and rotation

- Default `exp` is 10 years (pass lifetime). Nonce is the real single-use guard.
- **Rotation trigger:** member reports lost card, or admin calls `RotateQrCommand`.
- Handler: immediately revoke old nonce (`SET qr:nonce:{oldNonce} "revoked" NX EX 90d`), generate new 16-byte nonce, rebuild QR JWT, rebuild + re-sign pass, store new buffer, push APNs.
- Staff scanning the old physical QR receives 409 after rotation.

---

## 10. PostgreSQL Schema (Builder + QR additions)

```sql
-- Card Design context
CREATE TABLE card_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  version      INTEGER NOT NULL DEFAULT 0,
  brand_config JSONB NOT NULL,   -- BrandConfig VO: colors (rgb strings), fields, logoText
  reward_rule  JSONB NOT NULL,   -- { pointsPerVisit, rewardThreshold, tierRules[] }
  image_refs   JSONB NOT NULL,   -- { icon,logo,strip } × { s3key1x,s3key2x,s3key3x }
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX card_templates_tenant ON card_templates (tenant_id, status);

-- Extend passes table (research 07) with QR nonce + template version
ALTER TABLE passes ADD COLUMN qr_nonce         TEXT NOT NULL DEFAULT '';
ALTER TABLE passes ADD COLUMN template_version INTEGER NOT NULL DEFAULT 1;

-- Append-only scan audit log (Scanning & Redemption context)
CREATE TABLE redemption_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  pass_id      UUID NOT NULL REFERENCES passes(id),
  member_id    UUID NOT NULL,
  scan_id      UUID NOT NULL UNIQUE,    -- idempotency key from staff app
  points_delta INTEGER NOT NULL,
  scanned_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX redemption_events_pass   ON redemption_events (pass_id, scanned_at);
CREATE INDEX redemption_events_member ON redemption_events (member_id, scanned_at);
```

---

## 11. File Map

| Path | Purpose |
|---|---|
| `src/domain/card-design/CardTemplate.ts` | Aggregate root; publish() enforces invariants |
| `src/domain/card-design/BrandConfig.ts` | VO: rgb() validation, field-count guard |
| `src/domain/card-design/RewardRule.ts` | VO: points, tiers |
| `src/domain/pass-issuance/PassDocumentBuilder.ts` | Pure domain service — no I/O |
| `src/domain/pass-issuance/QrTokenFactory.ts` | HS256 JWT builder (pure) |
| `src/domain/pass-issuance/ports.ts` | IPassSigningPort, IPassRepository, ICardTemplateRepository |
| `src/application/card-design/PublishCardTemplateHandler.ts` | Image validate → publish → emit |
| `src/application/pass-issuance/IssuePassHandler.ts` | Mint serial/token/nonce, build, sign, cache |
| `src/application/scanning/RedeemScanHandler.ts` | JWT verify, nonce guard, award points |
| `src/infrastructure/pass-issuance/PassKitSigningAdapter.ts` | passkit-generator v3.5.7 + WWDR G4 |
| `src/infrastructure/pass-issuance/ImageValidationService.ts` | PNG dimension/format checks |
| `src/infrastructure/pass-issuance/S3PassBufferStore.ts` | Store/fetch signed .pkpass buffers |
| `src/infrastructure/scanning/QrVerifier.ts` | HS256 verify, tenant check, KMS secret lookup |
| `src/presentation/passes/PassKitWebServiceRouter.ts` | 5 PassKit endpoints (research 06) |
| `src/presentation/card-design/CardBuilderRouter.ts` | Builder REST (save/publish/upload) |
