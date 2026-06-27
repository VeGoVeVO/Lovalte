/**
 * App-wide base layer injected ONCE at the root (App.tsx). Unlike `haloCss`
 * (scoped to `.halo` surfaces), this is global so it also reaches portaled
 * modals and the public enrollment page: one consistent custom scrollbar and a
 * small set of reusable enter animations. All motion is reduced-motion aware.
 */
export const globalCss = `
/* ── Base canvas: soft dot grid behind the drifting AmbientBackground orbs ── */
html { background-color: #FCFCFD; background-image: radial-gradient(rgba(32,36,42,.03) 1px, transparent 1px); background-size: 32px 32px; }
body, #root { background: transparent; }

/* ── Custom scrollbar (Firefox + WebKit/Blink) ─────────────────────────── */
* { scrollbar-width: thin; scrollbar-color: rgba(120,130,150,.42) transparent; }
*::-webkit-scrollbar { width: 10px; height: 10px; }
*::-webkit-scrollbar-track { background: transparent; }
*::-webkit-scrollbar-thumb {
  background: rgba(120,130,150,.38);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
*::-webkit-scrollbar-thumb:hover { background: rgba(90,100,120,.62); border: 2px solid transparent; background-clip: padding-box; }
*::-webkit-scrollbar-corner { background: transparent; }

/* ── Reusable enter animations ─────────────────────────────────────────── */
@keyframes lvtRise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes lvtFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes lvtPop  { from { opacity: 0; transform: translateY(8px) scale(.985); } to { opacity: 1; transform: none; } }

.lvt-rise { animation: lvtRise .42s cubic-bezier(.22,.61,.36,1) both; }
.lvt-fade { animation: lvtFade .35s ease-out both; }
.lvt-pop  { animation: lvtPop .18s ease-out both; }

/* Stagger direct children (lists, grids, button rows) */
.lvt-stagger > * { animation: lvtRise .46s cubic-bezier(.22,.61,.36,1) both; }
.lvt-stagger > *:nth-child(1){ animation-delay: .02s; }
.lvt-stagger > *:nth-child(2){ animation-delay: .06s; }
.lvt-stagger > *:nth-child(3){ animation-delay: .10s; }
.lvt-stagger > *:nth-child(4){ animation-delay: .14s; }
.lvt-stagger > *:nth-child(5){ animation-delay: .18s; }
.lvt-stagger > *:nth-child(6){ animation-delay: .22s; }
.lvt-stagger > *:nth-child(7){ animation-delay: .26s; }
.lvt-stagger > *:nth-child(8){ animation-delay: .30s; }
.lvt-stagger > *:nth-child(n+9){ animation-delay: .34s; }

/* Smooth press feedback for any element opting in */
.lvt-press { transition: transform .12s ease; }
.lvt-press:active { transform: scale(.97); }

@media (prefers-reduced-motion: reduce) {
  .lvt-rise, .lvt-fade, .lvt-pop, .lvt-stagger > *, .lvt-press { animation: none !important; transition: none !important; }
}
`;
