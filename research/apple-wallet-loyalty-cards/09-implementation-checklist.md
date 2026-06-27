# 09 — Implementation Checklist (Lovalte build order)

> Research deliverable — the ordered path to implement, when you choose to build. Nothing here is built yet. Each step links to the file with the verified detail.

## Phase 0 — Apple Developer setup (one-time) → [`04`](04-certificates-and-signing.md)
- [ ] Confirm role: **Account Holder or Admin**.
- [ ] Register a **Pass Type ID** (e.g. `pass.com.lovalte.loyalty`).
- [ ] Create the **Pass Type ID Certificate** from a CSR (Keychain or OpenSSL).
- [ ] Export to **`.p12`** (passphrase-protected) and convert to PEM (`signerCert.pem`, `signerKey.pem`).
- [ ] Download **WWDR G4** → `wwdr.pem`. (G4 only — not G2/G3/G5/G6.)
- [ ] Record your 10-char **Team ID**.
- [ ] (Optional, for push via token auth) Create an APNs **`.p8`** auth key — note Key ID.

## Phase 1 — Static pass design → [`02`](02-pass-json-reference.md), [`03`](03-images-colors-localization.md)
- [ ] Design the `storeCard` field layout: header (tier), primary (points), secondary/aux (member, next reward — **≤4 combined with a square barcode**), back (terms/contact).
- [ ] Pick the barcode: **QR** (`PKBarcodeFormatQR`, `iso-8859-1`).
- [ ] Produce images at @1x/@2x/@3x: `icon` (29/58/87), `logo` (160×50…), **`strip` (375×144 → 750×288 → 1125×432)**. PNG/sRGB.
- [ ] Choose colors as **`rgb(r,g,b)`** strings (no hex, no `stripColor`).
- [ ] Build the `*.pass/` model folder for `passkit-generator` (static assets + base `pass.json`).
- [ ] Validate the example: [`data/pass.example.json`](data/pass.example.json).

## Phase 2 — Signing service (infrastructure) → [`04`](04-certificates-and-signing.md), [`07`](07-backend-ddd-architecture.md)
- [ ] Install **`passkit-generator`** (v3.5.7+).
- [ ] Implement `ICertificateStore` reading the `.p12`/PEM + passphrase from a **secrets manager / KMS** (never the repo).
- [ ] Implement `IPassSigningPort` via `PKPass.from(model, certificates, props)` → `getAsBuffer()`.
- [ ] Smoke test: generate one pass, AirDrop/email the `.pkpass` to an iPhone, confirm it opens in Wallet.

## Phase 3 — Domain + issuance → [`07`](07-backend-ddd-architecture.md)
- [ ] Model contexts/aggregates per v3 DDD (`Member`, `PassTemplate`, **`Pass`**, `Device`/`Registration`). Re-invoke the `v3-ddd-architecture` skill.
- [ ] `PassDocumentBuilder` (domain) builds `pass.json` from `Pass`+`PassTemplate`.
- [ ] `IssuePassCommand` handler: mint `serialNumber` + `authenticationToken` (≥32 random), build, sign, persist.
- [ ] PostgreSQL tables: `pass_types`, `passes`, `devices`, `registrations` (DDL in [`07`](07-backend-ddd-architecture.md)).

## Phase 4 — Distribution → [`05`](05-distribution.md)
- [ ] Pass-download endpoint returns the signed buffer as **`Content-Type: application/vnd.apple.pkpass`** (+ `Content-Disposition`).
- [ ] React: Apple's official **"Add to Apple Wallet"** badge, shown on iOS, linking to that endpoint.
- [ ] (Optional) email delivery with the correct MIME type.

## Phase 5 — Updates (web service + APNs) → [`06`](06-web-service-and-apns.md)
- [ ] Put `webServiceURL` (HTTPS, trailing `/`) + `authenticationToken` in every issued pass.
- [ ] Implement the **5 endpoints** mapped to handlers:
  - [ ] `POST …/devices/{deviceLibraryIdentifier}/registrations/{passTypeId}/{serial}` → 201/200/401
  - [ ] `GET  …/devices/{deviceLibraryIdentifier}/registrations/{passTypeId}?passesUpdatedSince=` → 200/204
  - [ ] `GET  …/passes/{passTypeId}/{serial}` (If-Modified-Since) → 200/304/401
  - [ ] `DELETE …/devices/{deviceLibraryIdentifier}/registrations/{passTypeId}/{serial}` → 200/401
  - [ ] `POST …/log` → 200
- [ ] Auth check (`ApplePass <token>`) on register/unregister/get-pass.
- [ ] `ApnsAdapter` (HTTP/2, `api.push.apple.com`, topic = passTypeId, payload `{}`, `apns-push-type: background`, `apns-priority: 5`).
- [ ] On points/tier change: bump `updated_at`, invalidate cache, push to registered devices.
- [ ] Add a `changeMessage` (with `%@`) on the points field so users get a lock-screen notification.

## Phase 6 — Hardening → [`08`](08-constraints-nfc-ios-security.md)
- [ ] Signing key in KMS/HSM; nothing secret in the repo; passphrase in the secret store.
- [ ] Track Pass Type ID cert **expiry** (≈1 yr) and plan **replacement** (can't renew).
- [ ] Remove devices on APNs invalid-token feedback.
- [ ] Pre-generate + cache signed passes (object storage) keyed by serial+version.
- [ ] Push once per real change (respect coalescing).

## Out of scope for v1 (future research)
- [ ] **NFC tap-to-use (VAS)** — needs an Apple NFC-certificate application + VAS terminals. [`08`](08-constraints-nfc-ios-security.md)
- [ ] **iOS 26 Add to Wallet API** / **iOS 27 Poster Generic + Featured Actions** — richer issuance/UX; re-research when targeting.
- [ ] Native iOS app `PKAddPassButton` in-app add.
- [ ] Google Wallet parity (separate platform, separate research).

## Pre-flight gotchas (the corrections that bite) → [`00`](00-method-and-sources.md)
- Strip is **375×144** for storeCard, **not** 375×98.
- Colors are **`rgb()` only**; **no `stripColor`**.
- Path param is **`deviceLibraryIdentifier`**.
- MIME is **`application/vnd.apple.pkpass`** (dot).
- WWDR must be **G4**.
- `authenticationToken` **never changes** on update.
- Background pushes use **priority 5** (not 10).
