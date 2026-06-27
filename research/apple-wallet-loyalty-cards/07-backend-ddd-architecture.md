# 07 — Backend Architecture (React + PostgreSQL + DDD)

> Recommendation only — **no code is built here.** This maps the verified Apple constraints onto the project's **v3 DDD layer rules** (`.claude/skills/v3-ddd-architecture`). When implementation starts, re-invoke that skill and follow its layer/naming rules exactly; this doc is pre-aligned to them.

## Where the v3 layers land

```
src/
  domain/                      # pure, zero I/O
    loyalty/                   # Loyalty/Membership context
    passes/                    # Pass Issuance context
    delivery/                  # Device Registration & Updates context
  application/                 # commands / queries / handlers per context
  infrastructure/             # Postgres repos, passkit-generator signer, APNs adapter, secret store
  presentation/               # React-facing REST + the PassKit web-service REST endpoints
```

Apple's rule of thumb: **signing, the filesystem, APNs, and certificates are all infrastructure** behind ports; the domain only computes *what* the pass should say, never *how* it's signed or sent. **[VERIFIED — Apple: don't sign in the client; signing is an I/O concern]**

## Bounded contexts (3, +1 supporting) **[VERIFIED·SECONDARY]**

| Context | Owns | Ubiquitous language |
|---|---|---|
| **Loyalty / Membership** (upstream) | `Member`, points balance, tier. Emits `PointsEarned`, `TierUpgraded`. | "member", "points", "tier", "reward" |
| **Pass Issuance** | `PassTemplate`, `Pass`, generation + signing lifecycle. Consumes Member data; produces signed `.pkpass`. | "pass", "serial number", "field value" |
| **Device Registration & Updates** (a.k.a. Delivery) | `Device`, `Registration`, the PassKit web service, APNs pushes. | "device", "registration", "push token" |
| **Certificate & Key Mgmt** (supporting) | `.p12`/PEM material, WWDR, rotation. Pure infra. | "signing cert", "WWDR", "rotation" |

**Contexts integrate via domain events, not shared domain objects.** `Loyalty` raising `PointsEarned` → `Pass Issuance` updates the `Pass` and bumps `lastUpdated` → that raises `PassUpdated` → `Delivery` pushes APNs. Use an **Anti-Corruption Layer** if the loyalty model differs from the pass model.

## Aggregates (root in **bold**) **[VERIFIED·SECONDARY]**

> v3 rule: smallest aggregate that holds the invariant; reference other aggregates **by ID only**; never call a repo inside an aggregate; one aggregate = one transaction.

### `Member` (Loyalty context) — root: **Member**
- Identity: `MemberId` (VO). Holds `PointsBalance` (VO), `Tier` (VO), and `linkedPassSerialNumbers` (IDs only).
- Invariant: balance never negative; tier derived from balance rules.
- Events: `PointsEarned`, `BalanceUpdated`, `TierUpgraded`.

### `PassTemplate` (Pass Issuance) — root: **PassTemplate**
- Identity: `PassTypeId` (VO, the `passTypeIdentifier`). Holds `teamIdentifier`, `organizationName`, style (`storeCard`), field layout, image asset refs, colors (`rgb()` VOs), `webServiceURL`. Changes rarely.

### `Pass` (Pass Issuance) — root: **Pass**  ← the heart
- Identity: `SerialNumber` (VO, globally unique even across reinstalls).
- Holds: `AuthenticationToken` (VO — **immutable after issuance**), `lastUpdated` (the opaque update tag), current `PassFieldValue` VOs (points, tier, …), barcode message, and the **`PassTypeId` of its template by ID**.
- Invariants: `authenticationToken` never changes; `lastUpdated` is monotonic.
- Events: `PassIssued`, `PassFieldsUpdated`, `PassVoided`.

### `Device` (Delivery) — root: **Device**
- Identity: `DeviceLibraryIdentifier` (VO, opaque, from Apple).
- Holds: latest `pushToken` (re-registration overwrites it). `Registration` is an entity inside the aggregate (or a standalone entity with a composite key `(device, passType, serial)`), linking a device to a `(PassTypeId, SerialNumber)` **by ID**.

## Value objects **[VERIFIED·SECONDARY]**
`MemberId`, `PassTypeId`, `SerialNumber`, `AuthenticationToken`, `PointsBalance`, `Tier`, `RgbColor`, `BarcodePayload`, `PassFieldValue (key,label,value)`, `DeviceLibraryIdentifier`, `PushToken`. All immutable, equality by value. `AuthenticationToken` should generate ≥32 random chars and refuse mutation.

## Domain services (pure) **[VERIFIED·SECONDARY]**
- **`PassDocumentBuilder`** (domain service): takes a `Pass` + its `PassTemplate` → returns the `pass.json` **as a plain object/DTO**. Pure logic — merges template layout with current field values, sets the required keys, `changeMessage`, barcodes. **No I/O, no signing.**

## Ports (interfaces in domain) **[VERIFIED·SECONDARY]**
```
IPassRepository, IMemberRepository, IDeviceRepository, IRegistrationRepository, IPassTemplateRepository  (return domain objects)
IPassSigningPort      sign(passJson, images) -> Buffer        (PKCS#7 + zip; infra)
IPushNotificationPort notify(pushTokens, passTypeId) -> void  (APNs; infra)
ICertificateStore     getSigningMaterial() -> {signerCert, signerKey, wwdr, passphrase}  (secrets; infra)
```

## Application layer — commands / queries / handlers

> v3: one handler per command/query; handlers orchestrate, hold no domain logic; queries return DTOs, not domain objects; inject *interfaces*.

| Use-case | Type | Handler does |
|---|---|---|
| `IssuePassCommand(memberId, passTypeId)` | command | Load `Member` + `PassTemplate`; mint `SerialNumber` + `AuthenticationToken` (`crypto.randomUUID`/`randomBytes`); `PassDocumentBuilder` → `IPassSigningPort.sign` → persist `Pass`; return `.pkpass` Buffer + MIME. |
| `UpdatePassFieldsCommand(memberId, newValues)` | command | Update `Member` + `Pass`, bump `lastUpdated` (raises `PassFieldsUpdated`); query registrations; `IPushNotificationPort.notify`. |
| `RegisterDeviceCommand(deviceLibId, passTypeId, serial, pushToken, authToken)` | command | Validate `authToken` against the `Pass`; upsert `Device` (update pushToken); create `Registration`. → 201/200/401. |
| `UnregisterDeviceCommand(...)` | command | Validate token; delete `Registration`. → 200/401. |
| `GetUpdatedSerialsQuery(deviceLibId, passTypeId, passesUpdatedSince)` | query | Return `{ serialNumbers, lastUpdated }` DTO. → 200/204. |
| `GetLatestPassQuery(passTypeId, serial, authToken, ifModifiedSince)` | query | Validate token; compare `lastUpdated` vs `If-Modified-Since`; sign+return Buffer or 304. → 200/304/401. |

The PassKit web-service endpoints in [`06`](06-web-service-and-apns.md) map **1:1** onto these handlers in the presentation layer.

## Infrastructure

- **`SqlPassRepository`, `SqlMemberRepository`, `SqlDeviceRepository`, `SqlRegistrationRepository`** — implement the domain interfaces, map rows ↔ domain objects (never leak ORM rows up).
- **`PassKitSigningAdapter`** implements `IPassSigningPort` using **`passkit-generator`** (below).
- **`ApnsAdapter`** implements `IPushNotificationPort` (HTTP/2, empty payload, topic = passTypeId).
- **`SecretsCertificateStore`** implements `ICertificateStore` (reads `.p12`/PEM + passphrase from a KMS/secret manager — never the repo).

## Library choice **[VERIFIED·SECONDARY]**

**Use `passkit-generator` (alexandercerutti)** — the de-facto, actively-maintained Node library. Latest **v3.5.7 (published 2025-12-25)**.

- **Model + dynamic split:** a `*.pass/` model folder holds static assets (`icon.png`, `logo.png`, `strip.png`, base `pass.json` with the template/layout). Dynamic per-member data (`serialNumber`, `authenticationToken`, field values, `webServiceURL`) is passed at runtime to `PKPass.from()`.
- **Certificate inputs object:** `{ wwdr, signerCert, signerKey, signerKeyPassphrase }` — each PEM string or Buffer; passphrase optional. **Must use WWDR G4.**
- **Output:** `.getAsBuffer()` (Buffer), `.getAsStream()` (Readable), `.getAsRaw()` (`{filename: Buffer}`). `.mimeType` → `application/vnd.apple.pkpass`. `PKPass.pack(a,b)` → a `.pkpasses` bundle.

```js
const { PKPass } = require("passkit-generator");
const pass = await PKPass.from({
  model: "models/lovalte-loyalty.pass",
  certificates: {                      // from ICertificateStore — NOT the repo
    wwdr: certs.wwdr,
    signerCert: certs.signerCert,
    signerKey: certs.signerKey,
    signerKeyPassphrase: certs.passphrase,
  },
}, {
  serialNumber: pass.serialNumber,
  authenticationToken: pass.authToken,
  webServiceURL: "https://passes.lovalte.com/v1/",
});
pass.primaryFields.push({ key: "points", label: "POINTS", value: String(member.points), changeMessage: "Your balance is now %@!" });
const buffer = pass.getAsBuffer();      // ← the signed .pkpass
```

**Alternatives** (if not Node): .NET `dotnet-passbook` v4.0.1 (2025-06-05, .NET Standard 2.0; `PassGenerator.Generate(PassGeneratorRequest) -> byte[]`); Go `alvinbaena/passkit`; Java `jpasskit`. **Avoid `node-passbook`** — abandoned/deprecated. **[VERIFIED·SECONDARY]**

## Serving the pass **[VERIFIED·SECONDARY]**
```js
// presentation layer
res.set("Content-Type", "application/vnd.apple.pkpass")
   .set("Last-Modified", pass.updatedAt.toUTCString())
   .send(buffer);
```
- MIME **dot-form** `application/vnd.apple.pkpass`.
- **Pre-generate + cache** the signed buffer in object storage keyed by `serialNumber` + version; serve from cache on `GET /v1/passes/...` to avoid re-signing every poll; invalidate on update. **[VERIFIED·SECONDARY]**

## Suggested PostgreSQL schema **[VERIFIED·SECONDARY]**

> Infrastructure persistence model — maps to the aggregates above. (`members` lives in the Loyalty context; shown abbreviated.)

```sql
CREATE TABLE pass_types (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pass_type_identifier  TEXT NOT NULL UNIQUE,        -- 'pass.com.lovalte.loyalty'
  team_identifier       TEXT NOT NULL,
  organization_name     TEXT NOT NULL,
  web_service_url       TEXT NOT NULL,               -- ends with '/'
  template_fields       JSONB NOT NULL,              -- layout/static config
  image_asset_refs      JSONB NOT NULL,              -- S3 keys / paths
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE passes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_number         TEXT NOT NULL UNIQUE,        -- Apple identity
  pass_type_id          UUID NOT NULL REFERENCES pass_types(id),
  member_id             UUID NOT NULL,               -- FK to members (loyalty ctx)
  authentication_token  TEXT NOT NULL,               -- bearer secret, NEVER changes
  field_values          JSONB NOT NULL,              -- { key: value } current state
  voided                BOOLEAN NOT NULL DEFAULT false,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),  -- the 'tag'
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX passes_type_updated ON passes (pass_type_id, updated_at);

CREATE TABLE devices (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_library_identifier  TEXT NOT NULL UNIQUE,   -- from Apple
  push_token                 TEXT NOT NULL,          -- APNs; overwritten on re-register
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE registrations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id   UUID NOT NULL REFERENCES devices(id)  ON DELETE CASCADE,
  pass_id     UUID NOT NULL REFERENCES passes(id)   ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (device_id, pass_id)
);
CREATE INDEX registrations_pass   ON registrations (pass_id);
CREATE INDEX registrations_device ON registrations (device_id);
```

### The 3 queries that back the web service **[VERIFIED·SECONDARY]**

**Push tokens to notify when a pass changes** (UpdatePassFields → APNs):
```sql
SELECT d.push_token
FROM registrations r
JOIN devices d ON d.id = r.device_id
JOIN passes  p ON p.id = r.pass_id
WHERE p.serial_number = $1
  AND p.pass_type_id = (SELECT id FROM pass_types WHERE pass_type_identifier = $2);
```

**Serials updated since a tag** (GET updated-serials):
```sql
SELECT p.serial_number, MAX(p.updated_at) AS last_updated
FROM registrations r
JOIN devices  d  ON d.id  = r.device_id
JOIN passes   p  ON p.id  = r.pass_id
JOIN pass_types pt ON pt.id = p.pass_type_id
WHERE d.device_library_identifier = $1
  AND pt.pass_type_identifier = $2
  AND p.updated_at > $3                 -- passesUpdatedSince
GROUP BY p.serial_number;
```

**Upsert device on registration** (idempotent, refresh push token):
```sql
INSERT INTO devices (device_library_identifier, push_token)
VALUES ($1, $2)
ON CONFLICT (device_library_identifier)
DO UPDATE SET push_token = EXCLUDED.push_token, updated_at = now();
```

`updated_at` is the **opaque tag** returned as `lastUpdated` and received as `passesUpdatedSince`. Store/return it as a Unix-epoch string or ISO 8601 — opaque to the device, but must be monotonic.

## v3 anti-patterns to avoid here
- Don't let the React presentation layer or web-service controllers build `pass.json` or call `passkit-generator` directly — go through the application handlers → `PassDocumentBuilder` + `IPassSigningPort`.
- Don't store certs/passphrase in `pass_types` or the repo — that's `ICertificateStore`/secrets.
- `Pass` and `Member` are separate aggregates → reference by ID, sync via `PointsEarned`/`PassFieldsUpdated` events, **no cross-aggregate transaction**.
- Repositories return domain objects, not JSONB rows.
