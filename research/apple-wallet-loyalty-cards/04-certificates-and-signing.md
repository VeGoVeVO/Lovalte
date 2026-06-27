# 04 — Certificates & Signing

You already have an Apple Developer membership, so you can create everything below. **Required role: Account Holder or Admin.** **[VERIFIED]**

## Apple's 5-step "Building a Pass" framing **[VERIFIED]**

1. Create the source files (`pass.json` + images).
2. Create a **pass type identifier**.
3. Generate a **signing certificate**.
4. Create a **digital signature** for the pass.
5. Create the **signed bundle** (`.pkpass`).

(Step 5 expands into: build `manifest.json` → PKCS#7 detached sign → zip → rename to `.pkpass`.)

## Part A — One-time Apple Developer setup

### A1. Register a Pass Type ID **[VERIFIED]**
Apple Developer → **Certificates, Identifiers & Profiles** → **Identifiers** → **+** → select **Pass Type IDs** → enter a description + the identifier (reverse-DNS, conventionally starting with `pass.`, e.g. `pass.com.lovalte.loyalty`) → **Register**.

### A2. Create the Pass Type ID Certificate **[VERIFIED]**
1. **Generate a CSR.** On macOS: **Keychain Access → Certificate Assistant → Request a Certificate from a Certificate Authority** → save a `.certSigningRequest`. (Apple's documented method. OpenSSL works too — see A4.)
2. In the portal, create a certificate for your Pass Type ID, **upload the `.certSigningRequest`**, then **download** the issued `.cer`.
3. Import the `.cer` into Keychain (it pairs with the private key from the CSR), then **export both as a `.p12`** (PKCS#12, passphrase-protected) for server use.

### A3. Get the Apple WWDR intermediate certificate **[VERIFIED]**
Download **WWDR — must be the G4 generation** (for certs issued after 2022-01-27) from <https://www.apple.com/certificateauthority/>. Convert to PEM. **[CORRECTED · C10]**

> **G4 is mandatory.** G2/G3/G5/G6 cause signature validation failure; G1 expired 2023-02-07. `passkit-generator` documents this explicitly.

### A4. OpenSSL alternative (no macOS Keychain) **[VERIFIED·SECONDARY]**
```bash
# 1. Private key
openssl genrsa -out lovalte.key 2048

# 2. CSR (upload the .csr to Apple, download pass.cer)
openssl req -new -key lovalte.key -out lovalte.csr -subj "/emailAddress=you@lovalte.com/CN=Lovalte Pass/O=Lovalte/C=US"

# 3. Convert Apple's DER .cer → PEM (signer certificate)
openssl x509 -inform der -in pass.cer -out signerCert.pem

# 4. WWDR G4 → PEM
openssl x509 -inform der -in AppleWWDRCAG4.cer -out wwdr.pem

# 5. (private key already PEM as lovalte.key; rename to signerKey.pem)
cp lovalte.key signerKey.pem
```
Result: three PEM inputs your signing library needs — `signerCert.pem`, `signerKey.pem`, `wwdr.pem` (+ optional key passphrase).

## Part B — The signing process (per pass)

> In production you do **not** do this by hand — `passkit-generator` performs B2–B6 internally; you just supply the three PEMs. The manual flow is documented so you understand what the library does and can debug failures.

1. **Assemble** `pass.json` + all images in memory. **[VERIFIED]**
2. **Hash** each file (except `manifest.json` and `signature`) with **SHA-1**; build `manifest.json` mapping `"<relative path>": "<hex SHA-1>"`. **[VERIFIED]**
3. **Sign** `manifest.json` as a **PKCS#7 detached signature** using the Pass Type ID private key + signer cert, **including the WWDR G4 cert** in the signature. **[VERIFIED]**
4. Write the signature to a file literally named **`signature`** (no extension). **[VERIFIED]**
5. **Zip the package CONTENTS** (the files, not the enclosing folder): `pass.json`, `manifest.json`, `signature`, images, `*.lproj/*`. **[VERIFIED]**
6. Rename the archive's extension from `.zip` to **`.pkpass`**. **[VERIFIED]**

Manual OpenSSL signing of the manifest (what step 3 looks like):
```bash
openssl smime -binary -sign \
  -certfile wwdr.pem \
  -signer signerCert.pem \
  -inkey signerKey.pem \
  -in manifest.json \
  -out signature \
  -outform DER
```

### Common signing failures **[VERIFIED]**
- `passTypeIdentifier` / `teamIdentifier` in `pass.json` **don't match the certificate** → rejected.
- **WWDR omitted** from the signature, or wrong generation (not G4) → rejected.
- Zipped the **folder** instead of its **contents** → rejected.
- Missing `icon.png` → validation failure.

## Part C — Key security (summary; full detail in [`08`](08-constraints-nfc-ios-security.md))

- **Sign on the server, never in the browser/app.** Apple: pass signing should not happen inside the client app. **[VERIFIED]**
- The Pass Type ID private key signs arbitrary passes for your brand — treat it as a top secret. **Never commit `.p12`/`.pem`/passphrase to the repo.** Store in a secrets manager / KMS / HSM. **[VERIFIED·SECONDARY]**
- The **same cert + key also authenticates your APNs pushes** for this pass type (if using cert-based APNs auth). **[VERIFIED]**
- Pass Type ID certs **expire ≈ 1 year** and **cannot be renewed — only replaced** with a new cert under the same Pass Type ID. Rotate before expiry or you can't sign new passes or push updates. **[VERIFIED·SECONDARY]**
