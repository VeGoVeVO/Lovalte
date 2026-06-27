# 06 — PassKit Web Service & APNs Updates

This is how a points/tier change on your server propagates to the card already in a user's Wallet. The pass must contain `webServiceURL` + `authenticationToken`. Your server implements **5 REST endpoints**; you trigger updates with an **empty-payload APNs push**.

Primary sources: archived `PassKit_WebService/WebService.html`, `PassKit_PG/Updating.html`, `CommunicatingwithAPNs.html`; corroborated by Swagger mirrors (tinovyatkin/ckrack) and multiple implementations.

## How updates work (lifecycle) **[VERIFIED]**

```
register → (later) you change a pass → APNs empty push → device pulls updated serials → device pulls each pass
```

- A pass is updated by serving a **new version with the same `passTypeIdentifier` + `serialNumber`**. Any field may change **except the serial number and authentication token**. **[VERIFIED]**
- The push carries an **empty `{}` payload** — it just signals "something for this pass type changed." Apple intentionally puts no data in it because pushes are best-effort and **coalesced**. **[VERIFIED]**

## Base URL & auth

- All endpoints live under **`{webServiceURL}/v1/…`**. The version token is the literal string **`v1`**. `webServiceURL` **must be HTTPS** and **should end with `/`**. **[VERIFIED / C15]**
- Auth header (where required): **`Authorization: ApplePass {authenticationToken}`** — the literal word `ApplePass`, a space, then the pass's token. **[VERIFIED]**
- **Path parameter is `deviceLibraryIdentifier`** (Apple's opaque per-device id), **not** the APNs push token and **not** "deviceID". **[CORRECTED · C3]**

## The 5 endpoints

### 1. Register a device for a pass **[VERIFIED]**
```
POST {webServiceURL}v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}/{serialNumber}
Headers:  Authorization: ApplePass {authenticationToken}
          Content-Type: application/json
Body:     { "pushToken": "<APNs device push token>" }
Responses:
  201 Created       → new registration
  200 OK            → already registered (no-op)
  401 Unauthorized  → bad authenticationToken
Body: empty
```

### 2. Get serial numbers of updated passes for a device **[VERIFIED]**
```
GET {webServiceURL}v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}?passesUpdatedSince={tag}
Headers:  (none required per spec — sending Authorization doesn't hurt)
Responses:
  200 OK         → body: { "serialNumbers": ["...","..."], "lastUpdated": "<opaque tag>" }
  204 No Content → nothing changed since {tag}; empty body
  401            → (if you choose to enforce auth)
```
- `passesUpdatedSince` is optional; omit on first call to get all registered serials.
- `lastUpdated` is **your opaque tag** (a Unix-epoch string like `"1351981923"` or ISO 8601). The device echoes it back as `passesUpdatedSince` next time. Must be monotonically increasing. **[VERIFIED]**

### 3. Get the latest version of a pass **[VERIFIED]**
```
GET {webServiceURL}v1/passes/{passTypeIdentifier}/{serialNumber}
Headers:  Authorization: ApplePass {authenticationToken}
          If-Modified-Since: {HTTP-date}        ← optional, sent by device on later fetches
Responses:
  200 OK            → body = signed .pkpass; headers:
                        Content-Type: application/vnd.apple.pkpass
                        Last-Modified: {HTTP-date}      ← device sends this back via If-Modified-Since
  304 Not Modified  → unchanged since If-Modified-Since; empty body
  401 Unauthorized  → bad token
```
**Implement the `If-Modified-Since`/`Last-Modified` cache flow** — it avoids re-signing/re-sending unchanged passes on every poll. **[VERIFIED]**

### 4. Unregister a device **[VERIFIED]**
```
DELETE {webServiceURL}v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}/{serialNumber}
Headers:  Authorization: ApplePass {authenticationToken}
Responses: 200 OK (success) | 401 Unauthorized
```
On success, remove the device↔pass registration row.

### 5. Log (device→server diagnostics) **[VERIFIED]**
```
POST {webServiceURL}v1/log
Headers:  Content-Type: application/json   (no auth)
Body:     { "logs": ["message 1", "message 2"] }
Response: 200 OK
```
Wallet posts errors here (e.g. failed fetches). Optional but very useful during development — log to your normal system.

### Which endpoints require auth **[VERIFIED · C14]**
- **Require `Authorization: ApplePass`:** register (1), get-latest-pass (3), unregister (4).
- **No auth per spec:** get-updated-serials (2), log (5).

## APNs push (triggering the update)

When a pass changes, push to every device registered for that `(passTypeIdentifier, serialNumber)`.

```
HTTP/2 POST  https://api.push.apple.com/3/device/{devicePushToken}        (production)
             https://api.sandbox.push.apple.com/3/device/{devicePushToken} (sandbox*)
Ports: 443 or 2197
Headers:
  apns-topic: {passTypeIdentifier}        ← MUST equal your pass type id, e.g. pass.com.lovalte.loyalty
  apns-push-type: background              ← see note C8
  apns-priority: 5                        ← required for background-typed pushes (10 is rejected)
  apns-expiration: 0                      ← optional; expire immediately if undeliverable
Payload: {}                               ← EMPTY object
```

- **Topic = the `passTypeIdentifier`** (not an app bundle id). **[VERIFIED]**
- **Payload is empty `{}`.** **[VERIFIED]**
- **Hosts:** production `api.push.apple.com` is confirmed. The non-production host is named **`api.development.push.apple.com`** in Apple's archived docs but practitioners use **`api.sandbox.push.apple.com`**; both resolve to the same environment. **[CORRECTED · C7]**
- **`apns-push-type: background` + `apns-priority: 5`** — the push-type header postdates Apple's PassKit spec and isn't named for passes in primary docs; `background` is community practice and the sensible value. With background type, **priority must be 5** (priority 10 is rejected). **[C8 · use background/5]**
- Legacy binary APNs (ports 2195/2197 binary protocol) was **retired 2021-03-31** — use **HTTP/2 only**. **[VERIFIED]**

### APNs authentication — two options **[VERIFIED]**
- **(A) Certificate-based:** TLS client cert = your **Pass Type ID certificate** (the same one that signs passes). No `Authorization` header. **[VERIFIED]**
- **(B) Token-based (.p8 JWT, ES256):**
  - JWT header `{ "alg": "ES256", "kid": "<10-char Key ID>" }`, claims `{ "iss": "<10-char Team ID>", "iat": <epoch seconds> }`.
  - Header `authorization: bearer <JWT>` (lowercase `bearer`). Token valid **1 hour** — regenerate before expiry. `apns-topic` is mandatory.
  - Advantage: a `.p8` key doesn't expire like the annual Pass Type ID cert. **[VERIFIED]**

> Pass **signing always needs the Pass Type ID `.p12`** — there is no `.p8` equivalent for signing. The `.p8` only helps for the APNs push leg.

### Rate limits / cadence **[VERIFIED]**
- Apple publishes **no numeric rate limit** for pass pushes. Guidance is behavioral: *"Send pushes only to the devices that have registered… and only when the pass has changed. Don't send unnecessary pushes."* **[VERIFIED]**
- Pushes coalesce; delivery is best-effort. Over-pushing has no benefit and risks throttling (3rd-party estimate ~2–3 silent pushes/hour/device — **[UNVERIFIED]**). Push once per real change.
- If APNs reports a token invalid, **delete that device + its registrations**. **[VERIFIED]**

## Server-side update procedure (pseudocode)
```
onMemberPointsChanged(memberId):
  pass = passes.findByMember(memberId)
  pass.fieldValues.points = newPoints
  pass.updatedAt = now()                 # this is the "tag"
  passes.save(pass)
  invalidateCachedPkpass(pass.serialNumber)
  for reg in registrations.forPass(pass.passTypeId, pass.serialNumber):
      apns.push(reg.device.pushToken, topic=pass.passTypeId, payload={})
```
The device then calls endpoints 2 and 3 on its own; you just serve the freshly-signed pass with an updated `Last-Modified`, and Wallet shows the `changeMessage` (e.g. "Your balance is now 2,400!").
