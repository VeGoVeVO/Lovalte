# Lovalte Platform — Overview, Vision & Scope

> **Plan README** · Document 00 of 13 · Last updated: 2026-06-27

---

## 1. Product Vision

Lovalte is a multi-tenant SaaS that lets any business create, issue, and manage a digital loyalty card program in minutes — without writing a line of code. A merchant signs up, uses the visual Builder to design a branded Apple Wallet loyalty card, and publishes it. Lovalte then issues each enrolled customer a signed `.pkpass` (Apple Wallet) and a companion QR code. Staff scan the QR at the point of sale to award or redeem points. The owner gains a real-time dashboard and analytics feed to tune the program and grow retention.

The platform sits at the intersection of three value propositions:

| Stakeholder | Value delivered |
|---|---|
| Business owner | Retention tool with zero infrastructure overhead; analytics to measure ROI |
| Customer | Frictionless, always-updated loyalty card in Apple Wallet; no app download needed |
| Staff | One-tap QR scan on any camera-equipped device; no training overhead |

---

## 2. End-to-End User Journeys

### Journey 1 — Merchant Onboarding
```
Sign up (email + password)
  → Identity&Access BC creates Tenant + Owner user, issues JWT
  → Owner completes business profile (name, logo, tier names)
  → Billing plan selected (MVP: free tier, scale: paid tiers)
```

### Journey 2 — Build & Publish a Card
```
Owner opens Builder (Card Design BC)
  → Drag-and-drop visual editor sets logo, strip image, colours (rgb()), background, label text, tier field
  → Saved as CardTemplate aggregate (draft state)
  → Owner clicks Publish → CardTemplate transitions to active
  → Pass Issuance BC listens to CardTemplatePublished domain event
  → passkit-generator v3.5.7 compiles the canonical pass.json (WWDR G4 cert, strip 375×144, MIME application/vnd.apple.pkpass)
  → Compiled .pkpass buffer stored to S3; sharable enrolment URL generated
```

### Journey 3 — Customer Enrols
```
Customer clicks enrolment URL (or scans a poster QR)
  → Browser serves Add to Apple Wallet button + QR download
  → Customer taps → iOS requests Pass Issuance /v1/passes/{passTypeId}/{serialNumber}
  → Lovalte signs + returns .pkpass; Wallet registers device via /v1/devices/{deviceId}/registrations/{passTypeId}/{serialNumber}
  → Delivery BC records Device+Registration aggregates
  → Member aggregate created in Membership/Loyalty BC (points = 0, tier = base)
  → QR payload = compact signed token { passId, tenantId, nonce, iat } (HMAC-SHA256); stored alongside pass
```

### Journey 4 — Staff Scans at POS
```
Staff opens scan page (camera on any device)
  → QR decoded → POST /api/scan { token, tenantId }
  → Scanning&Redemption BC: verifies HMAC signature, checks nonce in Redis (replay guard), validates expiry
  → Atomic: nonce marked used in Redis + PointsAwarded domain event published
  → Membership/Loyalty BC handler applies points rule → updates Member aggregate → emits MemberTierChanged if threshold crossed
  → Response: { member, newBalance, tierStatus } displayed to staff in < 400 ms
  → Analytics BC ingest handler writes to append-only scan_events table
```

### Journey 5 — Owner Views Analytics
```
Owner opens Dashboard
  → TanStack Query fetches /api/analytics/summary (tenant-scoped, Redis-cached 60 s)
  → Recharts renders: active members, scans/day, points issued, redemption rate, tier distribution
  → Owner adjusts points multiplier → CardTemplate updated → APNs silent push (priority 5) triggers Wallet refresh for all registered devices
```

---

## 3. MVP vs Scale Scope

### MVP (Launch Milestone)

| Area | Included |
|---|---|
| Identity&Access | Email/password sign-up, JWT auth, Owner + Staff roles, single tenant per account |
| Card Design/Builder | One card layout (loyalty stamp/points), logo + strip image upload, colour picker |
| Pass Issuance | `.pkpass` generation, individual enrolment URL, QR code |
| Membership/Loyalty | Points balance, one tier ladder (3 tiers), manual multiplier |
| Scanning&Redemption | Camera QR scan, award points, idempotent replay guard |
| Delivery | Apple Wallet registration, single-device push on card update |
| Analytics | Daily active scans, total members, points issued/redeemed; 30-day chart |
| Infrastructure | Single-region Postgres (RLS enabled), Redis, S3-compatible object store |

### Scale Milestone (Post-MVP)

| Area | Extension |
|---|---|
| Identity&Access | Manager role, SSO (OIDC), multi-location businesses |
| Card Design | Multiple templates per tenant, reward stamps layout, dynamic field personalisation |
| Pass Issuance | Google Wallet (JWT-based passes), Android QR fallback |
| Membership | Expiring points, promo multipliers, referral rewards, tier expiry rules |
| Scanning | Offline-capable scan PWA with local nonce cache + sync |
| Delivery | Multi-device fan-out push, Android FCM |
| Analytics | Cohort retention, LTV, CSV export, webhook outbound events |
| Infrastructure | Multi-region read replicas, global CDN for `.pkpass` buffers, horizontal BullMQ workers |

---

## 4. Personas

| Persona | Role | Primary touchpoint | Key concern |
|---|---|---|---|
| **Owner** | Business owner / admin | Dashboard, Builder | ROI, card design, analytics, billing |
| **Manager** | Shift supervisor, delegated admin | Dashboard (limited), scan page | Staff management, daily ops |
| **Staff** | Front-of-house employee | Scan page only | Speed, simplicity, no training |
| **Customer** | End consumer | Apple Wallet, enrolment URL | Frictionless, no extra app, privacy |

RBAC mapping: `owner` → full access; `manager` → card read + scan + member view; `staff` → scan only.

---

## 5. Success Metrics / KPIs

| Metric | MVP target | Scale target |
|---|---|---|
| Merchant activation rate (signup → first publish) | ≥ 60 % in 7 days | ≥ 75 % |
| Pass enrolment conversion (URL → Wallet add) | ≥ 40 % | ≥ 55 % |
| Scan latency (QR verify → response) | p99 < 500 ms | p99 < 200 ms |
| QR replay rejection rate | 100 % | 100 % |
| Push delivery success rate (APNs) | ≥ 97 % | ≥ 99.5 % |
| Monthly active merchants (MAM) | 50 at launch | 2 000 at 12 mo |
| Dashboard load time (FCP) | < 2 s on 4G | < 1 s |
| Tenant data isolation incidents | 0 | 0 |
| GDPR delete request fulfilment | < 72 h | < 24 h automated |

---

## 6. Glossary of Ubiquitous Language

| Term | Definition |
|---|---|
| **Tenant** | A business account; the top-level multi-tenant boundary. Every DB row carries `tenant_id`. |
| **CardTemplate** | Aggregate (Card Design BC) holding the visual design of a loyalty pass. Has draft/active states. |
| **Pass** | Aggregate (Pass Issuance BC) representing one customer's issued `.pkpass` + QR. Has a stable `serialNumber`. |
| **Member** | Aggregate (Membership BC) representing a customer's loyalty account: points, tier, history. |
| **Scan** | Domain event (Scanning BC) produced when staff verify a QR; triggers point award. |
| **RedemptionEvent** | Idempotent record of a completed scan; keyed by nonce to prevent double-award. |
| **Device** | Aggregate (Delivery BC) representing a registered Apple Wallet device (`pushToken`, `deviceId`). |
| **Registration** | Link between a Device and a Pass, enabling targeted APNs push on card update. |
| **Nonce** | Single-use random value embedded in QR token; Redis-backed to enforce single-scan semantics. |
| **PassTypeIdentifier** | Apple Wallet certificate identifier, e.g. `pass.com.lovalte.<tenant>`. |
| **SerialNumber** | Stable, tenant-scoped pass identifier; `GET /v1/passes/{passTypeId}/{serialNumber}` uses it. |
| **authenticationToken** | 16+ char random secret per pass, set at creation and **never** changed; used to authenticate PassKit requests. |
| **WWDR G4** | Apple Worldwide Developer Relations G4 intermediate certificate required to sign `.pkpass` bundles. |
| **Strip image** | The banner image at the top of a loyalty card pass; required dimensions 375 × 144 pt (@1x). |
| **APNs** | Apple Push Notification service; Lovalte uses background pushes (priority 5) to trigger Wallet refresh. |
| **BullMQ job** | Async worker task (Redis-backed) for APNs push fan-out and analytics event ingestion. |
| **Halo** | Lovalte's frosted-glass design-token system; CSS custom properties consumed by React 19 components. |
| **Builder** | The visual drag-and-drop frontend module where owners design a CardTemplate. |
| **Enrolment URL** | A public, tenant-specific URL that renders the "Add to Apple Wallet" button for a card. |
| **PointsRule** | Value object inside Member aggregate defining how scans translate to points (base rate, multipliers). |
| **Anti-Corruption Layer (ACL)** | Adapter translating domain events between bounded contexts that have different models. |

---

## 7. Document Index (Plan README)

This folder contains 13 numbered specification documents that together constitute the full implementation plan for the Lovalte platform. **01-domain-model-and-bounded-contexts.md** defines the 8 bounded contexts, aggregate boundaries, and the domain event catalogue. **02-data-model-and-schema.md** specifies every Postgres table, column type, index, and Row-Level Security policy. **03-api-contract.md** enumerates all REST endpoints (PassKit + application API), request/response shapes, and zod validation schemas. **04-auth-and-rbac.md** covers JWT issuance, RBAC role matrix, middleware, and tenant isolation enforcement. **05-card-builder-frontend.md** details the visual Builder: component tree, Zustand slice, drag-and-drop canvas, and the CardTemplate publish flow. **06-pass-issuance-and-pkpass.md** specifies the passkit-generator v3.5.7 integration, pass.json field mapping (strip dimensions, rgb() colours, WWDR G4 signing), and S3 storage layout. **07-qr-and-scanning.md** covers the signed QR token schema, HMAC-SHA256 signing, Redis nonce lifecycle, the scan endpoint, and idempotent redemption logic. **08-membership-and-loyalty-engine.md** describes the Member aggregate, points accrual rules, tier ladder, and domain event integration with Scanning BC. **09-delivery-and-apns.md** details Apple Wallet device registration, the 5 PassKit web-service endpoints, BullMQ push fan-out, and APNs connection pooling (priority 5). **10-analytics-pipeline.md** defines the append-only `scan_events` read model, BullMQ ingest worker, aggregation queries, Redis caching, and the Recharts dashboard contract. **11-infrastructure-and-devops.md** specifies the deployment topology (single-region MVP), Docker Compose local stack, CI/CD pipeline, secrets management (KMS / secret store), and observability stack. **12-security-baseline.md** enumerates the full security controls: parameterised queries, RLS enforcement, rate limiting, OWASP Top 10 mitigations, PII minimisation, GDPR export/delete, and the audit log schema.
