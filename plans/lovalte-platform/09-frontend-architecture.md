# 09 — Frontend Architecture (DDD Presentation Layer)

> Stack: React 19 + TypeScript + Vite · React Router v7 · TanStack Query v5 · Zustand v5 · Halo design-token system · Recharts. Mandate: `frontend-pipeline` skill governs all component/page/CSS work (PLAN → BUILD → REVIEW → GATE).

---

## 1. Project Root Layout

```
apps/web/
├── index.html
├── vite.config.ts
├── tsconfig.json
├── public/
│   └── manifest.webmanifest           # PWA manifest (scan/ offline support)
└── src/
    ├── main.tsx                        # ReactDOM.createRoot + QueryClientProvider + RouterProvider
    ├── router.tsx                      # createBrowserRouter — all routes declared here
    ├── design-system/                  # § 2 — Halo tokens + primitives
    ├── lib/                            # § 3 — API client, auth, utils
    ├── presentation/                   # § 4 — feature modules (mirrors bounded contexts)
    │   ├── marketing/
    │   ├── auth/
    │   ├── builder/
    │   ├── dashboard/
    │   ├── analytics/
    │   ├── scan/
    │   └── wallet/
    └── shared/                         # cross-feature UI atoms (not Halo-specific)
        ├── components/
        │   ├── ErrorBoundary.tsx
        │   ├── Spinner.tsx
        │   └── EmptyState.tsx
        └── hooks/
            ├── useAuth.ts
            └── useToast.ts
```

---

## 2. Design System — Halo Frosted-Glass Tokens

### 2.1 File Tree (exact split)

```
src/design-system/
├── halo/
│   ├── styles/
│   │   └── halo.css.ts               # CSS custom-property string; injected via <style> in main.tsx
│   ├── icons/
│   │   └── index.tsx                 # named Icon set (SVG sprites); exports <Icon name size />
│   ├── hooks/
│   │   └── useReveal.ts              # IntersectionObserver reveal; respects prefers-reduced-motion
│   ├── components/
│   │   ├── Reveal.tsx                # props: children, delay?: number, className?: string
│   │   ├── GlassCard.tsx             # props: children, variant?: "default"|"elevated", className?
│   │   ├── GlassButton.tsx           # props: children, onClick, variant?, disabled?, type?
│   │   └── GlassInput.tsx            # props: id, label, type, value, onChange, error?, required?
│   ├── content/
│   │   └── features.ts               # static data: Feature[] { icon, title, body } — no JSX
│   ├── lib/
│   │   └── scrollTo.ts               # smooth-scroll util: scrollTo(id: string, offset?: number)
│   ├── sections/
│   │   ├── Ambient.tsx               # props: none — radial gradient orbs; aria-hidden
│   │   ├── Nav.tsx                   # props: onWaitlistClick: () => void
│   │   ├── Hero.tsx                  # props: onWaitlistClick: () => void
│   │   ├── Features.tsx              # props: none — renders features.ts data
│   │   ├── QuietStatement.tsx        # props: none — full-width punchy copy block
│   │   ├── Testimonial.tsx           # props: none — static quote + avatar
│   │   ├── Waitlist.tsx              # props: email: string, onChange, onSubmit, status: "idle"|"loading"|"success"|"error"
│   │   └── Footer.tsx                # props: none
│   └── HaloLanding.tsx               # composition root; owns email state + scroll parallax effect
└── index.ts                          # re-exports all primitives + HaloLanding
```

### 2.2 `halo.css.ts` — token string

```typescript
// src/design-system/halo/styles/halo.css.ts
export const haloCss = `
  :root {
    --halo-bg:            #0a0a0f;
    --halo-surface:       rgba(255,255,255,0.04);
    --halo-surface-hover: rgba(255,255,255,0.08);
    --halo-border:        rgba(255,255,255,0.10);
    --halo-border-focus:  rgba(255,255,255,0.30);
    --halo-text-primary:  #f0f0f6;
    --halo-text-muted:    rgba(240,240,246,0.55);
    --halo-accent:        #7c6af7;
    --halo-accent-glow:   rgba(124,106,247,0.35);
    --halo-radius-sm:     8px;
    --halo-radius-md:     16px;
    --halo-radius-lg:     24px;
    --halo-blur:          backdrop-filter: blur(20px) saturate(1.4);
    --halo-transition:    200ms cubic-bezier(0.4,0,0.2,1);
  }
  @media (prefers-reduced-motion: reduce) {
    *, ::before, ::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
  }
`;
```

### 2.3 `useReveal.ts`

```typescript
// src/design-system/halo/hooks/useReveal.ts
import { useEffect, useRef } from "react";

export function useReveal<T extends HTMLElement>(delay = 0) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { el.style.opacity = "1"; return; }
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setTimeout(() => { el.style.opacity = "1"; el.style.transform = "translateY(0)"; }, delay);
        obs.disconnect();
      }
    }, { threshold: 0.15 });
    el.style.cssText += "opacity:0;transform:translateY(24px);transition:opacity 0.6s ease,transform 0.6s ease;";
    obs.observe(el);
    return () => obs.disconnect();
  }, [delay]);
  return ref;
}
```

### 2.4 `HaloLanding.tsx` — composition + email state + parallax

```typescript
// src/design-system/halo/HaloLanding.tsx
import { useState, useEffect, useCallback } from "react";
import { Ambient } from "./sections/Ambient";
import { Nav }     from "./sections/Nav";
import { Hero }    from "./sections/Hero";
import { Features }       from "./sections/Features";
import { QuietStatement } from "./sections/QuietStatement";
import { Testimonial }    from "./sections/Testimonial";
import { Waitlist }       from "./sections/Waitlist";
import { Footer }         from "./sections/Footer";
import { scrollTo }       from "./lib/scrollTo";

type WaitlistStatus = "idle" | "loading" | "success" | "error";

export function HaloLanding() {
  const [email, setEmail]   = useState("");
  const [status, setStatus] = useState<WaitlistStatus>("idle");
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handler = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!email) return;
    setStatus("loading");
    try {
      await fetch("/api/waitlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      setStatus("success");
    } catch { setStatus("error"); }
  }, [email]);

  return (
    <main style={{ background: "var(--halo-bg)", minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      <Ambient />
      <Nav onWaitlistClick={() => scrollTo("waitlist")} />
      <Hero onWaitlistClick={() => scrollTo("waitlist")} />
      <Features />
      <QuietStatement />
      <Testimonial />
      <Waitlist email={email} onChange={setEmail} onSubmit={handleSubmit} status={status} />
      <Footer />
    </main>
  );
}
```

---

## 3. Shared Lib

### 3.1 API Client — `src/lib/apiClient.ts`

```typescript
// Thin fetch wrapper; all requests scoped to /api; Bearer token injected from Zustand auth store.
export async function apiClient<T>(path: string, init?: RequestInit): Promise<T> {
  const token = useAuthStore.getState().token;   // called outside React — Zustand supports this
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers },
  });
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})));
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) { super(`HTTP ${status}`); }
}
```

### 3.2 Auth Store — `src/lib/authStore.ts` (Zustand)

```typescript
interface AuthState { token: string | null; tenantId: string | null; role: "owner"|"manager"|"staff"|null; setSession(t:string,tid:string,r:AuthState["role"]):void; clearSession():void; }
export const useAuthStore = create<AuthState>()(
  persist((set) => ({
    token: null, tenantId: null, role: null,
    setSession: (token, tenantId, role) => set({ token, tenantId, role }),
    clearSession: () => set({ token: null, tenantId: null, role: null }),
  }), { name: "lovalte-auth" })
);
```

### 3.3 Auth Guard — `src/lib/AuthGuard.tsx`

```typescript
export function AuthGuard({ roles, children }: { roles?: AuthState["role"][]; children: ReactNode }) {
  const { token, role } = useAuthStore();
  if (!token) return <Navigate to="/auth/login" replace />;
  if (roles && role && !roles.includes(role)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
```

---

## 4. Routing Map — `src/router.tsx`

```
/                          → HaloLanding (marketing)
/auth/login                → LoginPage
/auth/register             → RegisterPage
/auth/verify-email         → VerifyEmailPage

[AuthGuard: owner|manager|staff]
/dashboard                 → DashboardPage (metrics overview)
/dashboard/members         → MembersListPage
/dashboard/members/:id     → MemberDetailPage

[AuthGuard: owner|manager]
/builder                   → BuilderPage (card design canvas)
/builder/:templateId       → BuilderPage (edit existing)

[AuthGuard: owner]
/analytics                 → AnalyticsPage

[AuthGuard: staff]
/scan                      → ScanPage (staff PWA camera scanner)

[public]
/wallet/add/:passToken     → AddToWalletPage  (redirects to pkpass URL)
/wallet/success            → WalletSuccessPage
```

Router uses `createBrowserRouter` with `<Outlet>` layouts; lazy `import()` at route level for code-splitting; `<Suspense fallback={<Spinner />}>` wrapping each lazy leaf.

---

## 5. Feature Modules

### 5.1 `presentation/marketing/`

```
marketing/
└── HaloLanding.tsx        # re-export from design-system/halo/HaloLanding (no logic here)
```

Route `/` renders `<HaloLanding />` directly. No auth required.

### 5.2 `presentation/auth/`

```
auth/
├── LoginPage.tsx          # email+password form; calls POST /api/auth/login; stores token via authStore.setSession
├── RegisterPage.tsx       # tenant signup; POST /api/auth/register
└── VerifyEmailPage.tsx    # shows token-from-url; POST /api/auth/verify-email
```

All forms: zod schema validated client-side; `react-hook-form` for field state; `GlassInput` / `GlassButton` from design-system; ARIA labels on every input (`id` + `htmlFor` pairs); `autocomplete` attributes set.

### 5.3 `presentation/builder/`

```
builder/
├── BuilderPage.tsx               # layout shell: CanvasPanel + ControlPanel side-by-side
├── canvas/
│   ├── CardCanvas.tsx            # <canvas> or SVG preview of the loyalty card (375×144 strip)
│   └── useCardDimensions.ts      # responsive canvas sizing
├── controls/
│   ├── ColorPicker.tsx           # rgb() value → sends to template fields
│   ├── FieldEditor.tsx           # label/value inputs per pass field
│   ├── ImageUploader.tsx         # drag-drop + upload to POST /api/builder/assets
│   └── TemplateControls.tsx      # org name, description, background/foreground/label colors
└── queries/
    ├── useTemplate.ts            # useQuery GET /api/builder/templates/:id
    └── useUpdateTemplate.ts      # useMutation PATCH /api/builder/templates/:id
```

**TanStack Query pattern** — `useTemplate` reads optimistic cache; `useUpdateTemplate` issues PATCH + invalidates `["template", id]`. On canvas, colors rendered as `rgb(r,g,b)` strings (Apple Wallet constraint verified). Image assets uploaded separately; returns signed S3 URL stored in template.

### 5.4 `presentation/dashboard/`

```
dashboard/
├── DashboardPage.tsx             # summary tiles: total members, active passes, scans today
├── members/
│   ├── MembersListPage.tsx       # paginated table; GET /api/members?page&search
│   ├── MemberDetailPage.tsx      # points history + pass status + manual points adjust
│   └── useMemberQueries.ts       # useQuery + useMutation wrappers
└── components/
    ├── StatTile.tsx              # GlassCard variant with metric + trend
    └── MembersTable.tsx          # accessible <table> with sort headers; aria-sort
```

### 5.5 `presentation/analytics/`

```
analytics/
├── AnalyticsPage.tsx             # date-range picker + chart grid
├── charts/
│   ├── PointsChart.tsx           # Recharts LineChart — points earned over time
│   ├── ScansChart.tsx            # BarChart — daily scan volume
│   └── TierBreakdownChart.tsx    # PieChart — member tier distribution
└── useAnalyticsQueries.ts        # GET /api/analytics/summary?from=&to=
```

All Recharts components: `role="img"` wrapper with `aria-label`; custom `Tooltip` renders accessible text. Colors meet 4.5:1 contrast against `var(--halo-bg)`.

### 5.6 `presentation/scan/` — Staff PWA Camera Scanner

```
scan/
├── ScanPage.tsx                  # AuthGuard role=staff; requests camera; renders viewfinder
├── useBarcodeScanner.ts          # § 5.6.1
├── useScanMutation.ts            # POST /api/scans/redeem; handles idempotency
└── ScanResult.tsx                # success/error overlay with animation
```

#### 5.6.1 `useBarcodeScanner.ts`

```typescript
// Progressive: BarcodeDetector API first; falls back to jsQR (bundled, ~18 kB gzip)
export function useBarcodeScanner(videoRef: RefObject<HTMLVideoElement>, onDetect: (raw: string) => void) {
  useEffect(() => {
    let stream: MediaStream;
    let raf: number;
    (async () => {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      videoRef.current!.srcObject = stream;
      await videoRef.current!.play();

      if ("BarcodeDetector" in window) {
        const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
        const scan = async () => {
          const codes = await detector.detect(videoRef.current!);
          if (codes[0]) onDetect(codes[0].rawValue);
          else raf = requestAnimationFrame(scan);
        };
        raf = requestAnimationFrame(scan);
      } else {
        const { default: jsQR } = await import("jsqr");
        const ctx = document.createElement("canvas").getContext("2d")!;
        const scan = () => {
          const v = videoRef.current!;
          ctx.canvas.width = v.videoWidth; ctx.canvas.height = v.videoHeight;
          ctx.drawImage(v, 0, 0);
          const d = ctx.getImageData(0, 0, v.videoWidth, v.videoHeight);
          const code = jsQR(d.data, d.width, d.height);
          if (code) onDetect(code.data);
          else raf = requestAnimationFrame(scan);
        };
        raf = requestAnimationFrame(scan);
      }
    })();
    return () => { cancelAnimationFrame(raf); stream?.getTracks().forEach(t => t.stop()); };
  }, []);
}
```

`ScanPage` shows a `<video>` viewfinder, overlays a crosshair SVG, calls `useScanMutation` on detect, then re-arms after 2 s. PWA `manifest.webmanifest` sets `display: standalone`, `start_url: /scan` — staff can add to home screen. Service worker (Vite PWA plugin) caches shell + jsQR fallback for offline viewfinder UI.

### 5.7 `presentation/wallet/`

```
wallet/
├── AddToWalletPage.tsx    # Decodes passToken param; calls GET /api/passes/download/:token;
│                          # receives pkpass Buffer; triggers <a download> or redirects to
│                          # itms-services:// on iOS; shows "Add to Apple Wallet" badge SVG
└── WalletSuccessPage.tsx  # confirmation page after install
```

`Content-Type: application/vnd.apple.pkpass` set server-side (verified constraint). On non-iOS, shows QR of the download link as fallback.

---

## 6. TanStack Query — Data Layer Conventions

| Convention | Rule |
|---|---|
| Query keys | `["resource", id?, filters?]` — always arrays |
| Server state | Owned by TanStack Query — no Zustand duplication |
| UI-only state | Zustand (`authStore`, `builderStore` for canvas drag state) |
| Stale time | 30 s default; 0 for scans (always fresh); 5 min for analytics |
| Error boundary | `useQuery` errors bubble to nearest `<ErrorBoundary>`; `useMutation` errors shown inline |
| Optimistic updates | Builder template edits only; rollback on error |
| Prefetch | `router.loader` calls `queryClient.ensureQueryData` for dashboard + member detail |

---

## 7. Accessibility & Responsive

| Concern | Implementation |
|---|---|
| Focus rings | `outline: 2px solid var(--halo-accent); outline-offset: 2px` on `:focus-visible`; never `outline:none` |
| Color contrast | All text tokens verified ≥ 4.5:1 against `--halo-bg`; muted text ≥ 3:1 for large UI labels |
| Motion | `useReveal` and all CSS transitions gated on `prefers-reduced-motion` check |
| Semantic HTML | `<main>`, `<nav>`, `<section aria-label>`, `<article>`, `<button type>` everywhere |
| Forms | Every input has `<label htmlFor>`, `aria-describedby` for errors, `autocomplete` |
| Images | Decorative: `aria-hidden`; meaningful: `alt` text |
| Responsive | Fluid grid via CSS Grid + `clamp()`; no fixed px breakpoints; builder canvas scales via CSS transform |
| Scan page | `aria-live="polite"` region announces scan result to screen readers |

---

## 8. Error / Loading / Empty States

```
shared/components/
├── ErrorBoundary.tsx      # class component; renders GlassCard with error + retry button
├── Spinner.tsx            # CSS animation; respects prefers-reduced-motion (static ring fallback)
└── EmptyState.tsx         # props: icon, title, body, action?: { label, onClick }
```

Every data-fetching component pattern:
```tsx
if (isLoading) return <Spinner />;
if (error)     return <ErrorBoundary error={error} retry={refetch} />;
if (!data?.length) return <EmptyState icon="card" title="No cards yet" body="Create your first loyalty card" action={{ label: "New Card", onClick: goToBuilder }} />;
```

---

## 9. Build Config Highlights

```typescript
// vite.config.ts (key settings)
export default defineConfig({
  plugins: [react(), VitePWA({ registerType: "autoUpdate", workbox: { runtimeCaching: [{ urlPattern: /^\/api\//, handler: "NetworkFirst" }] } })],
  build: { target: "es2022", rollupOptions: { output: { manualChunks: { vendor: ["react","react-dom"], query: ["@tanstack/react-query"], charts: ["recharts"] } } } },
  server: { proxy: { "/api": "http://localhost:3000" } },
});
```

TypeScript `strict: true`; path alias `@/` → `src/`; no `any` in production code.
