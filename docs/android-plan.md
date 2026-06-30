# Lovalte — Android App Plan (Google Play, iOS later)

Decision-grade plan from the grill-me interview. Source of truth for the Android build.

## Context

- **Product:** multi-tenant SaaS; loyalty cards delivered to device wallets. Today: Apple Wallet only (`passkit-generator` + APNs).
- **Stack:** `apps/web` = React 18 + Vite 5 SPA (merchant dashboard + POS QR scanner, HMAC cookie session). `apps/api` = Fastify + Postgres + Redis/BullMQ, DDD layout (`domain` / `application` / `infrastructure` / `presentation`).
- **Goal:** ship a Google-Play Android app now; an iOS app later from the same codebase.

## Locked decisions

| # | Decision | Choice |
|---|---|---|
| 1 | App audience | **Merchant/staff** app — dashboard + POS scanner. End-customers get passes via web link, no app. |
| 2 | Packaging | **Capacitor**, one codebase, wallet UI platform-gated. |
| 3 | Auth | **Bearer token** in app, **cookie** for web; `requireAuth` accepts either. Token = existing HMAC `signSession` string (no new token system). |
| 4 | Google Wallet | **In v1** — single coherent launch. |
| 5 | Public web enroll | **Device-detect**: Android→Google Wallet, iPhone→Apple Wallet (existing, kept). Merchant app build = Google only. |
| 6 | Account deletion | **Full cascade hard-delete** (auth account + members + ledger), in-app + web URL. |
| 7 | iOS | Same Capacitor codebase, separate bundle id + store listing, ships later. |
| 8 | Scanner | Native `@capacitor-mlkit/barcode-scanning`; scan-hook logic above capture unchanged. |
| 9 | Privacy policy | Self-host `/privacy` (+ `/terms`) route in `apps/web`. |

## Defaults (override if wrong)

- Android project at `apps/web/android/` (Capacitor default), committed to repo.
- CORS: static comma-separated env list → `capacitor://localhost, https://localhost, https://lovalte.com`.
- Target **API 35**, minSdk 23; bundle id `com.lovalte.app`.
- Web API base via `VITE_API_BASE_URL` (empty for web = relative + dev proxy; prod URL baked into the app build).
- Google Wallet object updates = REST `PATCH` on the LoyaltyObject (no APNs analog; Google propagates).
- New Google Wallet code = DDD adapter mirroring the passkit path → **Mandate 1** (`v3-ddd-architecture`). All UI → **Mandate 2** (`frontend-pipeline`).

## Operational prereqs (you action — lead time, not code)

- [ ] **Google Wallet API issuer account** (Google Cloud project + Wallet API enablement + issuer approval) — the long pole; start first.
- [ ] **Service account key** (JSON) for signing "Save to Google Wallet" JWTs.
- [ ] **Google Play Console** account ($25 one-time).
- [ ] **Upload/signing key** + enroll in Play App Signing.
- [ ] Listing assets: 512px icon, feature graphic, ≥2 screenshots, short/full description.

## Build sequence

### P0 — Prereqs (parallel, you)
The list above. P2 blocks on issuer approval; everything else proceeds without it.

### P1 — API readiness for the app  *(backend; no issuer dep)*
Make the API reachable + authenticatable from a cross-origin WebView, and add the deletion endpoints.

1. **Configurable web API base URL** — `apps/web/src/lib/api.ts`: prepend `import.meta.env.VITE_API_BASE_URL ?? ""` in `req()`; when a stored bearer token exists, attach `Authorization: Bearer`. Web unchanged (env empty, no token).
2. **Bearer auth (dual-accept)** — `apps/api/src/http/auth.ts`: `readAuth` also reads `Authorization: Bearer <token>` via `verifySession` (cookie still wins for web). Return `token: signSession(...)` in the JSON of `login` / `signup` / `accept-invitation` (`apps/api/src/contexts/identity/presentation/routes.ts`) so the app can store it. No new token format.
3. **CORS allowlist** — `apps/api/src/config/env.ts`: add `CORS_ALLOWED_ORIGINS` (comma list, defaults to `APP_BASE_URL`). `apps/api/src/http/app.ts:37`: pass the parsed array to `@fastify/cors` (keep `credentials: true`).
4. **Account deletion (cascade hard-delete)** — DDD. `DELETE /api/v1/auth/account` (owner only) → purge tenant: users, members, ledger/redemption rows, templates, images, wallet registrations. Drop append-only enforcement for this privileged path. Handler + repository cascade + tests. In-app + web settings UI added in P3.

**Gate:** `npm run typecheck && npm test` green; new deletion handler unit-tested; manual: bearer token in `Authorization` authenticates `GET /auth/me`.

### P2 — Google Wallet backend  *(blocks on P0 issuer approval)*
New DDD adapter parallel to the Apple passkit path, reusing the existing card-design → pass mapping.

- Google Wallet REST client (service-account auth) in `infrastructure`.
- `LoyaltyClass` (per card template) + `LoyaltyObject` (per member) creation.
- Signed **"Save to Google Wallet" JWT** save-link issuance.
- Balance/points change → `PATCH` LoyaltyObject (mirror where APNs updates fire today).
- Env: `GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_WALLET_SA_KEY_PATH` (optional, like the Apple `*_PATH` vars).

**Gate:** typecheck + tests; a test member yields a working save-link in a real Google account; a points change updates the saved object.

### P3 — Web changes  *(frontend-pipeline)*
- **Device-detect wallet** on public `EnrollPage` (+ `IssuePassPage`): Android UA → "Save to Google Wallet"; iPhone → existing "Add to Apple Wallet" (untouched).
- **`/privacy` + `/terms`** static routes (cover email, display name, camera, pass/device tokens, loyalty history, hard-delete path).
- **In-app account-deletion UI** in account settings → confirm → `DELETE /api/v1/auth/account`.

**Gate:** frontend-pipeline review/gate; iPhone enroll still produces an Apple pass (no regression); Android enroll produces a Google save-link.

### P4 — Capacitor shell
- `npx cap init`, `npx cap add android`; `webDir: dist`; production API base baked into the build.
- Swap scanner capture to `@capacitor-mlkit/barcode-scanning` (logic above capture untouched).
- **Platform-gate** merchant wallet UI to Google-only (Android build).
- Camera permission strings (Android manifest; iOS `NSCameraUsageDescription` for P6).

**Gate:** AAB installs on a device; login (bearer) works against prod API; POS scan decodes; no Apple Wallet UI visible in the Android build.

### P5 — Compliance + submission
- AAB build @ target API 35; enroll in Play App Signing.
- Data Safety form (email, display name, pass serials, device tokens, loyalty history).
- IARC content rating; Camera Permission Declaration (QR POS use-case); privacy-policy URL in listing.
- Internal testing track → closed → production.

**Gate:** Play pre-launch report clean; internal-test install authenticates + scans + saves a Google pass end-to-end.

### P6 — iOS (later)
`npx cap add ios`; `NSCameraUsageDescription`; platform-gate → Apple Wallet; 1024px icon + Privacy Nutrition Labels; same deletion + privacy URL satisfy App Store.

## Risks

- **Google issuer approval lead time** gates P2 — start P0 immediately.
- **CORS + credentials:true** requires exact origins (no wildcard) once the app origin is added.
- **Hard-delete** is irreversible and drops the append-only invariant on that path — confirm before each destructive run; gate behind owner role + explicit confirmation.
- **Capacitor `server.url` vs bundled assets** — bake the prod API base at build; don't point the WebView at a remote URL for the app shell itself.

---

## Build & install on your Android phone (sideload — no Play Store)

The Capacitor Android project is scaffolded at `apps/web/android/` (appId `com.lovalte.app`), the bundle's API base is baked to `https://lovalte.com` (vite mode `app`), and CAMERA permission is declared. What's left is building the APK on a machine with the Android toolchain and installing it.

### Prereq A — server (one-time): the app calls the deployed API cross-origin
The packaged WebView origin is `https://localhost`, so the API must (1) have the P1 changes (bearer auth + CORS allowlist) deployed and (2) allow that origin. On the server:
- Deploy this branch (push to `main` → CI auto-deploys; do **not** also run a manual deploy).
- Set env `CORS_ALLOWED_ORIGINS=https://lovalte.com,https://localhost,capacitor://localhost` and restart the API.

Without this, the app loads but **login fails** (cookies don't cross origins; the bearer token needs the deployed P1 code).

### Prereq B — your build machine: JDK 21 + Android SDK
Easiest: install **Android Studio** (bundles JDK, SDK, `adb`). This worktree machine has none of these, so build on a machine that does.

### Build — Option 1 (Android Studio, easiest)
```bash
cd apps/web
npm run sync:android        # build:app + cap sync (rebuild the bundle into android/)
npx cap open android        # opens the project in Android Studio
```
Enable **USB debugging** on the phone (Settings → Developer options), plug it in, press **Run ▶**. The app installs and launches.

### Build — Option 2 (command line APK)
```bash
cd apps/web
npm run sync:android
cd android
./gradlew assembleDebug          # Windows: .\gradlew.bat assembleDebug
# → app/build/outputs/apk/debug/app-debug.apk
```
Install: `adb install -r app/build/outputs/apk/debug/app-debug.apk`
…or copy that `.apk` to the phone and tap it (enable "install unknown apps" for your file manager).

On first scan the app prompts for camera permission — allow it. The QR scanner uses the existing web camera path, which works in the Capacitor WebView once granted.

### LAN alternative (no deploy)
To test against the API on your PC instead of the deployed one: set `APP_API_BASE` in `apps/web/vite.config.ts` to `http://<your-pc-lan-ip>:3001`, run the API locally with `CORS_ALLOWED_ORIGINS` including `https://localhost`, and allow cleartext HTTP in the Android build (add `android:usesCleartextTraffic="true"` to the `<application>` in `AndroidManifest.xml`). Phone + PC must share Wi-Fi. Rebuild with `npm run sync:android`.

### Deferred (intentionally NOT done for a sideload test)
- Play App Signing / AAB / Data Safety / content rating — only needed to publish.
- ML Kit native scanner — swap in only if the WebView camera is flaky on your device.
- Apple-Wallet-hide gate + Google Wallet backend — gate is cosmetic; Google Wallet needs the issuer account (P0) before it can show anything.
