---
name: frontend-pipeline
description: "frontend-pipeline: Coordinated 4-skill pipeline for ALL frontend and UI work — React components, pages, layouts, CSS, Tailwind, styling, animations, design tokens, responsive design. Invoke before writing or modifying any frontend code. Defines the PLAN→BUILD→REVIEW→GATE sequence, which skill owns which phase, and conflict-resolution rules between frontend-design, emil-design-eng, taste-skill, and impeccable. Trigger on: component, page, layout, CSS, Tailwind, styling, animation, design token, UI, UX, frontend, responsive, a11y in a UI context."
when_to_use: "Any frontend, UI, component, CSS, Tailwind, styling, animation, design token, layout, or page work. Invoke before touching any frontend code to ensure the correct 4-phase sequence is followed."
---

# Frontend Pipeline Coordinator

All frontend work runs through a 4-phase pipeline in strict order. No skipping phases. This skill coordinates the 4 individual skills and resolves all overlaps between them.

## Pipeline Phases

| Phase | Skill(s) to invoke | Owns |
|---|---|---|
| **1 — PLAN** | `frontend-design` | Clarify goal + device + a11y level; sketch the component tree (prose or ASCII); pick ONE styling approach matching what the project already uses. No JSX or CSS yet. |
| **2 — BUILD** | `emil-design-eng` + `frontend-design` | **emil**: design tokens (never hardcode color/spacing/type), reuse existing components before writing new, Figma/spec fidelity, a11y implementation. **frontend-design**: component principles (one responsibility, flat props, compose-over-configure), responsive (mobile-first, `clamp()`), performance (lazy images, stable keys). |
| **3 — REVIEW** | `taste-skill` | Aesthetic pass only — names, altitude, friction, surprise, symmetry. Smallest fix per finding. No rewrites. No premature abstraction. |
| **4 — GATE** | `impeccable` | format → lint → types → tests → security. Block on ANY failure; fix root cause, never suppress. Then browser check: happy / loading / empty / error states; keyboard-only tab-through; 320px + 1280px viewports; axe or Lighthouse a11y audit. |

## Execution Sequence

Invoke each phase via the Skill tool, completing it before proceeding:

```
Phase 1: Skill({ skill: "frontend-design" })   → produce PLAN output before writing any code
Phase 2: Skill({ skill: "emil-design-eng" })   → BUILD with tokens and a11y; apply frontend-design BUILD steps alongside
Phase 3: Skill({ skill: "taste-skill" })        → apply smallest aesthetic fixes; no rewrites
Phase 4: Skill({ skill: "impeccable" })         → all checks must pass; browser check runs here, not before
```

Do not claim frontend work complete until Phase 4 (GATE) passes all checks.

## Coordination Rules (conflict resolution)

These rules prevent the 4 skills from conflicting on shared concerns. They are authoritative over each individual skill's description.

**Accessibility is owned ONCE — at BUILD, by `emil-design-eng`.**
Hard implementation numbers: semantic HTML first (`button`, not `div onClick`); all interactive elements keyboard-reachable with visible focus ring; ARIA labels on icon-only controls; color contrast ≥ 4.5:1 for normal text and ≥ 3:1 for large text and UI elements; all motion guarded by `prefers-reduced-motion`. The `frontend-design` skill's a11y steps defer to `emil` here — do not run a separate a11y pass during PLAN.

**Design tokens and component reuse are `emil`'s call and win over writing-new.**
`frontend-design`'s "three similar before extracting" rule applies only when no existing token or component satisfies the need. When a token or existing component exists, use it — do not write new.

**Verification runs ONCE — at GATE via `impeccable`.**
Do not run format/lint/types/tests during BUILD or REVIEW phases. Browser verification (happy/loading/empty/error states; keyboard-only navigation; 320px + 1280px viewports; axe or Lighthouse) also runs at GATE, not during BUILD.

**Taste is not correctness.**
`taste-skill` judges elegance only — names, altitude, friction, surprise, symmetry. It defers bugs, never blocks on convention, and never demands a rewrite when a rename suffices. All correctness, security, and quality checks belong to `impeccable` at GATE.

## Hard Numbers (carry into all phases)

| Concern | Target |
|---|---|
| Normal text contrast | ≥ 4.5:1 |
| Large text / UI elements contrast | ≥ 3:1 |
| Test viewports | 320px, 768px, 1280px |
| Fluid typography | `clamp()` — no breakpoint-specific px jumps |
| Image loading | `loading="lazy"` + explicit `width`/`height` to prevent layout shift |
| List keys | Stable + unique; never array index on reorderable lists |
| Motion | Always guarded by `prefers-reduced-motion` |
