# 05 — Distribution: Getting the Pass into Wallet

## Apple's three defined distribution methods **[VERIFIED]**

Apple's "Distributing and updating a pass" doc lists exactly three:

1. **From an app or App Clip** — show a `PKAddPassButton`; on tap, present a `PKAddPassesViewController`.
2. **Web page download** — show an "Add to Apple Wallet" button; the download is a `.pkpass` served with the right MIME type.
3. **Email attachment** — attach the `.pkpass` (correct MIME type).

(Messages/AirDrop work as informal sharing but aren't enumerated as "defined methods.")

**For Lovalte (React web/app, no native iOS app required for v1): method 2 — the web download — is the primary path.**

## The MIME type (get this exactly right) **[VERIFIED]**

Serve every `.pkpass` as:

```
Content-Type: application/vnd.apple.pkpass
```

- Mail and Safari **expect** this type to recognize and import the pass. Apple verbatim: *"Mail and Safari expect passes to use the `application/vnd.apple.pkpass` MIME type."*
- It is **dot-separated**: `application/vnd.apple.pkpass`. The hyphen form `application/vnd-apple.pkpass` (seen in one blog) **breaks iOS**. **[CORRECTED · C9]**
- A **bundle of multiple passes** uses `application/vnd.apple.pkpasses` (plural). **[VERIFIED·SECONDARY]**

## The "Add to Apple Wallet" button **[VERIFIED]**

- **You must use Apple's official badge artwork.** Apple verbatim: *"Be sure to use the badges provided by Apple. Do not create your own versions."* Get them from the Add to Apple Wallet guidelines / Apple Design Resources.
- The badge is localized; use the size/locale Apple provides.
- On the **web**, it's an `<a>`/`<img>` linking to your pass-download endpoint. On **iOS apps**, use the native `PKAddPassButton` (one-line or two-line style; the system renders correct appearance + language). **[VERIFIED]**

### Web flow (Lovalte's path)
```
React "Add to Apple Wallet" badge  →  GET https://api.lovalte.com/wallet/passes/issue?member=…
                                       (backend builds + signs the .pkpass for this member)
                                    →  200, Content-Type: application/vnd.apple.pkpass, body = signed bytes
On iOS Safari: the pass preview sheet appears → user taps "Add" → installed in Wallet.
```
Notes:
- **Works on iOS Safari** out of the box. On **desktop/Android**, the file downloads but there's no Wallet to receive it — gate/badge accordingly (e.g. also offer a Google Wallet path or a QR-to-open-on-iPhone). Detect iOS to show/hide.
- Set `Content-Disposition: attachment; filename="lovalte.pkpass"` so non-Safari browsers save it sensibly.

## In-app distribution (only if you ship a native iOS app later) **[VERIFIED]**

```swift
import PassKit

// 1. Capability check
if PKAddPassesViewController.canAddPasses() {
    // 2. Build a PKPass from the signed .pkpass data
    let pass = try PKPass(data: pkpassData)
    // 3. Present
    let vc = PKAddPassesViewController(pass: pass)
    present(vc, animated: true)
}
```
- `PKAddPassButton` — the official add button (PassKit). **[VERIFIED]**
- `PKAddPassesViewController` — shows the pass and prompts to add it. Inherits `UIViewController`; available iOS/iPadOS 6.0+, Mac Catalyst 13.1+, visionOS 1.0+; **not deprecated**. **[VERIFIED]**
- To add a pass in-app your app needs the appropriate Wallet entitlement. **[VERIFIED]**

## Email distribution **[VERIFIED]**
Attach the `.pkpass` with `Content-Type: application/vnd.apple.pkpass`. Apple Mail renders an "Add" affordance. Configure your ESP to send the correct MIME type (some strip/rename unknown attachments).

## The iOS 26 "Add to Wallet API" (newer, optional) **[VERIFIED]**

iOS 26 (2025) introduced an **Add to Wallet API**. Apple verbatim (whats-new): *"Integrate event tickets, movie tickets, loyalty cards, car rental passes, and insurance cards into Apple Wallet. The Add to Wallet API lets you offer customers the option to automatically add their tickets and passes to Apple Wallet."*

- This is an Apple-provided integration that can streamline issuance/distribution of loyalty passes from web and app.
- **It does not replace the `.pkpass` approach** — the signed `storeCard` pass remains the universally-supported baseline that works on every iOS version. Consider the Add to Wallet API as an enhancement once the baseline works.
- iOS 27 adds a richer **Poster Generic** template + **Featured Actions** for loyalty cards — see [`08`](08-constraints-nfc-ios-security.md).

## Recommendation for Lovalte v1
1. Build + sign the `storeCard` `.pkpass` server-side.
2. Serve it from a download endpoint as `application/vnd.apple.pkpass` behind Apple's official "Add to Apple Wallet" badge in the React app (show only on iOS).
3. Optionally email the pass.
4. Defer native-app `PKAddPassButton` and the iOS 26 Add to Wallet API until after the baseline ships.
