# 08 — Constraints, NFC/VAS, iOS Versions & Security

## A. NFC / Value Added Services (VAS) — and why you don't need it for v1

**VAS** is Apple Pay's proprietary NFC protocol that lets a device transmit encrypted pass data to a VAS-certified contactless terminal in **one tap** — "tap at the register to check in" instead of showing a barcode. **[VERIFIED — Apple loyalty-passes page]**

It is **entirely separate from, and does not replace, the barcode/QR path.** A barcode/QR `storeCard` uses none of it. **[VERIFIED]**

### What NFC requires (the gate) **[VERIFIED]**
- A **special NFC Pass Type ID certificate**, obtainable **only after Apple explicitly approves** your application (via `developer.apple.com/contact/passkit/`, which needs a developer login).
- **VAS-certified terminal hardware** that already accepts Apple Pay.
- **POS software** updated to handle the new "VAS Only" / "Payment and VAS" modes.
- Approval timeline is third-party-estimated at 2–4 weeks (sources conflict; Apple states none). **[UNVERIFIED]**

### What barcode/QR loyalty requires
- **Nothing special** — just the standard Pass Type ID certificate you can already create, and a signed pass. No NFC entitlement, no Apple approval beyond normal membership. **[VERIFIED]**

### The `nfc` dictionary (for when you do add NFC later) **[VERIFIED·SECONDARY]**
Top-level `nfc` (storeCard only), 3 fields:
- `message` (String, ≤ **64 bytes**) — the transmitted payload (membership id/token).
- `encryptionPublicKey` (String) — Base64 X.509 SubjectPublicKeyInfo holding an **ECDH P-256 (secp256r1)** public key (strip PEM header/footer + newlines).
- `requiresAuthentication` (Boolean) — require Face ID/Touch ID/passcode before transmitting.

Crypto detail: VAS uses **ECDH P-256** key agreement (Apple Security Guide, verbatim). The cipher **AES-GCM** is from community reverse-engineering (kormax/apple-vas), **not** Apple's published text. VAS AID = `4f53452e5641532e3031` ("OSE.VAS.01"), 4 operation modes. **[CORRECTED · C11 / VERIFIED·SECONDARY]**

> **Decision for Lovalte:** ship barcode/QR `storeCard` for v1. Treat NFC tap-to-use as a later phase requiring an Apple NFC-certificate application and VAS-certified terminals.

## B. iOS version landscape (current = iOS 26, next = iOS 27)

Apple switched to **year-based versioning at WWDC 2025**: iOS 18 → **iOS 26** (skipping 19–25), next **iOS 27**. The `.pkpass` / `storeCard` format is **stable across iOS 18 → 26** — older Apple docs remain valid. **`storeCard` is not deprecated.** **[VERIFIED]**

Wallet changes by version (verbatim from `developer.apple.com/wallet/whats-new/`): **[VERIFIED]**

| Version | Relevant change |
|---|---|
| **iOS 18** | **Poster event tickets** (multiple events nested in one ticket). These new layouts **require NFC approval** — not relevant to barcode loyalty. |
| **iOS 26** | **Add to Wallet API** — integrate event/movie tickets, **loyalty cards**, car rental, insurance into Wallet. Plus **order tracking** (Apple Intelligence parses order emails) — a Wallet UI feature, not a pass-format change. |
| **iOS 27** (WWDC 2026) | **Poster Generic pass template** for **loyalty/rewards/membership/gift cards**; **Featured Actions** (interactive tiles → universal links on the pass face); **Pass Designer** (macOS 27 app); **Pass Builder** (Swift-on-Server package). |

Third-party-only (treat as leads): iOS 27 may add EAN-13/Code 39/Codabar/ITF barcode formats; poster tickets need NFC. **[UNVERIFIED against Apple]**

### Implication for Lovalte
- Build the **baseline `storeCard` `.pkpass`** now — works on every iOS version including 26/27.
- Watch **iOS 27 Poster Generic + Featured Actions** as a near-term UX upgrade for loyalty cards (richer card face, action buttons). Re-research at implementation time; the API surface is new.
- **Apple Business Connect**: no confirmed direct link to loyalty pass issuance for third parties; the **Add to Wallet API (iOS 26)** is the closest Apple-provided loyalty infrastructure. **[VERIFIED — medium]**

## C. APNs constraints / cadence **[VERIFIED]**
- No published numeric rate limit; Apple's guidance is behavioral: **push only on real change, only to registered devices.**
- Pushes **coalesce**; delivery is **best-effort**; payload is empty by design (no data lost on coalesce).
- Remove a device + its registrations when APNs reports its token invalid.
- 3rd-party estimate ≈ 2–3 silent pushes/hour/device — **[UNVERIFIED]**; just push once per change and you'll never hit it.

## D. Security — the signing key and the auth token

### Pass Type ID signing key **[VERIFIED / VERIFIED·SECONDARY]**
- **Sign server-side only.** Apple: signing should not be done inside the client app. **[VERIFIED]**
- The private key can sign **any** pass for your brand — it is your most sensitive asset.
- **Never commit** the `.p12`/PEM or its passphrase to the repo. Store in a **secrets manager / KMS / HSM** (AWS Secrets Manager, HashiCorp Vault, Azure Key Vault). Load at runtime via the `ICertificateStore` port ([`07`](07-backend-ddd-architecture.md)).
- **Dual role:** the same Pass Type ID cert+key **signs passes AND authenticates cert-based APNs pushes**. (You can instead use a `.p8` JWT for the APNs leg — but signing always needs the `.p12`.) **[VERIFIED]**
- **Expiry ≈ 1 year. Cannot be renewed — only replaced** with a new cert under the same Pass Type ID. After expiry you cannot sign new passes or push updates. **Rotate ahead of expiry.** Apple's 7-day-warning-email claim is **[UNVERIFIED]** — don't rely on it; track expiry yourself. **[VERIFIED·SECONDARY]**
- `.p12` is passphrase-protected (PKCS#12: private key + cert in one encrypted container) — keep the passphrase in the same secret store, never hard-coded.

### `authenticationToken` **[VERIFIED / VERIFIED·SECONDARY]**
- A **per-pass bearer secret** baked into `pass.json`; the device sends it as `Authorization: ApplePass <token>` on web-service calls. It proves the request comes from the legit pass holder.
- **≥16 chars** (3rd-party-sourced minimum; use **≥32 cryptographically-random** chars). **[VERIFIED·SECONDARY · C12]**
- **Must be unique per pass** and **must NOT change on update** — Apple verbatim: if you changed it, devices still holding the old pass would fail auth and you'd have to validate against every token ever issued. **[VERIFIED]**
- Treat as a credential: random, per-pass, stored server-side, **never logged**.

### General
- `webServiceURL` **must be HTTPS** (HTTP rejected). **[VERIFIED]**
- Validate `authenticationToken` on register/unregister/get-latest-pass before doing work. **[VERIFIED]**
- Don't put secrets in `userInfo` (it ships inside the pass, readable by anyone who has the file).

## Quick "do I need Apple's approval?" matrix

| Capability | Standard Pass Type ID cert | Special NFC cert + Apple approval |
|---|---|---|
| Barcode/QR loyalty `storeCard` | ✔ | — |
| Push updates (points/tier) via web service + APNs | ✔ | — |
| Geofence / beacon relevance | ✔ | — |
| NFC tap-to-use at POS (VAS) | — | ✔ |
| iOS 18 poster event-ticket layouts | — | ✔ |
