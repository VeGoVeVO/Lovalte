# 02 — `pass.json` Complete Reference (storeCard / loyalty)

`pass.json` is the heart of the pass: required identity keys + optional display/behaviour keys + exactly one **style dictionary** (`storeCard`) holding the fields. A complete, verified example is at [`data/pass.example.json`](data/pass.example.json).

Primary sources: archived `PassKit_PG/Creating.html`, `walletpass/json-schemas/pass.schema.json`. All enum values below were **confirmed verbatim against the JSON schema**.

---

## 1. Required top-level keys (6) — every pass, every style **[VERIFIED]**

| Key | Type | Meaning |
|---|---|---|
| `formatVersion` | Integer | **Must be `1`** (only version defined). |
| `passTypeIdentifier` | String | Reverse-DNS id, e.g. `pass.com.lovalte.loyalty`. **Must match the signing certificate.** |
| `serialNumber` | String | Unique within the pass type. UUID/ULID/any opaque string. `passTypeIdentifier`+`serialNumber` = global identity. |
| `teamIdentifier` | String | 10-char Apple Developer Team ID. **Must match the certificate.** |
| `organizationName` | String | Brand name; shown on the lock screen and in Mail attachments. |
| `description` | String | VoiceOver accessibility label, e.g. "Lovalte loyalty card". |

## 2. Visual / branding keys (optional) **[VERIFIED]**

| Key | Type | Notes |
|---|---|---|
| `logoText` | String | Text shown next to the logo image on the front. |
| `foregroundColor` | String | **`rgb(r, g, b)`** only — field values / foreground text. |
| `backgroundColor` | String | **`rgb(r, g, b)`** — pass background (ignored if a `background.png` is supplied; storeCard has no background image anyway). |
| `labelColor` | String | **`rgb(r, g, b)`** — the small field labels. Defaults to an auto-contrast color if omitted. |

> **Color syntax is `rgb(r, g, b)` strings ONLY** (integers 0-255), e.g. `"rgb(44, 28, 14)"`. Hex (`#2C1C0E`) is **silently ignored** → black-on-white default. **[VERIFIED]** (corrections C6)
>
> **`stripColor` is NOT a confirmed Apple key.** **[CORRECTED · C1]** It appears only in 3rd-party tooling with conflicting definitions; it is absent from the archived Apple guide and the JSON schema. Do not rely on it — control the strip's appearance with the `strip.png` image and `foregroundColor`/`labelColor` instead.

## 3. Web service / update keys (optional, but both-or-neither) **[VERIFIED]**

| Key | Type | Notes |
|---|---|---|
| `webServiceURL` | String (HTTPS) | Base URL of your PassKit web service. **Must be HTTPS.** Community consensus: **end it with a trailing `/`**. **[VERIFIED·SECONDARY · C15]** |
| `authenticationToken` | String | Per-pass bearer secret, **≥16 chars** (use ≥32 random). Sent as `Authorization: ApplePass <token>`. **Must NOT change on pass updates** (Apple verbatim). **[VERIFIED]** |

If you want push updates (you do, for points/tier), include **both**. Omit both for a static card.

## 4. Barcode keys **[VERIFIED]**

| Key | Type | Notes |
|---|---|---|
| `barcodes` | Array of Barcode dicts | **Modern (iOS 9+).** First supported format is rendered; list multiple for fallback. |
| `barcode` | Barcode dict (singular) | **Deprecated**, for iOS 8 and earlier. Include alongside `barcodes` only for legacy backward-compat; iOS 9+ ignores it when `barcodes` is present. |

**Barcode dict keys:**

| Key | Req | Notes |
|---|---|---|
| `format` | ✔ | One of `PKBarcodeFormatQR`, `PKBarcodeFormatPDF417`, `PKBarcodeFormatAztec`, `PKBarcodeFormatCode128`. |
| `message` | ✔ | The encoded payload string (e.g. the member id/token). |
| `messageEncoding` | ✔ | IANA charset. Use **`iso-8859-1`** for max scanner compatibility; `utf-8` for non-Latin QR payloads. |
| `altText` | — | Human-readable text shown under the barcode (e.g. the card number). |

> **Only 4 symbologies are supported.** QR, PDF417, Aztec, Code128. **NOT supported:** EAN-13/8, UPC-A/E, Code 39, ITF-14, Data Matrix, MaxiCode. **[VERIFIED]**
> **`PKBarcodeFormatCode128` is not supported on watchOS** — supply a QR/Aztec alternative or the Watch shows no barcode. **[VERIFIED]**
> For a loyalty card, **QR** (square, UTF-8 capable, works on Apple Watch) is the usual choice.
> Note: iOS 27 (WWDC 2026) reportedly adds EAN-13/Code 39/Codabar/ITF — **[UNVERIFIED]** against Apple's own page; don't depend on it.

## 5. Relevance / geofence / beacon keys (optional) **[VERIFIED]**

Used to surface the pass on the lock screen at the right time/place.

| Key | Type | Notes |
|---|---|---|
| `locations` | Array (max **10**) | Each: `latitude` (Number, req), `longitude` (Number, req), `altitude` (Number, optional, m), `relevantText` (String, optional, lock-screen text). Trigger radius ≈ **100 m** for store-type passes. |
| `maxDistance` | Number | Metres; overrides the default trigger radius. |
| `beacons` | Array (max **10**) | Each: `proximityUUID` (String, req), `major` (0–65535), `minor` (0–65535), `relevantText`, **`name`** (optional label). **[CORRECTED · C4]** |
| `relevantDate` | String (ISO 8601 + offset) | When the pass is most relevant, e.g. `2025-09-01T09:00:00+01:00`. |

## 6. Lifecycle / app-integration keys (optional) **[VERIFIED]**

| Key | Type | Notes |
|---|---|---|
| `expirationDate` | String (ISO 8601) | After this, the pass is greyed out / unusable. |
| `voided` | Boolean | `true` → pass shown as voided/redeemed immediately (toggle via push update). |
| `associatedStoreIdentifiers` | Array of Numbers | **App Store** numeric IDs of your companion app(s); Wallet offers to install. **[CORRECTED · C5]** (not "iTunes App Store") |
| `appLaunchURL` | String | Custom URL handed to your app when opened from the pass. Requires ≥1 `associatedStoreIdentifiers`. |
| `userInfo` | Dictionary | Arbitrary JSON passed to your companion app; never shown to the user. |

## 7. System-behaviour keys (optional) **[VERIFIED]**

| Key | Type | Notes |
|---|---|---|
| `sharingProhibited` | Boolean | `true` blocks AirDrop/Mail/Messages sharing (good for single-redemption coupons). |
| `groupingIdentifier` | String | Passes with the same `passTypeIdentifier` + `groupingIdentifier` stack together in Wallet. |
| `suppressStripShine` | Boolean | `true` removes the gloss overlay on the strip image. |
| `semantics` | Dictionary | Pass-level machine-readable metadata (Siri/Spotlight). Loyalty keys exist but the exact set is **[UNVERIFIED]** from primary docs. |
| `nfc` | Dictionary | **NFC/VAS only** — restricted to `storeCard`, requires NFC approval. See [`08`](08-constraints-nfc-ios-security.md). |

---

## 8. The `storeCard` dictionary — field regions **[VERIFIED]**

Exactly one style key per pass. For loyalty it's `storeCard`, whose value is an object with five field arrays:

| Array | Where it renders | Limit |
|---|---|---|
| `headerFields` | Top-right strip, beside the logo. **Visible even when the pass is stacked.** Defaults to right-aligned. | up to **3** (1–2 typical) — e.g. tier, points |
| `primaryFields` | Large central value, overlaid on the strip image. | **1** (the headline metric, e.g. points balance) |
| `secondaryFields` | Row of small label/value pairs below primary. | up to **4** |
| `auxiliaryFields` | Second row of small label/value pairs. | up to **4** |
| `backFields` | Scrollable back of the pass (tap the ⓘ). Supports `\n`, links, limited HTML. | unlimited |

> **Critical layout limit:** for `storeCard`/`coupon`/`generic` passes **with a square barcode (QR/Aztec)**, `secondaryFields` + `auxiliaryFields` **combined must not exceed 4** (the square barcode eats the space). **[VERIFIED]**
> Apple requires the back to include the issuing organization's contact info. **[VERIFIED·SECONDARY]**

## 9. Field dictionary (`PassFieldContent`) — every field's keys

Each entry in those arrays is a field dictionary.

**Core** **[VERIFIED]**
| Key | Req | Notes |
|---|---|---|
| `key` | ✔ | Unique id within the pass (not displayed). Used for localization + change notifications. |
| `value` | ✔ | String, Number, or ISO 8601 date string. |
| `label` | — | Small grey text above the value. |

**Change notifications** **[VERIFIED]**
| Key | Notes |
|---|---|
| `changeMessage` | Template string that **must contain `%@`** (the new value). On a push update, Wallet shows a lock-screen notification, e.g. `"Your points balance is now %@!"`. Fields without `changeMessage` update silently. |

**Alignment** **[VERIFIED]** — `textAlignment`: `PKTextAlignmentLeft`, `PKTextAlignmentCenter`, `PKTextAlignmentRight`, `PKTextAlignmentNatural`. (No "Justified". Header fields default to Right.)

**Rich back-field content** **[VERIFIED]**
| Key | Notes |
|---|---|
| `attributedValue` | Overrides `value` for display; supports a small HTML subset: `<a href>`, `<b>`, `<i>`, `<u>`, `<s>`. `value` is still used for VoiceOver. |
| `dataDetectorTypes` | Array; which back-field content auto-links. Values: `PKDataDetectorTypePhoneNumber`, `PKDataDetectorTypeLink`, `PKDataDetectorTypeAddress`, `PKDataDetectorTypeCalendarEvent`. Omit = all enabled; `[]` = none. **Back fields only.** |

**Number / currency** **[VERIFIED]** (set `value` to a Number)
| Key | Notes |
|---|---|
| `currencyCode` | ISO 4217 (e.g. `USD`, `GBP`). Formats `value` as currency in the device locale. Mutually exclusive with `numberStyle`. |
| `numberStyle` | `PKNumberStyleDecimal`, `PKNumberStylePercent`, `PKNumberStyleScientific`, `PKNumberStyleSpellOut`. |

**Date / time** **[VERIFIED]** (set `value` to an ISO 8601 date string)
| Key | Notes |
|---|---|
| `dateStyle` | `PKDateStyleNone`/`Short`/`Medium`/`Long`/`Full`. |
| `timeStyle` | Same `PKDateStyle…` enum (there is no separate `PKTimeStyle…`). |
| `ignoresTimeZone` | Boolean; show the time as written, ignoring device TZ. |
| `isRelative` | Boolean; show relative ("in 2 days"). |

**Layout** **[VERIFIED·SECONDARY]**
| Key | Notes |
|---|---|
| `row` | `0` or `1` — places a field on the first/second row within `auxiliaryFields`. Rendering nuance is lightly documented. |
| `semantics` | Per-field machine-readable meaning (loyalty keys like `loyaltyPoints`, `membershipProgramName` exist but are **[UNVERIFIED]** from primary docs — medium confidence). |

---

## 10. Worked storeCard `pass.json` (coffee-shop loyalty)

The full version is in [`data/pass.example.json`](data/pass.example.json). Replace `teamIdentifier`, `passTypeIdentifier`, and the `authenticationToken` with your real values. Skeleton:

```json
{
  "formatVersion": 1,
  "passTypeIdentifier": "pass.com.lovalte.loyalty",
  "serialNumber": "LV-LOYALTY-4892710",
  "teamIdentifier": "ABCDE12345",
  "organizationName": "Lovalte",
  "description": "Lovalte loyalty card",
  "logoText": "Lovalte",
  "backgroundColor": "rgb(44, 28, 14)",
  "foregroundColor": "rgb(255, 245, 230)",
  "labelColor": "rgb(200, 160, 100)",
  "webServiceURL": "https://passes.lovalte.com/v1/",
  "authenticationToken": "<≥16 random chars, unique per pass>",
  "barcodes": [
    { "format": "PKBarcodeFormatQR", "message": "LV:4892710", "messageEncoding": "iso-8859-1", "altText": "Member #4892710" }
  ],
  "storeCard": {
    "headerFields":    [ { "key": "tier",   "label": "TIER",   "value": "Gold" } ],
    "primaryFields":   [ { "key": "points", "label": "POINTS", "value": 2350, "numberStyle": "PKNumberStyleDecimal", "changeMessage": "Your balance is now %@!" } ],
    "secondaryFields": [ { "key": "member", "label": "MEMBER", "value": "Jane Smith" } ],
    "auxiliaryFields": [ { "key": "next",   "label": "NEXT REWARD AT", "value": 2500, "numberStyle": "PKNumberStyleDecimal" } ],
    "backFields":      [ { "key": "terms",  "label": "Terms", "value": "Points expire after 12 months." } ]
  }
}
```
