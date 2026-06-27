# 00 — Method, Sources & Master Corrections Log

## How this was researched

Two adversarial research passes, both citation-first and Apple-primary-first.

**Pass 1 — Deep research (5 angles, 105 agents).** Decomposed the question into: (1) pass format & anatomy, (2) certificates & signing, (3) distribution, (4) web service & APNs, (5) backend/libraries. 23 sources fetched → 100 claims extracted → top 25 verified with 3-vote adversarial checking → 11 high-confidence findings survived, **0 killed**. All anchored to Apple first-party docs.

**Pass 2 — Gap fill (5 angles, 10 agents on Sonnet).** Filled what Pass 1 dropped on budget: complete `pass.json` field reference, image dimensions, exact HTTP contracts, DDD backend, and constraints/NFC/iOS/security. Each research agent was paired with an adversarial fact-checker that re-verified every falsifiable specific and logged corrections.

### Why Apple's modern docs are quoted indirectly

`developer.apple.com/documentation/walletpasses/…` pages are **JavaScript-rendered** and return only a page title to static fetchers (they are **not** 404 — they exist, just aren't statically scrapable). The reliable Apple-primary anchors were therefore:

- The **archived** Wallet Developer Guide (static HTML): `developer.apple.com/library/archive/documentation/UserExperience/Conceptual/PassKit_PG/Creating.html` (and `Updating.html`, `DistributingPasses.html`).
- The archived **PassKit Web Service Reference** and **APNs guide**.
- Apple **help/support** pages (account capabilities, certificates).
- The community **JSON Schema** (`walletpass/json-schemas`) and well-maintained libraries (`passkit-generator`, Go `passkit`, `dotnet-passbook`).

The archived guide remains canonical: the `.pkpass` format, web-service endpoints, and empty-payload push model are **unchanged through iOS 26**.

## Verification stats

| | Pass 1 | Pass 2 |
|---|---|---|
| Search angles | 5 | 5 |
| Sources fetched | 23 | ~30 |
| Claims extracted | 100 | ~70 |
| Claims verified | 25 | ~107 across 5 gaps |
| Confirmed | 25 | majority |
| Corrected | — | ~9 |
| Killed/refuted | 0 | 0 |
| Final findings | 11 | 5 gap dossiers |

## Source list (with quality ratings)

### Apple primary (archived / static — directly quotable)
- `…/PassKit_PG/Creating.html` — pass anatomy, keys, images, colors, localization, barcodes. **PRIMARY**
- `…/PassKit_PG/Updating.html` — updates, web service, APNs, empty payload, dual-use cert. **PRIMARY**
- `…/PassKit_PG/DistributingPasses.html` — distribution, MIME type. **PRIMARY**
- `…/PassKit/Reference/PassKit_WebService/WebService.html` — the 5 REST endpoints. **PRIMARY** (JS-gated; corroborated by Swagger gists)
- `…/RemoteNotificationsPG/CommunicatingwithAPNs.html` — APNs HTTP/2, JWT, hosts, priority. **PRIMARY**

### Apple primary (modern / help)
- `developer.apple.com/help/account/capabilities/create-wallet-identifiers-and-certificates/` — Pass Type ID + cert setup, role requirement. **PRIMARY**
- `developer.apple.com/help/account/certificates/create-a-certificate-signing-request/` — CSR via Keychain. **PRIMARY**
- `developer.apple.com/documentation/walletpasses/building-a-pass` — 5 build steps. **PRIMARY** (via backing JSON)
- `developer.apple.com/documentation/walletpasses/distributing-and-updating-a-pass` — 3 distribution methods. **PRIMARY**
- `developer.apple.com/wallet/add-to-apple-wallet-guidelines/` — badge rules, PKAddPassButton. **PRIMARY**
- `developer.apple.com/documentation/passkit/pkaddpassesviewcontroller` + `…/pkaddpassbutton/` — in-app add. **PRIMARY**
- `developer.apple.com/wallet/loyalty-passes/` — VAS/NFC loyalty program, NFC cert request. **PRIMARY**
- `developer.apple.com/wallet/whats-new/` — iOS 18/26/27 Wallet features. **PRIMARY**
- `support.apple.com/guide/security/contactless-passes-in-apple-pay-…` — VAS crypto (ECDH P-256). **PRIMARY**
- `developer.apple.com/support/certificates/` — cert expiry framing. **PRIMARY**

### Secondary / community (corroborating, well-maintained)
- `github.com/walletpass/json-schemas` — `pass.schema.json`, enum values, minLengths. **SECONDARY (authoritative for shapes)**
- `github.com/alexandercerutti/passkit-generator` (+ wiki) — the Node library. **SECONDARY**
- `pkg.go.dev/github.com/alvinbaena/passkit` — Go library, field structs. **SECONDARY**
- `github.com/tomasmcguinness/dotnet-passbook` — .NET library. **SECONDARY**
- Swagger gists (`tinovyatkin`, `ckrack`) mirroring the web-service spec. **SECONDARY**
- `github.com/kormax/apple-vas` — VAS reverse-engineering (AID, modes, AES-GCM). **SECONDARY**
- `walletwallet.dev`, `walletwallet.alen.ro`, `passmeister.com`, `passcreator.com`, `nearform.com`, `drobinin.com`, `rahulpnath.com`, Medium build guides. **SECONDARY/BLOG**

## Master corrections log

These are the points where the first (memory-based) draft was wrong or where Apple's docs say something subtler than common belief. **Read these before trusting your instinct.**

| # | Topic | The trap | Correct value | Conf |
|---|-------|----------|---------------|------|
| C1 | `stripColor` key | Often listed as a 4th color key | **Not in any Apple primary source.** Only 3 color keys are confirmed: `backgroundColor`, `foregroundColor`, `labelColor`. `stripColor` appears only in 3rd-party tooling, with conflicting definitions. Don't rely on it. | CORRECTED |
| C2 | storeCard `strip.png` size | "375×98" (that's **event tickets**) | **375×144 pt** for storeCard (the gift-card/coupon bucket) → 750×288 @2x, 1125×432 @3x. Apple never literally maps "storeCard"→this bucket; the documented alternative is 375×123 ("all other cases"). 375×144 is the safe choice (images are scaled/cropped). | CORRECTED |
| C3 | Web-service path param | "`deviceID`" | **`deviceLibraryIdentifier`** (Apple's exact name). | CORRECTED |
| C4 | Beacon dict keys | proximityUUID/major/minor/relevantText | Also has optional **`name`**. | CORRECTED |
| C5 | App Store name | "iTunes App Store" | Just **"App Store"** (rebranded 2019); `associatedStoreIdentifiers` behaves the same. | CORRECTED |
| C6 | Color format | hex like `#2C1C0E` | **`rgb(r, g, b)` strings only** (integers 0-255). Hex is silently ignored → defaults to black-on-white. | VERIFIED |
| C7 | APNs sandbox host | "api.sandbox.push.apple.com is canonical" | Archived Apple docs name it **`api.development.push.apple.com`**; practitioners use **`api.sandbox.push.apple.com`**. Both resolve to the same env. Production is `api.push.apple.com`. | CORRECTED |
| C8 | `apns-push-type` for passes | assumed documented as "background" | The header **postdates** Apple's PassKit spec and isn't named for passes in primary docs. `background` is community practice and the sensible value; pair it with **`apns-priority: 5`** (priority 10 is rejected for background-typed pushes). | UNVERIFIED→use background/5 |
| C9 | MIME type | `application/vnd-apple.pkpass` (hyphen) | **`application/vnd.apple.pkpass`** (dot). Bundle of many: `application/vnd.apple.pkpasses`. The hyphen form (seen in one blog) breaks iOS. | VERIFIED |
| C10 | WWDR generation | "any WWDR cert" | Must be **WWDR G4** for certs issued after 2022-01-27. G2/G3/G5/G6 fail validation; G1 expired 2023-02-07. | VERIFIED |
| C11 | VAS cipher source | "Apple Security Guide says AES-GCM" | Apple's Security Guide names only **ECDH P-256** key agreement. **AES-GCM** is from community research (kormax/apple-vas), not Apple's published text. | CORRECTED |
| C12 | `authenticationToken` length | "Apple mandates 16 chars" | Min 16 chars is **3rd-party-sourced** (not found verbatim in fetchable Apple docs). Apple **does** state verbatim: *never change the token on update*. Use ≥32 random chars to be safe. | VERIFIED·SECONDARY |
| C13 | icon "required" | Apple says "should measure 29×29" | Apple uses *should*, not *required*; but signing fails without `icon.png` in practice → **treat as required**. | VERIFIED·SECONDARY |
| C14 | Which endpoints need auth | "all of them" | **Auth required:** register, unregister, get-latest-pass. **No auth per spec:** get-updated-serials, log. | VERIFIED |
| C15 | `webServiceURL` trailing slash | optional | Community consensus: **must end with `/`** for correct path concatenation by Wallet. | VERIFIED·SECONDARY |
| C16 | dotnet-passbook date | "August 2025" | v4.0.1 published **June 5, 2025** (NuGet). | CORRECTED |

See per-topic files for the full verbatim quotes and source URLs behind each row.
