# Apple Wallet Loyalty / Store Cards — Implementation Research

> Research-only deliverable. **No application code is built here.** This folder is the verified knowledge base for building Apple Wallet loyalty cards (PassKit "store cards") for the **Lovalte** project: a React website/app frontend + PostgreSQL backend in DDD style.

## What this is

Everything you need to implement Apple Wallet loyalty cards "the right way," gathered from **Apple's official developer documentation first**, cross-checked against authoritative libraries and community references, and **adversarially fact-checked** (every falsifiable specific — pixel sizes, field names, HTTP status codes — was independently verified, and corrections are recorded inline).

Two research passes produced this:
1. A 5-angle deep-research pass (105 agents) → 11 high-confidence core findings, each surviving 3-0 adversarial verification against Apple primary docs.
2. A targeted gap-fill pass (10 agents) → full field/image/HTTP/backend/constraints detail, each fact re-verified, corrections logged.

See [`00-method-and-sources.md`](00-method-and-sources.md) for the full source list and verification stats.

## How to read it (for humans and AI)

Files are numbered in build order. Each is self-contained and citation-rich.

| File | Covers |
|------|--------|
| [`00-method-and-sources.md`](00-method-and-sources.md) | How this was researched, every source + quality rating, verification stats, **master corrections log** |
| [`01-overview-and-glossary.md`](01-overview-and-glossary.md) | What a pass is, the storeCard model, the 3 ways to do "loyalty" on Apple, glossary |
| [`02-pass-json-reference.md`](02-pass-json-reference.md) | Complete `pass.json` reference: every top-level key, `storeCard` dict, field dict, barcodes |
| [`03-images-colors-localization.md`](03-images-colors-localization.md) | Image assets + exact @1x/@2x/@3x dimensions, color syntax, layout regions, localization |
| [`04-certificates-and-signing.md`](04-certificates-and-signing.md) | Apple Developer setup, Pass Type ID, CSR, WWDR G4, the PKCS#7 signing steps, OpenSSL |
| [`05-distribution.md`](05-distribution.md) | "Add to Apple Wallet" button, web/email/app delivery, MIME type, the iOS 26 Add to Wallet API |
| [`06-web-service-and-apns.md`](06-web-service-and-apns.md) | The 5 PassKit web-service endpoints (exact routes/headers/status codes) + APNs push updates |
| [`07-backend-ddd-architecture.md`](07-backend-ddd-architecture.md) | Bounded contexts, aggregates, domain services, **PostgreSQL schema**, library choice, serving |
| [`08-constraints-nfc-ios-security.md`](08-constraints-nfc-ios-security.md) | NFC/VAS (+ approval), iOS 18/26/27 Wallet changes, push rate limits, **key-storage security** |
| [`09-implementation-checklist.md`](09-implementation-checklist.md) | End-to-end build order for the Lovalte stack |
| [`data/pass.example.json`](data/pass.example.json) | A complete, verified example storeCard `pass.json` (machine-readable) |
| [`data/facts.json`](data/facts.json) | Machine-readable index of every verified fact + confidence + source (AI retrieval) |

## Confidence legend

Every non-trivial claim carries a tag:

- **[VERIFIED]** — confirmed against Apple primary docs (or 3-0 adversarial verification). Build on it.
- **[VERIFIED·SECONDARY]** — confirmed, but the authoritative source is a well-maintained library/community reference, not a fetchable Apple page (Apple's modern docs are JS-rendered and often un-fetchable; the archived guide and JSON schema were the primary anchors).
- **[CORRECTED]** — the first research pass got it wrong; the corrected value is shown. These are the traps — read them.
- **[UNVERIFIED]** — plausible and widely repeated, but no authoritative source confirmed it. Treat as a lead to confirm before you depend on it.

## TL;DR — the shortest correct path

1. A loyalty card = a **`storeCard`-style `.pkpass`**: a ZIP of `pass.json` + images + `manifest.json` (SHA-1 hashes) + a `signature` (PKCS#7 detached sig of the manifest). **[VERIFIED]**
2. Sign it with a **Pass Type ID certificate** (you already have an Apple Developer membership → create one), including the **Apple WWDR G4** intermediate. **[VERIFIED]**
3. **Generate and sign on the server**, never in the browser. Use **`passkit-generator`** (Node). **[VERIFIED·SECONDARY]**
4. Serve it as **`application/vnd.apple.pkpass`** behind an "Add to Apple Wallet" button. **[VERIFIED]**
5. To update points/balance later: store `webServiceURL` + `authenticationToken` in the pass, implement the **5 web-service endpoints**, and send an **empty-payload APNs push** (topic = your passTypeIdentifier) when a pass changes. **[VERIFIED]**
6. **Barcode/QR loyalty needs no special Apple approval.** Only **NFC tap-to-use (VAS)** needs a separate NFC certificate + Apple approval — out of scope for v1. **[VERIFIED]**

Current as of **iOS 26 (2025) → iOS 27 (announced WWDC 2026)**. The `.pkpass`/`storeCard` format is stable across iOS 18→26; `storeCard` is **not** deprecated.
