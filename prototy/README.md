# Lovalte — Apple Wallet loyalty-card prototype

A minimal, working **storeCard `.pkpass`** generator. Goal: prove you can build a loyalty card and add it to **your iPhone's Wallet** — no design, no backend, no React yet. Just the smallest signable pass.

> This is a **prototype**. The pass is **static** (points don't update remotely — that needs the backend, see `../research/apple-wallet-loyalty-cards/`). Placeholder solid-color images. Real branding/design comes later.

---

## ⚠️ The one hard requirement: a PAID Apple Developer membership

A `.pkpass` **must be cryptographically signed with a certificate you create in your Apple Developer account.** There is no way around this — Apple Wallet rejects unsigned passes.

- You need the **Apple Developer Program** membership (**$99/year**). A free Apple ID **cannot** create the certificate.
- **Check:** go to <https://developer.apple.com/account>. If you see **"Certificates, Identifiers & Profiles"** in the sidebar, you're in. If it asks you to enroll/pay, you don't have it yet — enroll first (takes ~1–2 days for Apple to approve).

Everything below assumes you have that membership. No Mac is required — all steps work on Windows.

---

## What you'll do (overview)

```
1. Create a Pass Type ID          (Apple portal, 2 min)
2. Make a private key + CSR        (Git Bash / OpenSSL, 1 min)
3. Create + download the cert      (Apple portal → pass.cer → convert to PEM)
4. Download Apple's WWDR G4 cert   (1 file → convert to PEM)
5. Put 3 .pem files in ./certs + edit pass.json (Team ID + Pass Type ID)
6. npm install && npm run generate → lovalte.pkpass
7. Email it to yourself → open on iPhone → Add to Wallet
```

## Prerequisites on your PC

- **Node.js 18+** — check: `node -v`
- **OpenSSL** — comes with **Git for Windows**. Open **Git Bash** and check: `openssl version`. (If missing, install Git for Windows.)

Run the OpenSSL commands below in **Git Bash**, from inside this `prototy/certs/` folder.

---

## Step 1 — Create a Pass Type ID

1. <https://developer.apple.com/account> → **Certificates, Identifiers & Profiles** → **Identifiers**.
2. Click **+** (Register a new identifier) → choose **Pass Type IDs** → **Continue**.
3. **Description:** `Lovalte Loyalty`  ·  **Identifier:** `pass.com.yourname.lovalte` (reverse-domain, must start with `pass.`).
4. **Register**. Write down that identifier — you'll paste it into `pass.json`.

## Step 2 — Make your private key + a signing request (CSR)

In **Git Bash**, inside `prototy/certs/`:

```bash
cd "/c/Users/USER/Documents/augment-projects/Lovalte/prototy/certs"

# private key (no passphrase — keeps the prototype simple)
openssl genrsa -out signerKey.pem 2048

# certificate signing request to upload to Apple
# Just press Enter through EVERY prompt — Apple ignores these fields.
openssl req -new -key signerKey.pem -out request.csr
```

> Git Bash tip: don't add `-subj "/CN=…"` here — Git Bash mangles a leading `/` into a Windows path and the command fails. Either answer the prompts interactively (above), or if you insist on `-subj`, prefix it: `MSYS_NO_PATHCONV=1 openssl req …`.

You now have `signerKey.pem` (keep secret) and `request.csr` (upload next).

## Step 3 — Create the Pass Type ID certificate

1. Portal → **Certificates** → **+**.
2. Under **Services**, pick **Pass Type ID Certificate** → **Continue**.
3. Select your Pass Type ID (`pass.com.yourname.lovalte`) → **Continue**.
4. **Upload** `request.csr` → **Continue** → **Download**. You get **`pass.cer`** — move it into `prototy/certs/`.
5. Convert it to PEM (Git Bash):

```bash
openssl x509 -inform der -in pass.cer -out signerCert.pem
```

## Step 4 — Download Apple's WWDR G4 certificate

1. Download: <https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer> → save into `prototy/certs/`.
2. Convert to PEM:

```bash
openssl x509 -inform der -in AppleWWDRCAG4.cer -out wwdr.pem
```

> Must be **G4** specifically. Other generations (G2/G3/G5/G6) make signing fail.

After steps 2–4, `prototy/certs/` contains: **`signerKey.pem`, `signerCert.pem`, `wwdr.pem`** (the three the generator reads), plus the intermediate files.

## Step 5 — Set your Team ID + Pass Type ID

1. **Team ID:** Portal → top-right → **Membership** (or Account → Membership details) → copy the **10-character Team ID** (e.g. `ABCDE12345`).
2. Open `prototy/pass.json` and replace:
   - `"passTypeIdentifier": "pass.com.REPLACE.lovalte"` → your Pass Type ID from Step 1
   - `"teamIdentifier": "REPLACE_TEAM_ID"` → your 10-char Team ID

These **must match the certificate**, or Wallet says "cannot be installed."

## Step 6 — Generate the pass

```bash
cd "/c/Users/USER/Documents/augment-projects/Lovalte/prototy"
npm install
npm run generate
```

Success prints `OK — wrote …/lovalte.pkpass`. (The script refuses to run if a cert is missing or `pass.json` still has `REPLACE` — that's expected.)

## Step 7 — Add it to your iPhone's Wallet

You can't AirDrop from Windows, so **email is easiest**:

1. **Email `lovalte.pkpass` to yourself** as an attachment.
2. On your iPhone, open **Mail** → open the email → tap the **`lovalte.pkpass`** attachment.
3. It shows a card preview with an **Add to Apple Wallet** button → tap **Add** (top-right).
4. Open the **Wallet** app — your Lovalte card is there. 🎉

**Other ways to get it onto the phone:**
- **iCloud Drive / OneDrive:** drop `lovalte.pkpass` in the cloud folder → on iPhone open the **Files** app → tap the file → **Add to Wallet**.
- **Web:** host it on any server that serves it with header `Content-Type: application/vnd.apple.pkpass`, then open the URL in **Safari on the iPhone**.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "This pass cannot be installed" / invalid | `passTypeIdentifier` or `teamIdentifier` in `pass.json` doesn't match the cert. Re-check Step 5. |
| Signing error mentioning WWDR / certificate chain | You used the wrong WWDR — it must be **G4** (Step 4). |
| Can't create the certificate (greyed out / asks to enroll) | You don't have a **paid** membership yet. |
| `npm run generate` says cert missing | The three `.pem` files aren't in `./certs`. Redo Steps 2–4. |
| Mail strips/renames the attachment | Use the **iCloud Drive / OneDrive → Files app** route instead. |
| Key has a passphrase | Set it before generating: `PASS_KEY_PASSPHRASE=yourpass npm run generate` (the `genrsa` above made a passphrase-free key, so normally not needed). |

## What's next (not in this prototype)

- Real images + brand colors (design phase).
- Dynamic points/tier updates → add `webServiceURL` + `authenticationToken` to `pass.json` and build the PassKit web service + APNs push. Full spec: `../research/apple-wallet-loyalty-cards/06-web-service-and-apns.md`.
- The React + PostgreSQL + DDD backend: `../research/apple-wallet-loyalty-cards/07-backend-ddd-architecture.md`.

## Files

```
prototy/
  README.md        ← this guide
  package.json     ← deps (passkit-generator) + scripts
  pass.json        ← the card template (edit Team ID + Pass Type ID)
  generate.js      ← builds + signs lovalte.pkpass
  lib/png.js       ← tiny zlib PNG generator (placeholder images, no binaries committed)
  certs/           ← you put signerKey.pem, signerCert.pem, wwdr.pem here (gitignored)
```
