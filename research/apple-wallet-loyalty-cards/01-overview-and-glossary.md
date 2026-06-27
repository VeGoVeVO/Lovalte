# 01 — Overview & Glossary

## What an Apple Wallet pass actually is

A Wallet pass is a **signed ZIP archive** with the extension `.pkpass`. **[VERIFIED]** It contains:

```
yourpass.pkpass  (a ZIP, renamed)
├── pass.json        ← all the data + layout (the only logical "code")
├── manifest.json    ← { "<filename>": "<SHA-1 hex>" } for every other file
├── signature        ← PKCS#7 *detached* signature of manifest.json (binary, no extension)
├── icon.png         ← required image
├── icon@2x.png
├── icon@3x.png
├── logo.png         ← + @2x/@3x
├── strip.png        ← + @2x/@3x  (the loyalty card "banner")
└── en.lproj/        ← optional localization folders
    └── pass.strings
```

The integrity chain: `pass.json` + images are hashed into `manifest.json`; `manifest.json` is signed into `signature` using your Pass Type ID certificate's private key (with Apple's WWDR intermediate included). Wallet verifies the signature, then verifies each file hash against the manifest. Tamper with any byte → the pass is rejected. **[VERIFIED]**

> Apple, verbatim: *manifest.json is "a JSON object that contains a dictionary of the SHA1 hashes for each of the source files… The dictionary key is the pathname of the file relative to the top level of the pass, and the value is the SHA1 hash,"* and the signature is *"a PKCS #7 detached signature of manifest.json."*

## The `storeCard` style = loyalty card

There are exactly **five** pass styles: `boardingPass`, `coupon`, `eventTicket`, `generic`, `storeCard`. **[VERIFIED]**

For loyalty, the correct one is **`storeCard`**. Apple, verbatim: *"This pass style is appropriate for store loyalty cards, discount cards, points cards, and gift cards… When the account carries a balance, show the current balance on the pass."* **[VERIFIED]** `storeCard` is **not deprecated** and remains correct through iOS 26. **[VERIFIED]**

(`generic` and the new iOS 27 "Poster Generic" template can also host membership/loyalty content — see [`08`](08-constraints-nfc-ios-security.md) — but `storeCard` is the universally-supported baseline and what this research targets.)

## The three distinct ways to "do loyalty" on Apple — don't confuse them

| Approach | What it is | Needs special Apple approval? | For Lovalte v1? |
|---|---|---|---|
| **`storeCard` `.pkpass` with barcode/QR** | The classic signed pass; user shows a QR/barcode at the register or scans to earn/redeem | **No** — only the standard Pass Type ID certificate you can already create | **Yes — this is the build.** |
| **NFC / VAS (Value Added Services)** | Tap-to-use at an NFC POS terminal; the pass transmits an encrypted payload over NFC | **Yes** — separate **NFC certificate** + Apple application/approval + VAS-certified terminals | No (future; see [`08`](08-constraints-nfc-ios-security.md)) |
| **Add to Wallet API (iOS 26+) / Poster Generic (iOS 27+)** | Newer Apple-provided integration & richer pass templates for loyalty/rewards | Uses the same certs; some richer layouts (poster/NFC) need NFC approval | Optional enhancement; baseline `.pkpass` still works everywhere |

**Bottom line for Lovalte:** a barcode/QR `storeCard` `.pkpass`, signed server-side, distributed via an "Add to Apple Wallet" button, updated via the PassKit web service + APNs. No NFC, no special approval.

## The end-to-end lifecycle (mental model)

```
1. ISSUE
   React app → "Add to Apple Wallet" → backend builds pass.json for this member
   → signs → returns .pkpass (application/vnd.apple.pkpass) → Wallet installs it.

2. REGISTER (automatic, if the pass has webServiceURL + authenticationToken)
   Device → POST /v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeId}/{serial}
          body { pushToken }  → backend stores the registration.

3. UPDATE (points/tier change)
   Backend updates the member's pass record, bumps updated_at
   → sends EMPTY-payload APNs push (topic = passTypeIdentifier) to each registered device.

4. PULL
   Device wakes → GET /v1/devices/{dlid}/registrations/{passTypeId}?passesUpdatedSince={tag}
   → gets changed serials → GET /v1/passes/{passTypeId}/{serial} (If-Modified-Since)
   → backend regenerates+signs the latest pass → Wallet replaces it, shows changeMessage.
```

## Glossary

- **PassKit** — Apple's framework/format family for Wallet passes (and Apple Pay). The on-device API is the `PassKit` framework; the file format is the `.pkpass` bundle.
- **`.pkpass`** — the signed ZIP bundle that is one pass. **MIME type `application/vnd.apple.pkpass`** (dot, not hyphen). **[VERIFIED]**
- **`.pkpasses`** — a bundle of multiple passes; MIME `application/vnd.apple.pkpasses`. **[VERIFIED·SECONDARY]**
- **Pass Type Identifier (`passTypeIdentifier`)** — a reverse-DNS id starting with `pass.`, e.g. `pass.com.lovalte.loyalty`. Registered in your Apple Developer account; must match the signing cert. **[VERIFIED]**
- **Team Identifier (`teamIdentifier`)** — your 10-character Apple Developer Team ID; must match the cert. **[VERIFIED]**
- **Serial Number (`serialNumber`)** — your unique id for one pass instance. `passTypeIdentifier` + `serialNumber` together uniquely identify a pass. **[VERIFIED]**
- **Pass Type ID Certificate** — the certificate you create in your Apple account to sign passes; its private key signs the manifest. **Also used to authenticate APNs pushes** for that pass type. **[VERIFIED]**
- **WWDR certificate** — Apple Worldwide Developer Relations intermediate cert, included in the signature so Wallet can chain trust. Must be **G4**. **[VERIFIED]**
- **`manifest.json`** — map of every bundle file → its SHA-1 hash. **[VERIFIED]**
- **`signature`** — PKCS#7 detached signature of `manifest.json`. **[VERIFIED]**
- **PassKit Web Service** — the REST API (5 endpoints) your server exposes at `webServiceURL` so devices can register for and pull pass updates. **[VERIFIED]**
- **`authenticationToken`** — per-pass bearer secret stored in `pass.json`; the device sends it as `Authorization: ApplePass <token>`. Never change it on update. **[VERIFIED]**
- **`deviceLibraryIdentifier`** — opaque per-device id Apple supplies on registration (not the APNs push token). **[VERIFIED]**
- **APNs** — Apple Push Notification service. For passes you send an **empty `{}` payload**; it only signals "something for this pass type changed — go pull." **[VERIFIED]**
- **VAS (Value Added Services)** — Apple Pay's NFC protocol for tap-to-use loyalty at the register. Requires an NFC certificate + Apple approval. **[VERIFIED]**
- **changeMessage** — a per-field template string (must contain `%@`) that produces a lock-screen notification when that field's value changes via a push update. **[VERIFIED]**
