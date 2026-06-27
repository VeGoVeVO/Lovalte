# 02 — Domain Model: Aggregates, Entities, Value Objects, Events

> Layer: `domain/` — pure TypeScript, zero I/O, no infrastructure imports.
> Every source file in this layer must stay ≤ 300 lines.

---

## Bounded-Context Map (8 contexts)

| Context | Aggregate Roots | Upstream / Downstream |
|---|---|---|
| **Identity & Access** | `Tenant`, `User` | Upstream to all |
| **Card Design / Builder** | `CardTemplate` | Downstream of I&A; upstream of Pass Issuance |
| **Pass Issuance** | `Pass` | Downstream of Card Design + Membership; upstream of Delivery |
| **Membership / Loyalty** | `Member` | Downstream of I&A; emits events consumed by Pass Issuance |
| **Scanning & Redemption** | `Scan`, `RedemptionEvent` | Downstream of Pass Issuance + Membership |
| **Delivery** | `Device` | Downstream of Pass Issuance |
| **Analytics** | read model only (no aggregate) | Downstream of all; append-only |
| **Notifications** | supporting — no aggregate | Downstream of Membership |

Integration rule: contexts publish **domain events**; consumers use an Anti-Corruption Layer if models differ. No shared domain objects cross context boundaries.

---

## 1. Identity & Access Context

### Aggregate: `Tenant`
Root entity representing a signed-up business.

| Concept | Kind | Notes |
|---|---|---|
| `TenantId` | VO | UUID, immutable |
| `TenantName` | VO | 1–100 chars, trimmed, non-empty |
| `PlanTier` | VO | enum `starter \| pro \| enterprise` |
| `TenantStatus` | VO | enum `active \| suspended \| cancelled` |
| `User[]` | entity (by ID reference) | accessed by `UserId` only |

**Invariants:**
- A `suspended` tenant's staff may not scan or issue passes.
- At least one `owner`-role user must exist before activation.

**Domain events:** `TenantCreated`, `TenantSuspended`, `TenantReactivated`

---

### Aggregate: `User`
Root entity for a person who operates Lovalte (owner, manager, staff).

| Concept | Kind | Notes |
|---|---|---|
| `UserId` | VO | UUID |
| `TenantId` | VO | FK by ID only |
| `Email` | VO | validated RFC-5321; lowercase-normalised |
| `HashedPassword` | VO | bcrypt/argon2; never exposed |
| `Role` | VO | enum `owner \| manager \| staff` |
| `UserStatus` | VO | enum `active \| invited \| disabled` |

**Invariants:**
- `Email` unique within `TenantId`.
- Only `owner` may change another user's `Role`.

**Domain events:** `UserInvited`, `UserActivated`, `UserRoleChanged`, `UserDisabled`

---

## 2. Card Design / Builder Context

### Aggregate: `CardTemplate`

| Concept | Kind | Notes |
|---|---|---|
| `CardTemplateId` | VO | UUID |
| `TenantId` | VO | FK by ID only |
| `PassTypeIdentifier` | VO | reverse-DNS e.g. `pass.com.lovalte.loyalty`; must match signing cert |
| `TeamIdentifier` | VO | 10-char Apple Developer Team ID |
| `OrganizationName` | VO | string 1–64 chars |
| `Description` | VO | string (VoiceOver label) |
| `LogoText` | VO | optional string |
| `RgbColor` | VO | `{ r, g, b }` each 0–255; serialises to `rgb(r, g, b)` |
| `ColorScheme` | VO | `{ background: RgbColor, foreground: RgbColor, label: RgbColor }` |
| `ImageAssetRefs` | VO | `{ icon: S3Key, logo: S3Key, strip?: S3Key }` — strip is 375×144 pt |
| `FieldLayout` | VO | `{ headerFields, primaryFields, secondaryFields, auxiliaryFields, backFields }` each `FieldDefinition[]` |
| `FieldDefinition` | VO | `{ key, label, region, numberStyle?, changeMessage? }` |
| `BarcodeConfig` | VO | `{ format: 'PKBarcodeFormatQR', messageEncoding: 'iso-8859-1' \| 'utf-8' }` |
| `WebServiceURL` | VO | HTTPS URL ending with `/` |
| `PublishedVersion` | VO | monotonic integer; `0` = draft |
| `TemplateStatus` | VO | enum `draft \| published \| archived` |

**Invariants:**
- `secondaryFields` + `auxiliaryFields` combined ≤ 4 when barcode format is QR/Aztec (square).
- Colors must use `rgb()` syntax; hex is silently ignored by Apple Wallet — reject at boundary.
- `strip.png` must be 375×144 pt; enforce at upload boundary.
- `TemplateStatus` transition: `draft → published → archived`; published may not revert to draft.

**Domain events:** `CardTemplatePublished`, `CardTemplateArchived`

---

## 3. Pass Issuance Context

### Value Objects (foundational)

| VO | Description |
|---|---|
| `SerialNumber` | Globally unique per `PassTypeIdentifier` (UUID/ULID). Immutable after minting. |
| `AuthenticationToken` | ≥ 32 random chars (`crypto.randomBytes(32).toString('hex')`). **Immutable after issuance** — never changes on updates. |
| `PassFieldValue` | `{ key: string, label: string, value: string \| number, changeMessage?: string }` |
| `BarcodePayload` | Compact HMAC-SHA256-signed token `{ passId, tenantId, nonce, iat }`; used as QR `message` |
| `PassTypeId` | UUID reference to the `CardTemplate` record |
| `UpdateTag` | Opaque monotonic string (ISO 8601 timestamp); returned as `lastUpdated`, received as `passesUpdatedSince` |

### Aggregate: `Pass`

```typescript
// domain/passes/Pass.ts
export interface PassProps {
  id: PassId;                        // internal UUID
  serialNumber: SerialNumber;        // Apple identity; immutable
  passTypeId: PassTypeId;            // ref to CardTemplate by ID only
  memberId: MemberId;                // ref to Member by ID only; never the object
  tenantId: TenantId;
  authenticationToken: AuthenticationToken; // immutable
  fieldValues: PassFieldValue[];
  barcodePayload: BarcodePayload;
  voided: boolean;
  status: PassStatus;
  lastUpdated: UpdateTag;            // monotonic; drives If-Modified-Since
  createdAt: Date;
}

export type PassStatus = 'active' | 'voided' | 'expired';
```

**State machine:**

```
minted ──► active ──► voided
                └──► expired (expirationDate reached)
```

**Invariants:**
- `authenticationToken` is set once at minting; any attempt to change it throws a domain error.
- `lastUpdated` must be monotonically increasing on every field update.
- A `voided` pass can be served (so Wallet shows it as voided) but cannot earn or redeem points.
- `barcodePayload` contains a `nonce` (single-use); server verifies via Redis before redeeming.

**Domain events:** `PassIssued`, `PassFieldsUpdated`, `PassVoided`

**Domain service (pure):** `PassDocumentBuilder` — takes `Pass` + `CardTemplate` DTO → returns `pass.json` plain object. No I/O.

---

## 4. Membership / Loyalty Context

### Value Objects

| VO | Description |
|---|---|
| `MemberId` | UUID |
| `PointsBalance` | Non-negative integer. Enforce via factory: `PointsBalance.of(n)` throws if `n < 0`. |
| `Tier` | `{ name: string, minPoints: number }` — derived from active `RewardRule[]` |
| `TierName` | enum or string: e.g. `'bronze' \| 'silver' \| 'gold' \| 'platinum'` |

### Entity: `RewardRule`
Owned by `Member`'s tenant context (stored in `CardTemplate` config or a separate tenant-level table).

| Field | Type | Notes |
|---|---|---|
| `ruleId` | UUID | |
| `tenantId` | TenantId | |
| `name` | string | e.g. "Gold tier" |
| `minPoints` | number | threshold |
| `pointsPerScan` | number | how many points a staff scan awards |
| `rewardThreshold` | number | points needed to redeem a reward |

### Aggregate: `Member`

```typescript
// domain/loyalty/Member.ts
export interface MemberProps {
  id: MemberId;
  tenantId: TenantId;
  displayName: string;
  email?: Email;                    // PII — may be null (anonymous enrolment)
  pointsBalance: PointsBalance;
  currentTier: TierName;
  linkedPassSerialNumbers: SerialNumber[]; // IDs only; no Pass objects
  enrolledAt: Date;
  status: MemberStatus;
}

export type MemberStatus = 'active' | 'suspended' | 'deleted';
```

**Invariants:**
- `pointsBalance` never goes negative (award only; redemption sets a separate `RedemptionEvent`).
- `currentTier` is recomputed whenever `pointsBalance` changes against the tenant's `RewardRule[]`.
- A `deleted` Member triggers GDPR erasure: PII wiped, balance zeroed, pass voided.

**Domain events:** `MemberEnrolled`, `PointsEarned`, `BalanceUpdated`, `TierUpgraded`, `MemberDeleted`

---

## 5. Scanning & Redemption Context

### Value Objects

| VO | Description |
|---|---|
| `IdempotencyKey` | `{ tenantId, passId, nonce }` — SHA-256 fingerprint stored in Redis; ensures exactly-once redemption even on double-tap/retry |
| `ScanResult` | `{ outcome: 'awarded' \| 'redeemed' \| 'rejected', reason?: string }` |
| `QrToken` | Parsed + verified `{ passId, tenantId, nonce, iat }`; created by `QrTokenVerifier` domain service |

### Aggregate: `Scan`

```typescript
// domain/scanning/Scan.ts
export interface ScanProps {
  id: ScanId;
  tenantId: TenantId;
  staffUserId: UserId;          // who performed the scan
  passId: PassId;               // ref by ID only
  memberId: MemberId;           // ref by ID only
  qrToken: QrToken;
  idempotencyKey: IdempotencyKey;
  scannedAt: Date;
  result: ScanResult;
}
```

**Invariants:**
- `idempotencyKey` must be absent from Redis before processing; insert it atomically (SET NX + TTL) to prevent replay.
- A scan of a `voided` or `expired` pass must resolve to `rejected`.
- A scan by a staff user from a different `tenantId` must resolve to `rejected`.

**Entity: `RedemptionEvent`** (within Scan context)

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `scanId` | ScanId | parent scan |
| `memberId` | MemberId | |
| `pointsDelta` | number | positive = award; negative = redeem |
| `rewardGranted` | boolean | true when threshold crossed |
| `recordedAt` | Date | |

**Domain events:** `ScanRecorded`, `PointsAwarded`, `RewardRedeemed`, `ScanRejected`

---

## 6. Delivery Context

### Value Objects

| VO | Description |
|---|---|
| `DeviceLibraryIdentifier` | Opaque Apple-assigned string per device; immutable |
| `PushToken` | APNs token; may be overwritten on re-registration |
| `PassTypeIdentifier` | Matches `CardTemplate.passTypeIdentifier`; used as APNs `apns-topic` |

### Aggregate: `Device`

```typescript
// domain/delivery/Device.ts
export interface DeviceProps {
  id: DeviceId;
  deviceLibraryIdentifier: DeviceLibraryIdentifier; // Apple's opaque id
  pushToken: PushToken;          // latest; overwritten on re-register
  updatedAt: Date;
}
```

**Entity: `Registration`** (child within Device aggregate OR standalone with composite key)

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `deviceId` | DeviceId | |
| `passTypeId` | PassTypeId | ref by ID |
| `serialNumber` | SerialNumber | ref by ID |
| `registeredAt` | Date | |

**Invariants:**
- `(deviceId, passId)` pair is unique — `UNIQUE (device_id, pass_id)` enforced at DB level.
- `pushToken` is overwritten (not versioned) on re-registration; the previous token is discarded.
- If APNs reports a token as invalid, `Device` + its `Registration[]` must be deleted.

**Domain events:** `DeviceRegistered`, `DeviceUnregistered`, `PushTokenUpdated`

---

## 7. Cross-Context Event Flow

```
[Scanning & Redemption]
  ScanRecorded → PointsAwarded
        │
        ▼
[Membership / Loyalty]
  Member.awardPoints() → BalanceUpdated → TierUpgraded?
        │
        ▼ (via domain event)
[Pass Issuance]
  PassFieldsUpdated (points, tier field values bumped; lastUpdated bumped)
        │
        ▼ (via domain event)
[Delivery]
  Query registrations for (passTypeId, serialNumber)
  APNs empty push → device polls endpoints 2 + 3
```

No context holds a reference to another context's domain objects — only IDs and DTOs via Anti-Corruption Layers.

---

## 8. Pass State Machine (full detail)

```
                  ┌─────────────────────────────┐
                  │        Pass States           │
                  └─────────────────────────────┘

  IssuePassCommand
       │
       ▼
  [ minted ] ──(persisted)──► [ active ]
                                   │
               ┌───────────────────┼──────────────────────┐
               │                   │                      │
     VoidPass  │         FieldsUpdated             expirationDate
    Command    │         (points/tier)               reached
               │                   │                      │
               ▼                   ▼                      ▼
           [ voided ]         [ active ]           [ expired ]
              (pass.json voided=true pushed)
```

Transitions enforced in `Pass` domain methods:
- `Pass.updateFields(newValues)` — throws `PassVoidedError` if `voided = true`.
- `Pass.void()` — idempotent; sets `voided = true`, bumps `lastUpdated`, emits `PassVoided`.

---

## 9. Redemption Idempotency State Machine

```
  QR Scan received
       │
       ▼
  Parse + verify HMAC signature
       │ invalid ──► ScanRejected (reason: forged/expired)
       ▼ valid
  Redis SET NX idempotencyKey (TTL 24h)
       │ key exists ──► ScanRejected (reason: replay)
       ▼ key absent (inserted)
  Check Pass status
       │ voided/expired ──► ScanRejected (reason: invalid pass)
       ▼ active
  Apply RewardRule (award or redeem)
       │
       ▼
  ScanRecorded + PointsAwarded | RewardRedeemed
```

---

## 10. TypeScript Interface Sketches (3 Key Aggregates)

### `CardTemplate` — builder config (pure domain)

```typescript
// domain/carddesign/CardTemplate.ts

export interface RgbColor { r: number; g: number; b: number }
export const toRgbString = (c: RgbColor) => `rgb(${c.r}, ${c.g}, ${c.b})`;

export interface FieldDefinition {
  key: string;
  label: string;
  region: 'header' | 'primary' | 'secondary' | 'auxiliary' | 'back';
  numberStyle?: 'PKNumberStyleDecimal' | 'PKNumberStylePercent';
  changeMessage?: string;  // must contain %@
}

export interface CardTemplateProps {
  id: string;                        // CardTemplateId (UUID)
  tenantId: string;
  passTypeIdentifier: string;        // 'pass.com.lovalte.<slug>'
  teamIdentifier: string;            // 10-char Apple Team ID
  organizationName: string;
  description: string;
  logoText?: string;
  colorScheme: { background: RgbColor; foreground: RgbColor; label: RgbColor };
  imageAssetRefs: { icon: string; logo: string; strip?: string };  // S3 keys
  fieldDefinitions: FieldDefinition[];
  barcodeFormat: 'PKBarcodeFormatQR';
  webServiceURL: string;             // HTTPS, trailing '/'
  publishedVersion: number;
  status: 'draft' | 'published' | 'archived';
}

export class CardTemplate {
  private constructor(private readonly props: CardTemplateProps) {}

  static create(props: CardTemplateProps): CardTemplate {
    const sqFields = props.fieldDefinitions.filter(
      f => f.region === 'secondary' || f.region === 'auxiliary',
    ).length;
    if (sqFields > 4) throw new Error('secondary + auxiliary fields must not exceed 4 for QR barcodes');
    return new CardTemplate(props);
  }

  publish(): CardTemplate {
    if (this.props.status === 'archived') throw new Error('Cannot publish archived template');
    return new CardTemplate({ ...this.props, status: 'published', publishedVersion: this.props.publishedVersion + 1 });
  }

  get id() { return this.props.id; }
  get passTypeIdentifier() { return this.props.passTypeIdentifier; }
  get colorScheme() { return this.props.colorScheme; }
  get fieldDefinitions() { return [...this.props.fieldDefinitions]; }
}
```

### `Pass` — core issuance aggregate (pure domain)

```typescript
// domain/passes/Pass.ts

import type { DomainEvent } from '../shared/DomainEvent';

export interface PassFieldValue { key: string; label: string; value: string | number; changeMessage?: string }

export class AuthenticationToken {
  private constructor(private readonly value: string) {}
  static mint(): AuthenticationToken {
    // caller provides 32 hex bytes from crypto.randomBytes — pure domain receives it
    throw new Error('Use AuthenticationToken.fromRaw(hex)');
  }
  static fromRaw(raw: string): AuthenticationToken {
    if (raw.length < 32) throw new Error('authenticationToken must be >= 32 chars');
    return new AuthenticationToken(raw);
  }
  toString(): string { return this.value; }
  // No setter — immutable by design
}

export class Pass {
  private events: DomainEvent[] = [];

  private constructor(
    public readonly id: string,
    public readonly serialNumber: string,
    public readonly passTypeId: string,
    public readonly memberId: string,
    public readonly tenantId: string,
    private readonly authToken: AuthenticationToken,  // private, immutable
    private fieldValues: PassFieldValue[],
    public voided: boolean,
    public lastUpdated: string,  // ISO 8601 UpdateTag
    public readonly createdAt: Date,
  ) {}

  static issue(props: {
    id: string; serialNumber: string; passTypeId: string;
    memberId: string; tenantId: string; authToken: AuthenticationToken;
    fieldValues: PassFieldValue[];
  }): Pass {
    const now = new Date().toISOString();
    const p = new Pass(props.id, props.serialNumber, props.passTypeId,
      props.memberId, props.tenantId, props.authToken, props.fieldValues,
      false, now, new Date());
    p.events.push({ type: 'PassIssued', payload: { passId: props.id, memberId: props.memberId } });
    return p;
  }

  updateFields(newValues: PassFieldValue[]): void {
    if (this.voided) throw new Error('Cannot update a voided pass');
    this.fieldValues = newValues;
    this.lastUpdated = new Date().toISOString();
    this.events.push({ type: 'PassFieldsUpdated', payload: { passId: this.id, lastUpdated: this.lastUpdated } });
  }

  void(): void {
    if (this.voided) return; // idempotent
    this.voided = true;
    this.lastUpdated = new Date().toISOString();
    this.events.push({ type: 'PassVoided', payload: { passId: this.id } });
  }

  getAuthToken(): string { return this.authToken.toString(); }  // exposed for header validation only
  getFieldValues(): PassFieldValue[] { return [...this.fieldValues]; }
  pullEvents(): DomainEvent[] { const e = [...this.events]; this.events = []; return e; }
}
```

### `Member` — loyalty aggregate (pure domain)

```typescript
// domain/loyalty/Member.ts

export class PointsBalance {
  private constructor(private readonly value: number) {}
  static of(n: number): PointsBalance {
    if (n < 0) throw new Error('PointsBalance cannot be negative');
    return new PointsBalance(Math.floor(n));
  }
  add(delta: number): PointsBalance { return PointsBalance.of(this.value + delta); }
  get amount(): number { return this.value; }
}

export interface TierRule { name: string; minPoints: number }

export class Member {
  private events: DomainEvent[] = [];

  private constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public displayName: string,
    public readonly email: string | null,       // PII; null for anonymous
    private balance: PointsBalance,
    public currentTier: string,
    public readonly linkedPassSerialNumbers: string[],  // IDs only
    public readonly enrolledAt: Date,
    public status: 'active' | 'suspended' | 'deleted',
  ) {}

  static enrol(props: { id: string; tenantId: string; displayName: string; email: string | null }): Member {
    const m = new Member(props.id, props.tenantId, props.displayName, props.email,
      PointsBalance.of(0), 'bronze', [], new Date(), 'active');
    m.events.push({ type: 'MemberEnrolled', payload: { memberId: props.id, tenantId: props.tenantId } });
    return m;
  }

  awardPoints(delta: number, tierRules: TierRule[]): void {
    if (this.status !== 'active') throw new Error('Cannot award points to non-active member');
    const prevTier = this.currentTier;
    this.balance = this.balance.add(delta);
    this.events.push({ type: 'PointsEarned', payload: { memberId: this.id, delta, newBalance: this.balance.amount } });
    const newTier = this.computeTier(tierRules);
    if (newTier !== prevTier) {
      this.currentTier = newTier;
      this.events.push({ type: 'TierUpgraded', payload: { memberId: this.id, from: prevTier, to: newTier } });
    }
    this.events.push({ type: 'BalanceUpdated', payload: { memberId: this.id, newBalance: this.balance.amount } });
  }

  private computeTier(rules: TierRule[]): string {
    return [...rules].sort((a, b) => b.minPoints - a.minPoints)
      .find(r => this.balance.amount >= r.minPoints)?.name ?? 'bronze';
  }

  get pointsBalance(): number { return this.balance.amount; }
  pullEvents(): DomainEvent[] { const e = [...this.events]; this.events = []; return e; }
}
```

---

## 11. Domain Ports (interfaces in `domain/`, implemented in `infrastructure/`)

```typescript
// domain/passes/ports.ts
export interface IPassRepository {
  findBySerial(serialNumber: string, tenantId: string): Promise<Pass | null>;
  findByMember(memberId: string, tenantId: string): Promise<Pass[]>;
  save(pass: Pass): Promise<void>;
}

export interface IPassSigningPort {
  sign(passJson: Record<string, unknown>, imageAssets: Record<string, Buffer>): Promise<Buffer>;
}

export interface IPushNotificationPort {
  notify(pushTokens: string[], passTypeIdentifier: string): Promise<void>;
}

export interface ICertificateStore {
  getSigningMaterial(): Promise<{ wwdr: Buffer; signerCert: Buffer; signerKey: Buffer; passphrase?: string }>;
}
```

---

## Summary Table

| Aggregate | Context | Key VOs | Key Invariants | Events |
|---|---|---|---|---|
| `Tenant` | Identity & Access | `TenantId`, `TenantStatus` | ≥1 owner user | `TenantCreated`, `TenantSuspended` |
| `User` | Identity & Access | `Email`, `Role`, `HashedPassword` | Email unique per tenant | `UserInvited`, `UserRoleChanged` |
| `CardTemplate` | Card Design | `RgbColor`, `FieldDefinition`, `BarcodeConfig` | secondary+auxiliary ≤ 4; rgb() colors | `CardTemplatePublished` |
| `Pass` | Pass Issuance | `SerialNumber`, `AuthenticationToken`, `UpdateTag` | authToken immutable; lastUpdated monotonic | `PassIssued`, `PassFieldsUpdated`, `PassVoided` |
| `Member` | Membership | `PointsBalance`, `Tier`, `MemberId` | balance ≥ 0; tier derived | `PointsEarned`, `TierUpgraded`, `MemberEnrolled` |
| `Scan` | Scanning | `IdempotencyKey`, `QrToken`, `ScanResult` | nonce single-use; cross-tenant rejected | `ScanRecorded`, `PointsAwarded`, `RewardRedeemed` |
| `Device` | Delivery | `DeviceLibraryIdentifier`, `PushToken` | (device, pass) unique; token overwritten on re-register | `DeviceRegistered`, `DeviceUnregistered` |
