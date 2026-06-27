---
name: frontend-design
description: "frontend, UI, UX, component, layout, styling, design system — guides frontend design decisions. Use when building UI components, designing layouts, choosing styling approaches, or planning frontend architecture. Brainstorm before implementing. Use when building components, adding pages, designing UI, responsive layout, accessibility, component API design, picking a styling approach"
---

# Frontend Design Skill

Load this skill before any frontend UI work — components, layouts, styling, pages, design systems.

## Step 1 — Clarify before coding

Ask (or infer from context) before touching code:
- What is the user goal this UI serves?
- Desktop / mobile / both?
- Existing design system or starting fresh?
- Accessibility requirements (WCAG level)?
- Any animation / motion preferences?

If underspecified, make the minimal reasonable assumption and state it.

## Step 2 — Design before implementing

Sketch the component tree in prose or ASCII before writing JSX/HTML:
```
Page
  └─ Layout (flex/grid)
       ├─ Header
       └─ Content
            ├─ Card (repeated)
            └─ EmptyState (conditional)
```
Identify: what is stateful, what is presentational, where does data flow.

## Step 3 — Component principles

- **One responsibility** — a component renders one thing or manages one concern.
- **Flat prop API** — no deeply nested config objects; prefer explicit props.
- **No style in logic** — keep business logic out of presentational components.
- **Compose over configure** — children/slots beat a `variant` prop explosion.
- **Avoid premature abstraction** — three similar components before extracting a shared one.

## Step 4 — Styling approach (pick one, stay consistent)

| Approach | Use when |
|---|---|
| CSS Modules | Multi-person team, no build-time overhead concern |
| Tailwind | Rapid iteration, utility-first already in project |
| CSS-in-JS | Component library, truly dynamic styles needed |
| Plain CSS | Simple project, no framework lock-in |

Check what the project already uses — never add a second styling system.

## Step 5 — Accessibility (non-negotiable)

- Semantic HTML first (`button` not `div onClick`).
- All interactive elements keyboard-reachable and focusable.
- `aria-label` / `aria-describedby` when text label absent.
- Color contrast ≥ 4.5:1 for normal text, 3:1 for large text.
- Motion: respect `prefers-reduced-motion`.

## Step 6 — Responsive design

- Mobile-first CSS (`min-width` breakpoints).
- Avoid fixed pixel widths on containers — use `%`, `ch`, `clamp()`.
- Test at 320px, 768px, 1280px minimum.
- Fluid typography: `clamp(1rem, 2.5vw, 1.5rem)` over breakpoint jumps.

## Step 7 — Performance checklist

- Images: `loading="lazy"`, explicit `width`/`height` to prevent layout shift.
- Lists: key prop stable and unique (not array index when list reorders).
- Heavy components: lazy-load with dynamic import / `React.lazy`.
- Avoid layout thrash: batch DOM reads before writes.

## Step 8 — Verify in browser

After implementing:
1. Run dev server.
2. Check golden path (happy state, loading state, empty state, error state).
3. Tab through all interactive elements — keyboard only.
4. Resize to 320px and 1280px.
5. Run Lighthouse accessibility audit or axe browser extension.

Only claim complete after browser verification passes.
