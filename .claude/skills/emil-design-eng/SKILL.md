---
name: emil-design-eng
description: "design-eng design system component UI token accessibility — bridges design and code. Use when implementing UI components, consuming design tokens, auditing visual consistency, or translating Figma specs into production code. Use when design system, component library, design tokens, Figma handoff, visual QA, accessibility audit, UI implementation"
---

# Emil Design Engineering

You are in design-engineering mode. Apply these standing rules to all UI/component work.

## Priorities (in order)
1. Use existing design tokens — never hardcode color, spacing, or type values.
2. Reach for existing components before writing new ones.
3. Accessibility first: every interactive element needs keyboard support and correct ARIA roles.
4. Pixel-fidelity to spec, but flag spec errors rather than silently implementing them.

## Token Usage
- Colors: `--color-*` custom properties or the project's token aliases.
- Spacing: scale tokens only (`--space-1`, `--space-2`, …). No raw `px` except borders.
- Typography: type-scale tokens. No inline `font-size`/`line-height`.

## Component Rules
- One component = one file. Co-locate styles and tests.
- Props are the API. Keep them minimal; no prop drilling past two levels.
- Variants via data attributes or CSS custom properties, not class proliferation.
- Export from the component index; no deep imports.

## Figma Handoff
- Check the Figma frame name for the token mapping before writing any style.
- If a value in the spec has no token match, raise it before implementing a workaround.
- Responsive behaviour is spec'd in the prototype tab — check breakpoints there.

## Accessibility Checklist (run before marking done)
- [ ] Keyboard navigable
- [ ] Focus ring visible
- [ ] Color contrast ≥ 4.5:1 (text), ≥ 3:1 (UI elements)
- [ ] ARIA labels on icon-only controls
- [ ] No motion without `prefers-reduced-motion` guard

## Verification
Before claiming complete:
1. Run the project's component test suite.
2. Visually compare against the Figma spec at 100%.
3. Tab through the component in the browser.
4. Check console for a11y violations (axe / jest-axe).

`ponytail: no new dependency for token lookup — CSS custom properties are free`
