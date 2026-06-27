---
name: make-interfaces-feel-better
description: "UI polish — apply when building/reviewing frontend components, CSS, animations, cards, buttons, modals. Covers text-wrap, concentric radius, icon animations, font smoothing, tabular numbers, shadows, enter/exit animations. Use when Implementing components, reviewing CSS/Tailwind/styles, adding animations, building cards/modals/forms, any frontend visual or layout work."
---

## Interface Polish Principles

Apply these automatically when building or reviewing UI components. Each is small; together they make interfaces feel crafted.

### Text Wrapping
- Headlines/labels: `text-wrap: balance` — equal line lengths, no orphans
- Body copy: `text-wrap: pretty` — prevents single-word last lines

### Concentric Border Radius
Outer and inner radii must NOT match — subtract padding:
```
inner-radius = outer-radius - padding
```
Example: outer `16px`, padding `8px` → inner `8px` (not `16px`).

### Icon Animations
Hover: combine opacity + scale + blur for depth.
```css
.icon { opacity: 0.6; transform: scale(0.9); filter: blur(1px); transition: all 150ms ease; }
.icon:hover { opacity: 1; transform: scale(1); filter: blur(0); }
```

### Font Smoothing (macOS)
Always add to root/body:
```css
-webkit-font-smoothing: antialiased;
-moz-osx-font-smoothing: grayscale;
```

### Tabular Numbers
For any dynamic numeric values (counters, prices, stats, timers):
```css
font-variant-numeric: tabular-nums;
```
Prevents layout shift as digits change width.

### Interruptible Animations
- Hover/toggle states → `transition` (interruptible mid-play)
- Looping or entrance sequences → `@keyframes`
- **Never** use `@keyframes` for hover — it cannot be interrupted

### Enter Animations
- Fade + subtle upward slide: `translateY(8px) → translateY(0)` with opacity 0→1
- Stagger list items: `animation-delay: calc(var(--index) * 50ms)`
- Duration: 150–300ms

### Exit Animations
- Subtle: fade + slight scale down (`scale(0.97)`) or blur out
- Duration ~60% of enter duration — exits should be quick
- Don't over-animate exits

### Optical Alignment
- Geometric center ≠ visual center
- Icons in buttons often need 1–2px upward nudge from mathematical center
- Trust eye over grid

### Shadows Over Borders
Layered shadows feel more natural than flat borders:
```css
box-shadow:
  0 1px 2px rgba(0,0,0,0.05),
  0 4px 12px rgba(0,0,0,0.08);
```
Prefer this over `border: 1px solid` for elevation/depth.

### Image Outlines for Depth
Thin inset ring prevents light images from bleeding into light backgrounds:
```css
img { box-shadow: inset 0 0 0 1px rgba(0,0,0,0.08); }
```

## Checklist Before Completing UI Work

- [ ] Headlines use `text-wrap: balance`?
- [ ] Nested radii are concentric (not identical)?
- [ ] Font smoothing applied globally?
- [ ] Dynamic numbers use `font-variant-numeric: tabular-nums`?
- [ ] Hover animations use `transition` not `@keyframes`?
- [ ] Shadows used instead of flat borders where possible?
- [ ] Image depth ring applied on light-on-light images?
