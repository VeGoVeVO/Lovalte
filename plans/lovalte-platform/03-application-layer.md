# 03 — Application Layer (CQRS Commands / Queries / Handlers)

> v3 DDD rule: one handler per use-case; handlers **orchestrate** but hold **no domain logic**;
> queries return **DTOs** (never domain objects); **inject interfaces** (ports), never concrete
> infra; one aggregate = one transaction.

---

## Handler Summary Table

| Use-case | Type | Handler responsibilities | Ports used | Emitted events | Tx boundary |
|---|---|---|---|---|---|
| `SignUpTenantCommand` | Command | Validate uniqueness; create `Tenant` + `User(owner)` aggregates; hash+store password; issue session token | `ITenantRepository`, `IUserRepository`, `IPasswordHasher`, `IEventBus` | `TenantSignedUp`, `UserCreated` | One tx: tenant + owner user |
| `InviteUserCommand` | Command | Verify caller is owner/manager (RBAC); create `UserInvitation` with signed token (HMAC, 48h TTL); enqueue invitation email | `IUserRepository`, `IInvitationRepository`, `IEmailQueue` | `UserInvited` | Single aggregate |
| `AcceptInvitationCommand` | Command | Validate token (HMAC + expiry); create `User` with `role`; mark invitation consumed | `IInvitationRepository`, `IUserRepository` | `UserCreated` | Single tx |
| `CreateCardTemplateCommand` | Command | Validate builder JSON (zod); persist `CardTemplate` draft; store image refs | `ICardTemplateRepository`, `IObjectStorage` | `CardTemplateDraftSaved` | Single aggregate |
| `PublishCardTemplateCommand` | Command | Load template; run field-constraint check (domain service `TemplateValidator`); mark `published`; emit event consumed by Pass Issuance | `ICardTemplateRepository`, `IEventBus` | `CardTemplatePublished` | Single aggregate |
| `IssuePassCommand` | Command | Mint `SerialNumber` + `AuthenticationToken`; build pass.json via `PassDocumentBuilder`; sign via `IPassSigningPort`; upload buffer to S3; persist `Pass`; return buffer + MIME | `IPassRepository`, `IPassTemplateRepository`, `IMemberRepository`, `IPassSigningPort`, `IObjectStorage`, `ICertificateStore` | `PassIssued` | Single tx: Pass only (Member by ID) |
| `GenerateQrTokenCommand` | Command | Resolve `passId` + `tenantId`; mint nonce (stored in Redis); sign compact token `{ passId, tenantId, nonce, iat }` (HMAC-SHA256 or JWT); return token string | `IPassRepository`, `IQrNonceStore`, `ITokenSigner` | — | Redis nonce write (non-DB tx) |
| `RedeemScanCommand` | Command | Verify token signature + expiry; claim nonce in Redis (idempotency — return cached result on duplicate); load `Member`; apply `RewardRule`; award/redeem points; bump `Pass.updatedAt`; emit `PointsEarned`; queue APNs push | `IQrNonceStore`, `IMemberRepository`, `IPassRepository`, `IRewardRuleRepository`, `IBullMqQueue`, `IEventBus` | `ScanRecorded`, `PointsEarned`, `PassFieldsUpdated` | Db tx: Member + Pass (one aggregate = one tx each, in sequence; nonce claimed atomically in Redis first) |
| `UpdatePassFieldsCommand` | Command | Load `Pass`; apply new field values (via `Pass.applyFieldValues`); bump `updated_at`; invalidate cached pkpass in S3/Redis; query registrations; enqueue APNs push per device | `IPassRepository`, `IRegistrationRepository`, `IObjectStorage`, `IBullMqQueue` | `PassFieldsUpdated` | Single tx: Pass |
| `RegisterDeviceCommand` | Command | Validate `Authorization: ApplePass <token>` against `Pass.authenticationToken`; upsert `Device` (overwrite pushToken); upsert `Registration`; return 201/200/401 | `IPassRepository`, `IDeviceRepository`, `IRegistrationRepository` | `DeviceRegistered` | Single tx: Device + Registration |
| `UnregisterDeviceCommand` | Command | Validate auth token; delete `Registration`; return 200/401 | `IPassRepository`, `IRegistrationRepository` | `DeviceUnregistered` | Single tx |
| `GetUpdatedSerialsQuery` | Query | (no auth required per spec); query registrations for device+passType updated after `passesUpdatedSince` tag; return `{ serialNumbers, lastUpdated }` DTO or 204 | `IRegistrationRepository` | — | Read-only |
| `GetLatestPassQuery` | Query | Validate auth token; compare `Pass.updatedAt` vs `If-Modified-Since`; if unchanged → 304; else sign (or serve S3 cache) + return Buffer, `Content-Type: application/vnd.apple.pkpass`, `Last-Modified` | `IPassRepository`, `IPassSigningPort`, `IObjectStorage`, `ICertificateStore` | — | Read-only |
| `GetAnalyticsSummaryQuery` | Query | Read analytics read-model (denormalized); return DTO with totals, chart series (Recharts-ready), period filter | `IAnalyticsReadModel` | — | Read-only |
| `GetMemberActivityQuery` | Query | Fetch scan/points history for a member within date range; return paginated DTO | `IScanRepository`, `IMemberRepository` | — | Read-only |
| `LogDeviceDiagnosticsCommand` | Command | Receive `{ logs: string[] }` from Apple Wallet; write to structured logger; return 200 (no auth) | `ILogger` | — | None |

---

## Handler Details

### Identity & Access Context

#### `SignUpTenantHandler`

```typescript
// src/application/identity/handlers/SignUpTenantHandler.ts
export class SignUpTenantHandler implements ICommandHandler<SignUpTenantCommand> {
  constructor(
    private tenants: ITenantRepository,
    private users: IUserRepository,
    private hasher: IPasswordHasher,
    private events: IEventBus,
  ) {}

  async execute(cmd: SignUpTenantCommand): Promise<SignUpTenantResult> {
    await this.tenants.assertSlugUnique(cmd.slug);          // throws DomainError if taken
    const tenant = Tenant.create({ name: cmd.name, slug: cmd.slug, plan: 'trial' });
    const owner  = User.create({ tenantId: tenant.id, email: cmd.email,
                                  passwordHash: await this.hasher.hash(cmd.password),
                                  role: Role.OWNER });
    await this.tenants.save(tenant);
    await this.users.save(owner);
    await this.events.publish([...tenant.pullEvents(), ...owner.pullEvents()]);
    return { tenantId: tenant.id.value, userId: owner.id.value };
  }
}
```

Transaction boundary: `tenants.save` + `users.save` are wrapped in a single DB transaction
provided by the infrastructure unit-of-work. No cross-context aggregate touched.

---

### Card Design / Builder Context

#### `PublishCardTemplateHandler`

```typescript
// src/application/builder/handlers/PublishCardTemplateHandler.ts
export class PublishCardTemplateHandler {
  constructor(
    private templates: ICardTemplateRepository,
    private events: IEventBus,
  ) {}

  async execute(cmd: PublishCardTemplateCommand): Promise<void> {
    const template = await this.templates.getById(cmd.templateId, cmd.tenantId);
    template.publish();                   // domain invariant: all required fields present
    await this.templates.save(template);
    await this.events.publish(template.pullEvents()); // CardTemplatePublished
  }
}
```

`CardTemplatePublished` is consumed by the Pass Issuance context via an event subscriber
(anti-corruption layer maps builder DTO → `PassTemplate` value objects).

---

### Pass Issuance Context

#### `IssuePassHandler`

```typescript
// src/application/passes/handlers/IssuePassHandler.ts
export class IssuePassHandler {
  constructor(
    private passes: IPassRepository,
    private templates: IPassTemplateRepository,
    private members: IMemberRepository,
    private signer: IPassSigningPort,
    private storage: IObjectStorage,
    private certs: ICertificateStore,
    private events: IEventBus,
  ) {}

  async execute(cmd: IssuePassCommand): Promise<IssuePassResult> {
    const [template, member] = await Promise.all([
      this.templates.getById(cmd.passTypeId),
      this.members.getById(cmd.memberId),
    ]);
    // Domain: mint identity + build pass.json (pure, no I/O)
    const pass = Pass.issue({ template, member });        // mints SerialNumber + AuthToken inside
    const passDoc = PassDocumentBuilder.build(pass, template); // pure domain service
    // Infrastructure: sign
    const certs   = await this.certs.getSigningMaterial();
    const buffer  = await this.signer.sign(passDoc, template.imageAssetRefs, certs);
    // Persist + cache
    await this.passes.save(pass);
    await this.storage.put(`passes/${pass.serialNumber.value}/v1.pkpass`, buffer);
    await this.events.publish(pass.pullEvents());         // PassIssued
    return { buffer, mimeType: 'application/vnd.apple.pkpass',
             serialNumber: pass.serialNumber.value };
  }
}
```

`Pass.issue()` calls `crypto.randomBytes(32).toString('hex')` for `authenticationToken`
and `crypto.randomUUID()` for `serialNumber`. The token is **immutable** — the aggregate
enforces this via a private setter pattern.

---

#### `GenerateQrTokenHandler`

```typescript
// src/application/passes/handlers/GenerateQrTokenHandler.ts
// QR payload: { passId, tenantId, nonce, iat }  signed HMAC-SHA256
export class GenerateQrTokenHandler {
  constructor(
    private passes: IPassRepository,
    private nonceStore: IQrNonceStore,   // Redis
    private signer: ITokenSigner,
  ) {}

  async execute(cmd: GenerateQrTokenCommand): Promise<{ token: string }> {
    const pass   = await this.passes.getByMember(cmd.memberId, cmd.tenantId);
    const nonce  = await this.nonceStore.mint(pass.id.value, { ttlSeconds: 300 });
    const token  = this.signer.sign({ passId: pass.id.value,
                                       tenantId: cmd.tenantId,
                                       nonce, iat: Math.floor(Date.now() / 1000) });
    return { token };
  }
}
```

---

#### `RedeemScanHandler` (idempotent)

```typescript
// src/application/scanning/handlers/RedeemScanHandler.ts
export class RedeemScanHandler {
  constructor(
    private verifier: ITokenVerifier,
    private nonceStore: IQrNonceStore,
    private members: IMemberRepository,
    private passes: IPassRepository,
    private rules: IRewardRuleRepository,
    private queue: IBullMqQueue,
    private events: IEventBus,
  ) {}

  async execute(cmd: RedeemScanCommand): Promise<RedemptionResult> {
    // 1. Verify signature + expiry (throws on forged/expired)
    const payload = this.verifier.verify(cmd.token);
    // 2. Claim nonce atomically in Redis — returns cached result if already redeemed
    const idempotencyResult = await this.nonceStore.claim(payload.nonce, payload.passId);
    if (idempotencyResult.alreadyClaimed) return idempotencyResult.cachedResult;
    // 3. Domain: award points
    const [member, rules] = await Promise.all([
      this.members.getById(payload.memberId, payload.tenantId),
      this.rules.getActive(payload.tenantId),
    ]);
    const rule = RewardRuleSelector.selectFor(cmd.scanType, rules); // pure domain service
    member.awardPoints(rule.points);                                // raises PointsEarned
    // 4. Persist Member (one tx)
    await this.members.save(member);
    // 5. Update Pass.updatedAt for APNs (separate tx — different aggregate)
    const pass = await this.passes.getByMember(member.id.value, payload.tenantId);
    pass.applyFieldValues({ points: member.pointsBalance.value,
                            tier:   member.tier.label });
    await this.passes.save(pass);
    // 6. Enqueue APNs push (BullMQ — durable, not in main tx)
    await this.queue.add('apns-push', { passId: pass.id.value });
    await this.events.publish([...member.pullEvents(), ...pass.pullEvents()]);
    const result: RedemptionResult = { pointsAwarded: rule.points,
                                        newBalance: member.pointsBalance.value };
    await this.nonceStore.storeResult(payload.nonce, result);
    return result;
  }
}
```

The nonce claim is a Redis `SET NX` with TTL — if the key exists, the scan was already
processed and the cached `RedemptionResult` is returned immediately without any DB write.
This makes double-tap / network retry safe.

---

### Delivery Context (PassKit Web Service)

#### `RegisterDeviceHandler`

```typescript
// src/application/delivery/handlers/RegisterDeviceHandler.ts
// Endpoint: POST /v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeId}/{serial}
// Auth required: Authorization: ApplePass <authenticationToken>
export class RegisterDeviceHandler {
  async execute(cmd: RegisterDeviceCommand): Promise<{ status: 200 | 201 | 401 }> {
    const pass = await this.passes.getBySerial(cmd.serialNumber, cmd.passTypeId);
    if (!pass.authenticationToken.equals(cmd.authToken)) return { status: 401 };
    const existing = await this.registrations.find(cmd.deviceLibId, pass.id.value);
    const device = await this.devices.upsert(cmd.deviceLibId, cmd.pushToken); // overwrites token
    if (existing) return { status: 200 };
    const reg = Registration.create({ deviceId: device.id, passId: pass.id });
    await this.registrations.save(reg);
    await this.events.publish(reg.pullEvents());
    return { status: 201 };
  }
}
```

#### `GetUpdatedSerialsHandler`

```typescript
// Query — no auth required per Apple spec
// Returns: 200 { serialNumbers, lastUpdated } | 204
export class GetUpdatedSerialsHandler {
  async execute(q: GetUpdatedSerialsQuery): Promise<UpdatedSerialsDTO | null> {
    const rows = await this.registrations.findUpdatedSince(
      q.deviceLibraryIdentifier, q.passTypeIdentifier, q.passesUpdatedSince,
    );
    if (rows.length === 0) return null;   // → 204
    return { serialNumbers: rows.map(r => r.serialNumber),
             lastUpdated: rows.reduce((m, r) => r.updatedAt > m ? r.updatedAt : m,
                                       rows[0].updatedAt) };
  }
}
```

#### `GetLatestPassHandler`

```typescript
// Endpoint: GET /v1/passes/{passTypeId}/{serial}
// If-Modified-Since → 304 if unchanged; else sign (or serve S3 cached buffer) + 200
export class GetLatestPassHandler {
  async execute(q: GetLatestPassQuery): Promise<GetLatestPassResult> {
    const pass = await this.passes.getBySerial(q.serialNumber, q.passTypeId);
    if (!pass.authenticationToken.equals(q.authToken)) return { status: 401 };
    if (q.ifModifiedSince && pass.updatedAt <= q.ifModifiedSince) return { status: 304 };
    // Serve from S3 cache if available; else re-sign
    let buffer = await this.storage.get(`passes/${q.serialNumber}/v1.pkpass`);
    if (!buffer) {
      const template = await this.templates.getById(pass.passTypeId);
      const passDoc  = PassDocumentBuilder.build(pass, template);
      const certs    = await this.certs.getSigningMaterial();
      buffer         = await this.signer.sign(passDoc, template.imageAssetRefs, certs);
      await this.storage.put(`passes/${q.serialNumber}/v1.pkpass`, buffer);
    }
    return { status: 200, buffer,
             mimeType: 'application/vnd.apple.pkpass',
             lastModified: pass.updatedAt.toUTCString() };
  }
}
```

---

### Analytics Context

#### `GetAnalyticsSummaryHandler`

Queries a **read model** (materialized by the `Analytics` bounded context from ingested events
via BullMQ worker). Returns a `AnalyticsSummaryDTO` shaped for Recharts:

```typescript
export interface AnalyticsSummaryDTO {
  period: { from: string; to: string };
  totalScans: number;
  totalPointsIssued: number;
  totalPointsRedeemed: number;
  activeMembersCount: number;
  scansByDay: Array<{ date: string; count: number }>;
  pointsByDay: Array<{ date: string; issued: number; redeemed: number }>;
  topRewards: Array<{ rewardId: string; label: string; redemptions: number }>;
}
```

Handler injects `IAnalyticsReadModel` (Postgres view or materialized table in analytics
schema). All data is tenant-scoped by `tenantId` injected from the auth context. No domain
aggregates are loaded; this handler is pure read-model projection.

---

## Injected Ports (interfaces — all in `domain/` or `application/`)

| Port | Implemented by (infra) | Notes |
|---|---|---|
| `IPassRepository` | `SqlPassRepository` | Maps `passes` rows ↔ `Pass` aggregate |
| `IPassTemplateRepository` | `SqlPassTemplateRepository` | Maps `pass_types` rows ↔ `PassTemplate` |
| `IMemberRepository` | `SqlMemberRepository` | Maps `members` rows ↔ `Member` |
| `IDeviceRepository` | `SqlDeviceRepository` | Upsert on re-registration |
| `IRegistrationRepository` | `SqlRegistrationRepository` | Composite unique (device, pass) |
| `ICardTemplateRepository` | `SqlCardTemplateRepository` | Builder context |
| `ITenantRepository` | `SqlTenantRepository` | Identity context |
| `IUserRepository` | `SqlUserRepository` | Identity context |
| `IInvitationRepository` | `SqlInvitationRepository` | Identity context |
| `IPassSigningPort` | `PassKitSigningAdapter` | `passkit-generator` v3.5.7, WWDR G4 |
| `ICertificateStore` | `KmsSecretsCertStore` | Reads PEM from KMS — never the repo |
| `IPushNotificationPort` | `ApnsAdapter` | HTTP/2; topic = passTypeId; priority 5; payload `{}` |
| `IQrNonceStore` | `RedisQrNonceStore` | Redis `SET NX` + TTL; stores redemption result |
| `ITokenSigner` / `ITokenVerifier` | `HmacTokenSigner` | HMAC-SHA256; key from KMS |
| `IObjectStorage` | `S3ObjectStorageAdapter` | Signed .pkpass cache + builder images |
| `IBullMqQueue` | `BullMqQueueAdapter` | APNs push jobs + analytics event ingestion |
| `IAnalyticsReadModel` | `SqlAnalyticsReadModel` | Postgres materialized view, tenant-scoped |
| `IEmailQueue` | `BullMqEmailQueueAdapter` | Invitation emails |
| `IPasswordHasher` | `ArgonPasswordHasher` | Argon2id |
| `IRewardRuleRepository` | `SqlRewardRuleRepository` | Membership context |
| `IEventBus` | `InProcessEventBus` | Synchronous in-process for MVP; swap to durable bus later |
| `ILogger` | `PinoLogger` | Structured logging (PassKit /log endpoint + system) |

---

## Transaction Boundary Rules

1. **One aggregate = one DB transaction.** `Member` save and `Pass` save in `RedeemScanHandler`
   are two sequential transactions, not one. The nonce claim in Redis acts as the idempotency
   gate before either DB write occurs.

2. **Cross-context communication via events only.** `PassFieldsUpdated` (Pass Issuance) is
   consumed by the Delivery context subscriber which executes `RegisterDeviceHandler` /
   `GetUpdatedSerialsHandler` lookup. `PointsEarned` (Membership) is consumed by the Analytics
   ingestion worker.

3. **APNs push is always async (BullMQ).** Never block the HTTP response on APNs delivery.
   The job retries on failure; invalid push tokens trigger a compensating command to delete
   the `Device + Registration` (handled in the `ApnsJobProcessor`).

4. **QR nonce Redis write is outside any DB transaction** — it must complete before the DB
   writes so that a crash between Redis and DB leaves the nonce claimed (idempotent retry
   returns the cached result once DB catches up).

5. **`authenticationToken` is never updated.** `Pass.applyFieldValues()` mutates `fieldValues`
   and `updatedAt` only; `authenticationToken` has no setter on the aggregate.
