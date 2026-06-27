# 11 — Testing Strategy & Edge Cases

> Implementation-ready guide. All file paths are repo-relative under `src/`. Test runner: **Vitest** (unit + integration), **Playwright** (e2e). Testcontainers for real Postgres/Redis in integration tests. No mocking at the integration layer.

---

## 1. Test Pyramid

```
           ┌─────────────────────────┐
           │        e2e (Playwright) │  ~20 tests  — full browser flows
           ├─────────────────────────┤
           │   API contract (Vitest) │  ~40 tests  — HTTP-level, real FastifyApp
           ├─────────────────────────┤
           │  Infrastructure (Vitest)│  ~80 tests  — Testcontainers Postgres+Redis
           ├─────────────────────────┤
           │   Application (Vitest)  │  ~150 tests — mocked ports, London TDD
           ├─────────────────────────┤
           │     Domain (Vitest)     │  ~300 tests — pure, zero I/O, <5 ms each
           └─────────────────────────┘
```

Coverage targets: **domain ≥ 95 %**, **application ≥ 90 %**, **infrastructure ≥ 80 %**, **API contract ≥ 85 %**, **e2e critical paths 100 %**.

---

## 2. Layer 1 — Domain Unit Tests

**Location:** `tests/domain/`  
**Rule:** No `import` of anything outside `src/domain/`. No `vi.mock()` needed — everything is pure.

### Subjects & assertions

| File | Tests |
|---|---|
| `tests/domain/loyalty/Member.test.ts` | `awardPoints` raises `PointsEarned`; balance never goes negative (throws `DomainError`); `TierUpgraded` emitted when threshold crossed; tier derivation is deterministic |
| `tests/domain/passes/Pass.test.ts` | `authenticationToken` is immutable after construction (frozen VO); `lastUpdated` strictly monotonic; `void()` sets `voided=true` and emits `PassVoided`; `PassFieldsUpdated` carries correct diff |
| `tests/domain/passes/PassDocumentBuilder.test.ts` | Output object matches `pass.json` shape; `rgb()` color format preserved (no hex); strip dimensions absent in output (infra concern); `changeMessage` injected on points field; missing template field throws |
| `tests/domain/scanning/RedemptionPolicy.test.ts` | First scan returns `allow`; second scan with same nonce returns `alreadyRedeemed`; expired token returns `expired`; forged HMAC returns `invalid` |
| `tests/domain/identity/Tenant.test.ts` | RBAC: owner > manager > staff; role elevation only by owner; unknown role rejects |

### Example skeleton

```ts
// tests/domain/loyalty/Member.test.ts
import { Member } from '../../src/domain/loyalty/Member';
import { MemberId } from '../../src/domain/loyalty/MemberId';

it('balance never goes negative', () => {
  const m = Member.create(MemberId.generate(), 0);
  expect(() => m.deductPoints(1)).toThrow('InsufficientBalance');
});

it('emits PointsEarned on award', () => {
  const m = Member.create(MemberId.generate(), 0);
  m.awardPoints(50, 'SCAN_001');
  const [evt] = m.pullDomainEvents();
  expect(evt.type).toBe('PointsEarned');
  expect(evt.payload.delta).toBe(50);
});
```

---

## 3. Layer 2 — Application Handler Tests (London TDD)

**Location:** `tests/application/`  
**Pattern:** inject all ports as `vi.fn()` mocks; assert on calls and returned DTOs; never hit the DB.

### Handler test matrix

| Handler | Mocked ports | Key assertions |
|---|---|---|
| `IssuePassCommandHandler` | `IPassRepository`, `IMemberRepository`, `IPassTemplateRepository`, `IPassSigningPort` | `sign()` called once with valid `pass.json`; serialNumber is UUID; `authenticationToken` ≥32 chars; repo `save()` called; signed buffer returned |
| `UpdatePassFieldsCommandHandler` | all above + `IPushNotificationPort` | `pass.lastUpdated` monotonic; `notify()` called with correct pushTokens; `PassFieldsUpdated` event recorded; idempotent on duplicate command id |
| `RegisterDeviceCommandHandler` | `IDeviceRepository`, `IRegistrationRepository`, `IPassRepository` | 201 on new device; 200 on re-register (pushToken updated); 401 on wrong authToken |
| `ScanQrCommandHandler` | `IScanRepository`, `IRedemptionNonceStore`, `IMemberRepository` | first scan awards points + emits `PointsEarned`; second scan same nonce → `409 AlreadyRedeemed`; expired nonce → `410 Expired` |
| `GetUpdatedSerialsQueryHandler` | `IRegistrationRepository`, `IPassRepository` | returns DTO `{ serialNumbers[], lastUpdated }`; 204 when nothing updated |
| `GetLatestPassQueryHandler` | `IPassRepository`, `IPassSigningPort` | 304 when `If-Modified-Since >= lastUpdated`; 401 on bad token; signs fresh buffer otherwise |

### Mock setup pattern

```ts
// tests/application/IssuePassCommandHandler.test.ts
import { IssuePassCommandHandler } from '../../src/application/passes/IssuePassCommandHandler';

const mockSign = vi.fn().mockResolvedValue(Buffer.from('pkpass'));
const mockSave = vi.fn();
const handler = new IssuePassCommandHandler(
  { findById: vi.fn().mockResolvedValue(memberFixture) },      // IMemberRepository
  { findById: vi.fn().mockResolvedValue(templateFixture) },    // IPassTemplateRepository
  { save: mockSave },                                          // IPassRepository
  { sign: mockSign },                                          // IPassSigningPort
);

it('calls sign with valid pass.json', async () => {
  await handler.execute({ memberId: 'mid-1', passTypeId: 'pt-1' });
  expect(mockSign).toHaveBeenCalledOnce();
  const [passJson] = mockSign.mock.calls[0];
  expect(passJson.barcode.format).toBe('PKBarcodeFormatQR');
});
```

---

## 4. Layer 3 — Infrastructure Integration Tests

**Location:** `tests/infrastructure/`  
**Setup:** `@testcontainers/postgresql`, `@testcontainers/redis` — started once per test file via `beforeAll`, migrated with real DDL, torn down in `afterAll`.

### Test subjects

| File | Container | Key assertions |
|---|---|---|
| `SqlPassRepository.integration.test.ts` | Postgres | Save + findBySerial round-trips; `updated_at` strictly increases on consecutive saves; tenant isolation (cross-tenant query returns null); unique constraint on `serial_number` |
| `SqlMemberRepository.integration.test.ts` | Postgres | Optimistic-lock conflict raises `ConcurrencyError`; RLS blocks cross-tenant read |
| `SqlScanRepository.integration.test.ts` | Postgres | Append-only; duplicate nonce insert blocked by unique index |
| `RedisNonceStore.integration.test.ts` | Redis | SET NX returns `acquired`; second call same key returns `duplicate`; TTL expiry turns key missing → `expired`; replay attack blocked within window |
| `PassKitSigningAdapter.integration.test.ts` | none (certs in test fixture) | `getAsBuffer()` returns non-empty Buffer; MIME = `application/vnd.apple.pkpass`; signed zip contains `pass.json` + `manifest.json` + `signature` |
| `ApnsAdapter.integration.test.ts` | HTTP mock server (MSW) | Sends `apns-push-type: background`, `apns-priority: 5`, topic = passTypeId; invalid-token 410 response triggers device removal callback |
| `S3PassStore.integration.test.ts` | LocalStack S3 | Cache miss triggers signing; cache hit returns stored buffer unchanged; invalidate removes key |

### Tenant RLS test

```ts
it('RLS blocks cross-tenant read', async () => {
  await db.query(`SET app.current_tenant = '${tenantA}'`);
  await passRepo.save(passForTenantB);        // tenant B row
  const found = await passRepo.findBySerial(passForTenantB.serialNumber);
  expect(found).toBeNull();                   // invisible under tenant A context
});
```

---

## 5. Layer 4 — API Contract Tests

**Location:** `tests/api/`  
**Setup:** real `FastifyApp` instance, in-memory fakes substituted for all infrastructure ports (not mocks — stateful fakes that implement the interface). No external network.

### Endpoint coverage

| Method | Path | Cases |
|---|---|---|
| `POST` | `/v1/passes/:passTypeId/:serial/issue` | 201 with `.pkpass` buffer + correct MIME; 400 on missing fields; 404 unknown passType; 409 already issued |
| `POST` | `/v1/devices/:deviceId/registrations/:passTypeId/:serial` | 201 new; 200 re-register; 401 bad auth token; 400 malformed body |
| `GET` | `/v1/devices/:deviceId/registrations/:passTypeId` | 200 with `{ serialNumbers, lastUpdated }`; 204 nothing new; 400 invalid date |
| `GET` | `/v1/passes/:passTypeId/:serial` | 200 pkpass buffer; 304 not-modified; 401 wrong token; 404 unknown serial |
| `DELETE` | `/v1/devices/:deviceId/registrations/:passTypeId/:serial` | 200 OK; 401 bad token; 200 idempotent (already deleted) |
| `POST` | `/v1/log` | 200 always (Apple log endpoint) |
| `POST` | `/v1/scan` | 200 + points; 409 duplicate; 410 expired; 401 forged; 422 tenant mismatch |
| `GET` | `/api/analytics/summary` | 200 with DTO; 401 unauthenticated; 403 staff role (not authorized) |

### zod boundary test

```ts
it('rejects unknown fields on scan payload', async () => {
  const res = await app.inject({
    method: 'POST', url: '/v1/scan',
    payload: { token: 'x', __proto__: { admin: true } },  // prototype pollution attempt
  });
  expect(res.statusCode).toBe(400);
  expect(res.json().code).toBe('VALIDATION_ERROR');
});
```

---

## 6. Layer 5 — End-to-End Tests (Playwright)

**Location:** `tests/e2e/`  
**Environment:** `NODE_ENV=test` Docker Compose stack (Postgres + Redis + LocalStack + Fastify + Vite preview). No real APNs or Apple certs — APNs replaced by a stub HTTP server that records calls.

### Critical path flows (all must be green before any release)

| Flow | Steps | Pass criteria |
|---|---|---|
| **Build → Publish** | Sign up as tenant; open Builder; drag points field; set colors; click Publish | Card template saved; `pass_types` row inserted; no 5xx |
| **Issue pass** | Dashboard → Members → Issue Pass for test member | `.pkpass` buffer served with correct MIME; `passes` row persists; QR code rendered on screen |
| **Scan → Award points** | Staff view → Scan QR (injected token via URL param) | Points updated in DB; `scans` row appended; dashboard balance reflects new total within 2 s |
| **Duplicate scan** | Same QR token scanned twice in rapid succession | Second response is 409; `scans` table has exactly one row for that nonce |
| **Dashboard analytics** | Owner views Analytics tab after 5 scans | Chart renders with 5 events; no console errors; date filter narrows results |
| **Republish template** | Owner edits card color, republishes while a pass is live | `pass_types` updated; existing `passes` not voided; `updated_at` bumped on affected passes; APNs stub receives push notification |
| **Tenant isolation** | Two tenants each issue a pass; tenant A calls GET on tenant B serial | 404 returned; no row leakage in response |

### APNs stub assertion

```ts
// playwright test helper
const apnsStub = new ApnsStubServer();
await apnsStub.start(2197);
// ... trigger points update ...
const calls = await apnsStub.waitForCalls(1, { timeout: 5000 });
expect(calls[0].headers['apns-push-type']).toBe('background');
expect(calls[0].headers['apns-priority']).toBe('5');
```

---

## 7. Wallet Pass Smoke Test

**Location:** `tests/smoke/wallet-pass.smoke.test.ts`  
**When:** CI on every push to `main`; also runnable locally with `npm run test:smoke`.  
**Requires:** real WWDR G4 cert + test Pass Type ID cert (in CI secret store, never the repo).

```
1. Call IssuePassCommandHandler with fixture member + template.
2. Assert buffer is non-empty Buffer.
3. Unzip the buffer in-memory (use `jszip`).
4. Assert zip contains: pass.json, manifest.json, signature, icon.png, logo.png, strip.png.
5. Parse pass.json — assert:
   - formatVersion === 1
   - passTypeIdentifier matches env var PASS_TYPE_IDENTIFIER
   - barcode.format === "PKBarcodeFormatQR"
   - barcode.messageEncoding === "iso-8859-1"
   - foregroundColor matches rgb() pattern
   - serialNumber is non-empty string
   - authenticationToken.length >= 32
   - webServiceURL ends with "/"
   - No "stripColor" key present
   - strip image size 375×144 (read PNG header from zip entry)
6. Verify PKCS#7 signature detaches correctly (openssl smime -verify via child_process, or passkit-generator internal verify).
```

---

## 8. Edge & Abuse Case Catalog

| # | Category | Case | Expected Handling |
|---|---|---|---|
| 1 | Duplicate scan | Same QR nonce submitted twice within 60 s | Second call → `409 AlreadyRedeemed`; Redis SETNX prevents double-award; audit log records attempt |
| 2 | Duplicate scan | Same nonce, two concurrent requests (race) | Redis SETNX is atomic; exactly one request returns 200; other returns 409; points awarded once |
| 3 | QR forgery | HMAC signature tampered | Signature verification fails → `401 InvalidToken`; logged with client IP |
| 4 | QR replay | Valid token resubmitted after 24 h TTL | Redis key expired → treated as `410 Expired`; not redeemable |
| 5 | QR — wrong tenant | Token with tenantId=A scanned at tenant B terminal | Application layer tenant check → `403 TenantMismatch`; no points awarded |
| 6 | QR — clock skew | Token `iat` > 5 min in future (client clock ahead) | Reject with `401 ClockSkew`; log delta |
| 7 | SQL injection | `'; DROP TABLE passes; --` in any path param or JSON field | Kysely bound params prevent execution; zod rejects non-UUID path params with 400 before it reaches the repo |
| 8 | NoSQL/header injection | `\r\nX-Injected: evil` in a header field; `$where` in JSON | zod schema strips unknown fields; Fastify parses headers safely; 400 on invalid input |
| 9 | Prototype pollution | `__proto__`, `constructor`, `prototype` keys in JSON body | zod `strict()` mode rejects unknown keys at boundary; 400 returned |
| 10 | Concurrent point updates | 10 simultaneous `ScanQrCommand` for different valid nonces on same member | Optimistic lock on `Member` aggregate; each transaction retries on conflict; final balance = sum of all valid awards |
| 11 | Cert expiry mid-flight | Pass Type ID cert expires while signing in progress | `IPassSigningPort.sign()` throws `CertExpiredError`; handler returns 503; cert rotation alarm fires; existing cached passes still served from S3 |
| 12 | APNs invalid-token | APNs returns `410 Unregistered` for a push token | `ApnsAdapter` triggers `DeviceTokenInvalidated` event; `Device.pushToken` marked stale; removed from notification list on next push cycle |
| 13 | Republish while live | Owner saves card template while 1 000 passes are live | Template update is transactional to `pass_types` only; BullMQ fan-out job batches `UpdatePassFieldsCommand` per affected pass; existing passes remain valid until their `updated_at` is bumped |
| 14 | Tenant data crossover | Tenant A's staff calls `GET /v1/passes/:passTypeId/:serial` for tenant B's serial | Postgres RLS + application-layer `tenant_id` check both block; 404 returned (not 403, to avoid enumeration) |
| 15 | Oversized builder image | Upload of a 50 MB PNG as a card logo | S3 presigned upload enforces `ContentLengthRange` max 2 MB; frontend upload rejected before reaching Fastify; zod schema validates `contentType in ['image/png']`; 413 if it reaches the API |
| 16 | Invalid builder image | Non-PNG file renamed to `.png`; truncated PNG | Sharp's `metadata()` call throws; handler catches → 422 `InvalidImageFormat`; no partial write to S3 |
| 17 | Rate-limit breach | >100 scan requests/min from same IP | Redis sliding-window rate limiter returns 429 with `Retry-After` header; does not award points; IP logged |
| 18 | Rate-limit breach (per-account) | Staff account submits 500 scans in 1 min | Per-account limiter (Fastify plugin, Redis) returns 429; account flagged for review in audit log |
| 19 | Partial failure — signing | `IPassSigningPort.sign()` throws after `passes` row saved | BullMQ job retries with exponential backoff (max 5); idempotency key on `passes.id` prevents duplicate row; S3 cache only written after successful sign |
| 20 | Partial failure — APNs | APNs unreachable; push job fails | BullMQ retries 3×; job moves to dead-letter queue after exhaustion; `Pass.lastUpdated` still bumped so device will pull on next poll; no data loss |
| 21 | Idempotent issue | `IssuePassCommand` replayed with same `memberId` | Command handler checks `passes` for existing row via `member_id`; returns existing `.pkpass` buffer from S3; no new serial minted |
| 22 | Pass already voided | Client requests `GET /v1/passes/:passTypeId/:serial` for voided pass | Repository loads `Pass`; handler checks `pass.voided === true`; returns `410 Gone`; Wallet removes card |
| 23 | Device re-register | Same device registers with a new push token (app reinstall) | `ON CONFLICT (device_library_identifier) DO UPDATE SET push_token` — upsert is idempotent; 200 returned |
| 24 | Analytics event injection | POST to `/v1/log` with a 1 MB payload | Fastify `bodyLimit` set to 64 KB; 413 returned before parsing; log endpoint silently accepts Apple diagnostics up to limit |

---

## 9. Acceptance Criteria

| ID | Criterion | Verification method |
|---|---|---|
| AC-1 | Domain layer has zero imports from `infrastructure/` or `application/` | ESLint `no-restricted-imports` rule in `.eslintrc`; CI fails on violation |
| AC-2 | All parameterized queries only — no string concatenation in SQL | ESLint custom rule banning template literals in `*.repository.ts`; infrastructure integration tests run `EXPLAIN` on all queries |
| AC-3 | QR nonce is single-use: double-tap on a real device awards points exactly once | e2e test #4 (concurrent scan) + Redis SETNX atomic guarantee |
| AC-4 | `authenticationToken` never mutates after `Pass` creation | Domain unit test on `Pass.test.ts`; infrastructure round-trip test confirms DB value unchanged after `UpdatePassFields` |
| AC-5 | Tenant isolation holds at DB layer | RLS integration test; e2e tenant crossover test #7 |
| AC-6 | Signed `.pkpass` opens in Apple Wallet without error | Wallet pass smoke test (CI, real certs) |
| AC-7 | APNs push uses `apns-priority: 5` and empty JSON body `{}` | `ApnsAdapter` integration test; e2e APNs stub assertion |
| AC-8 | All inputs validated with zod at system boundary; unknown fields rejected | API contract test; abuse case tests #7–9 |
| AC-9 | Rate limiting returns 429 before business logic executes | API contract test on `/v1/scan`; abuse case tests #17–18 |
| AC-10 | No secrets/certs in source code or DB | `truffleHog` scan in pre-commit hook + CI step; `ICertificateStore` test uses fixture certs from env |
| AC-11 | Build succeeds with zero TypeScript errors | `npm run typecheck` in CI (strict mode) |
| AC-12 | All tests pass in CI including smoke test | `npm run test` gate before any merge to `main` |

---

## 10. CI Pipeline Integration

```yaml
# .github/workflows/test.yml (abbreviated)
jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - run: npm run test:unit          # domain + application layers, no containers

  integration:
    runs-on: ubuntu-latest
    services:
      postgres: { image: postgres:16 }
      redis:    { image: redis:7 }
    steps:
      - run: npm run test:integration   # infrastructure layer, Testcontainers or service containers

  contract:
    runs-on: ubuntu-latest
    steps:
      - run: npm run test:api           # API contract, in-process Fastify

  e2e:
    runs-on: ubuntu-latest
    steps:
      - run: docker compose -f docker-compose.test.yml up -d
      - run: npm run test:e2e           # Playwright against full stack

  smoke:
    runs-on: ubuntu-latest
    environment: ci-secrets             # PASS_TYPE_ID_CERT, SIGNER_KEY, WWDR_G4 injected
    steps:
      - run: npm run test:smoke         # real signing, no network to Apple
```

**Coverage enforcement:** Vitest `--coverage` with `c8`; CI fails if any layer drops below its target (see Section 1). Coverage report uploaded as artifact on every run.
