/* Halo design-token stylesheet - verbatim from the original Halo component.
   Token-driven frosted-glass system: depth from translucency, blur, soft layered
   shadows and edge light - never from saturated color. Imported by HaloLanding. */
export const css = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');

@property --lop { syntax:'<number>'; inherits:false; initial-value:0; }

.halo {
  /* ── color tokens ───────────────────────────────────────── */
  --bg:#FCFCFD;
  --bg-2:#F6F8FB;
  --card:rgba(255,255,255,.42);
  --card-strong:rgba(255,255,255,.60);
  --border:rgba(255,255,255,.72);
  --text:#20242A;
  --muted:#6F7684;
  /* refraction hints - reflections only, never primary UI color */
  --ice:#C8EEFF;
  --cyan:#A9F5FF;
  --mint:#C8FFD8;
  --lavender:#E5D8FF;
  --pink:#FFDDF4;

  /* ── glass material tokens ──────────────────────────────── */
  --blur:28px;
  --blur-hi:34px;
  --sat:160%;

  /* ── radius tokens ──────────────────────────────────────── */
  --r-card:24px;
  --r-btn:18px;
  --r-input:18px;
  --r-hero:32px;
  --r-pill:999px;

  /* ── motion tokens ──────────────────────────────────────── */
  --d-fast:200ms;
  --d:340ms;
  --d-slow:480ms;
  --ease:cubic-bezier(.22,1,.36,1);

  /* ── shadow tokens - extremely soft, layered, faint blue ── */
  --shadow-soft:
    0 1px 0 rgba(255,255,255,.7) inset,
    0 2px 6px -3px rgba(46,62,92,.10),
    0 16px 40px -26px rgba(46,62,92,.22);
  --shadow-lift:
    0 1px 0 rgba(255,255,255,.85) inset,
    0 6px 16px -8px rgba(46,62,92,.16),
    0 40px 72px -40px rgba(46,62,92,.30);

  /* ── spacing scale ──────────────────────────────────────── */
  --s-1:.5rem; --s-2:1rem; --s-3:1.5rem; --s-4:2rem; --s-6:3rem; --s-8:5rem;

  color:var(--text);
  background:transparent; /* show the app-wide AmbientBackground through the glass */
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Inter",system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;
  letter-spacing:-.011em;
  position:relative;
  min-height:100vh;
  overflow-x:hidden;
}
.halo *{ box-sizing:border-box; }

/* ── ambient background: enormous, near-invisible blurred glows ── */
.halo .ambient{ position:fixed; inset:0; z-index:0; pointer-events:none; overflow:hidden; }
.halo .blob{ position:absolute; border-radius:50%; filter:blur(130px); }
.halo .blob.a{ width:760px; height:760px; top:-220px; left:-160px;
  background:radial-gradient(circle, rgba(169,245,255,.40), transparent 68%); }
.halo .blob.b{ width:820px; height:820px; top:8%; right:-260px;
  background:radial-gradient(circle, rgba(229,216,255,.38), transparent 68%); }
.halo .blob.c{ width:720px; height:720px; bottom:-280px; left:18%;
  background:radial-gradient(circle, rgba(255,221,244,.32), transparent 68%); }
.halo .blob.d{ width:600px; height:600px; bottom:6%; right:6%;
  background:radial-gradient(circle, rgba(200,255,216,.26), transparent 68%); }

.halo .content{ position:relative; z-index:1; }
.halo .container{ max-width:1300px; margin:0 auto; padding:0 clamp(1.25rem,4vw,2.5rem); }
.halo section{ padding-block:clamp(5rem,10vw,8.5rem); }

/* ── glass primitive ────────────────────────────────────── */
.halo .glass{
  position:relative;
  /* Inherent frost: a faint translucent gradient + cool tint so the card reads
     as glass even where backdrop-filter is unavailable (iOS Safari does not blur
     a fixed negative-z backdrop, which otherwise made mobile cards flat white).
     On capable browsers backdrop-filter blurs the ambient orbs on top of this. */
  background:
    linear-gradient(135deg, rgba(255,255,255,.30), rgba(247,250,253,.14)),
    radial-gradient(135% 135% at 0% 0%, rgba(200,238,255,.12), transparent 58%),
    var(--card);
  -webkit-backdrop-filter:blur(var(--blur)) saturate(var(--sat));
  backdrop-filter:blur(var(--blur)) saturate(var(--sat));
  border:1px solid var(--border);
  border-radius:var(--r-card);
  box-shadow:var(--shadow-soft);
  transition:transform var(--d) var(--ease), box-shadow var(--d) var(--ease),
             border-color var(--d) var(--ease), backdrop-filter var(--d) var(--ease),
             --lop 240ms var(--ease);
}
/* soft top highlight */
.halo .glass::before{
  content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none;
  background:linear-gradient(180deg, rgba(255,255,255,.55), rgba(255,255,255,0) 36%);
  opacity:.75;
}
/* faint iridescent edge reflection - almost invisible */
.halo .glass::after{
  content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none;
  background:
    radial-gradient(110% 80% at 0% 0%, rgba(200,238,255,.16), transparent 42%),
    radial-gradient(110% 80% at 100% 0%, rgba(229,216,255,.14), transparent 44%),
    radial-gradient(130% 90% at 100% 100%, rgba(255,221,244,.10), transparent 48%);
  opacity:.6;
  transition:opacity var(--d) var(--ease);
}
/* pointer-tracked specular light - refraction changes with light */
.halo .glass-light::after{
  background:
    radial-gradient(340px 280px at var(--mx,50%) var(--my,50%),
      rgba(255,255,255, calc(.95 * var(--lop,0))),
      rgba(175,245,255, calc(.50 * var(--lop,0))) 32%,
      rgba(229,216,255, calc(.18 * var(--lop,0))) 54%,
      transparent 70%),
    radial-gradient(110% 80% at 0% 0%, rgba(200,238,255,.16), transparent 42%),
    radial-gradient(110% 80% at 100% 0%, rgba(229,216,255,.14), transparent 44%),
    radial-gradient(130% 90% at 100% 100%, rgba(255,221,244,.10), transparent 48%);
  opacity:1;
}
.halo .glass-hover{ cursor:default; }
.halo .glass-hover:hover{
  transform:translateY(-3px) scale(1.01);
  box-shadow:var(--shadow-lift);
  border-color:rgba(255,255,255,.88);
  -webkit-backdrop-filter:blur(var(--blur-hi)) saturate(172%);
  backdrop-filter:blur(var(--blur-hi)) saturate(172%);
}

/* ── button primitive ───────────────────────────────────── */
.halo .btn{
  position:relative; font:inherit; font-size:1rem; font-weight:500; cursor:pointer;
  display:inline-flex; align-items:center; gap:.5rem;
  padding:.85rem 1.45rem; border-radius:var(--r-btn);
  color:var(--text); border:1px solid var(--border);
  background:var(--card-strong);
  -webkit-backdrop-filter:blur(20px) saturate(var(--sat));
  backdrop-filter:blur(20px) saturate(var(--sat));
  box-shadow:var(--shadow-soft);
  transition:transform var(--d) var(--ease), box-shadow var(--d) var(--ease),
             border-color var(--d) var(--ease);
  letter-spacing:-.011em; overflow:hidden;
}
.halo .btn::after{
  content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none;
  background:
    linear-gradient(180deg, rgba(255,255,255,.5), transparent 42%),
    radial-gradient(120% 130% at 50% 130%, rgba(169,245,255,0), transparent 60%);
  transition:background var(--d) var(--ease);
}
.halo .btn:hover{ transform:translateY(-2px); box-shadow:var(--shadow-lift); border-color:rgba(255,255,255,.92); }
.halo .btn:hover::after{
  background:
    linear-gradient(180deg, rgba(255,255,255,.62), transparent 42%),
    radial-gradient(120% 150% at 50% 132%, rgba(169,245,255,.5), transparent 62%);
}
.halo .btn:active{ transform:translateY(0) scale(.995); }
.halo .btn.ghost{ background:transparent; border-color:transparent; box-shadow:none; }
.halo .btn.ghost::after{ display:none; }
.halo .btn.ghost:hover{ background:var(--card); border-color:var(--border); box-shadow:var(--shadow-soft); }

/* ── input primitive ────────────────────────────────────── */
.halo .input{
  width:100%; font:inherit; font-size:1rem; color:var(--text);
  padding:.95rem 1.15rem; border-radius:var(--r-input);
  border:1px solid var(--border); background:var(--card);
  -webkit-backdrop-filter:blur(20px) saturate(150%);
  backdrop-filter:blur(20px) saturate(150%);
  box-shadow:var(--shadow-soft);
  transition:border-color var(--d) var(--ease), box-shadow var(--d) var(--ease);
}
.halo .input::placeholder{ color:var(--muted); }
.halo .input:focus{
  outline:none; border-color:rgba(169,245,255,.75);
  box-shadow:var(--shadow-soft), 0 0 0 4px rgba(169,245,255,.20);
}
.halo .btn:focus-visible, .halo a:focus-visible, .halo .input:focus-visible{
  outline:none; box-shadow:var(--shadow-soft), 0 0 0 4px rgba(169,245,255,.32);
}

/* ── scroll reveal ──────────────────────────────────────── */
.halo .reveal{ opacity:0; transform:translateY(18px);
  transition:opacity var(--d-slow) var(--ease), transform var(--d-slow) var(--ease);
  will-change:opacity, transform; }
.halo .reveal.in{ opacity:1; transform:none; }

/* ── typography ─────────────────────────────────────────── */
.halo .eyebrow{ font-size:.78rem; letter-spacing:.2em; text-transform:uppercase;
  color:var(--muted); font-weight:500; }
.halo h1.hero{ font-size:clamp(2.7rem,6.4vw,4.5rem); line-height:1.04; font-weight:500;
  letter-spacing:-.035em; margin:0; }
.halo h2.section{ font-size:clamp(1.95rem,3.8vw,2.35rem); line-height:1.12; font-weight:500;
  letter-spacing:-.025em; margin:0; }
.halo h3.cardt{ font-size:1.375rem; font-weight:500; letter-spacing:-.015em; margin:0; }
.halo .lead{ font-size:clamp(1.05rem,1.5vw,1.22rem); color:var(--muted); line-height:1.6;
  font-weight:400; }
.halo .body{ font-size:1.0625rem; color:var(--muted); line-height:1.62; }

/* ── nav ────────────────────────────────────────────────── */
.halo .nav{ position:sticky; top:0; z-index:50; padding-top:1rem; }
.halo .navbar{ display:flex; align-items:center; justify-content:space-between;
  padding:.6rem .7rem .6rem 1.1rem; border-radius:var(--r-pill); }
.halo .brand{ display:flex; align-items:center; gap:.6rem; font-weight:600;
  letter-spacing:-.02em; font-size:1.05rem; }
.halo .brand .dot{ width:24px; height:24px; border-radius:50%;
  background:radial-gradient(60% 60% at 35% 30%, #fff, rgba(255,255,255,.4) 50%, transparent 72%),
    radial-gradient(120% 120% at 70% 80%, rgba(200,238,255,.9), transparent 60%),
    radial-gradient(120% 120% at 20% 80%, rgba(229,216,255,.7), transparent 60%), rgba(255,255,255,.6);
  box-shadow:0 1px 0 rgba(255,255,255,.9) inset, 0 4px 10px -4px rgba(46,62,92,.4); }
.halo .navlinks{ display:flex; align-items:center; gap:.4rem; }
.halo .navlinks a{ color:var(--muted); text-decoration:none; font-size:.95rem; font-weight:450;
  padding:.5rem .85rem; border-radius:var(--r-pill); transition:color var(--d) var(--ease),
  background var(--d) var(--ease); }
.halo .navlinks a:hover{ color:var(--text); background:rgba(255,255,255,.45); }
.halo .navcta{ display:flex; align-items:center; gap:.4rem; }

/* ── hero ───────────────────────────────────────────────── */
.halo .hero-wrap{ display:grid; grid-template-columns:1.05fr .95fr; gap:clamp(2rem,5vw,4rem);
  align-items:center; padding-top:clamp(3rem,6vw,5rem); }
.halo .hero-copy{ display:flex; flex-direction:column; gap:1.5rem; max-width:34ch; }
.halo .hero-actions{ display:flex; gap:.8rem; flex-wrap:wrap; margin-top:.4rem; }

/* hero glass disc */
.halo .stage{ position:relative; display:grid; place-items:center; min-height:440px; }
.halo .disc-glow{ position:absolute; width:min(560px,84vw); aspect-ratio:1; border-radius:50%;
  filter:blur(60px);
  background:radial-gradient(circle, rgba(200,238,255,.5), rgba(229,216,255,.32) 45%, transparent 70%); }
.halo .disc-parallax{ position:relative; transition:transform 500ms var(--ease); will-change:transform; }
.halo .disc{ position:relative; width:min(420px,72vw); aspect-ratio:1; border-radius:50%;
  border:1px solid var(--border);
  -webkit-backdrop-filter:blur(30px) saturate(165%); backdrop-filter:blur(30px) saturate(165%);
  background:
    radial-gradient(58% 58% at 38% 30%, rgba(255,255,255,.92), rgba(255,255,255,.22) 46%, transparent 70%),
    radial-gradient(120% 120% at 72% 76%, rgba(200,238,255,.55), transparent 56%),
    radial-gradient(120% 120% at 24% 80%, rgba(229,216,255,.42), transparent 56%),
    radial-gradient(120% 120% at 82% 22%, rgba(255,221,244,.34), transparent 56%),
    rgba(255,255,255,.5);
  box-shadow:
    0 1px 0 rgba(255,255,255,.9) inset,
    0 12px 30px -14px rgba(80,110,150,.22),
    0 40px 90px -34px rgba(80,110,150,.4);
  transform:translateZ(0); will-change:transform;
  animation:float 9s var(--ease) infinite; }
.halo .disc .sheen{ position:absolute; inset:-2px; border-radius:50%; pointer-events:none;
  background:conic-gradient(from 200deg, transparent, rgba(255,255,255,.5), transparent 30%,
    rgba(200,238,255,.35), transparent 55%);
  opacity:.25; animation:spin 28s linear infinite; mix-blend-mode:screen; }
.halo .disc .core{ position:absolute; inset:0; margin:auto; width:34%; aspect-ratio:1; border-radius:50%;
  background:radial-gradient(circle, rgba(255,255,255,.95), rgba(255,255,255,.3) 60%, transparent 75%);
  filter:blur(6px); animation:breathe 6s ease-in-out infinite; }
.halo .disc .glare{ position:absolute; inset:0; border-radius:50%; pointer-events:none; mix-blend-mode:screen;
  background:radial-gradient(150px 150px at var(--gx,38%) var(--gy,32%),
    rgba(255,255,255,.9), rgba(175,245,255,.45) 38%, transparent 72%);
  transition:background 140ms linear; }

@keyframes float{ 0%,100%{ transform:translateY(0) } 50%{ transform:translateY(-14px) } }
@keyframes spin{ to{ transform:rotate(360deg) } }
@keyframes breathe{ 0%,100%{ opacity:.65; transform:scale(.97) } 50%{ opacity:1; transform:scale(1.03) } }

/* ── feature grid ───────────────────────────────────────── */
.halo .section-head{ display:flex; flex-direction:column; gap:1rem; max-width:46ch; margin-bottom:3rem; }
.halo .grid-3{ display:grid; grid-template-columns:repeat(3,1fr); gap:1.5rem; }
.halo .feature{ padding:2.1rem 2rem; display:flex; flex-direction:column; gap:1.1rem; }
.halo .ico{ width:50px; height:50px; border-radius:16px; display:grid; place-items:center;
  color:var(--text);
  background:var(--card-strong); border:1px solid var(--border);
  box-shadow:0 1px 0 rgba(255,255,255,.8) inset, 0 8px 18px -12px rgba(46,62,92,.3); }
.halo .feature p{ margin:0; }

/* ── quiet statement ────────────────────────────────────── */
.halo .quiet{ text-align:center; display:flex; flex-direction:column; align-items:center; gap:1.2rem; }
.halo .quiet h2{ font-size:clamp(2.2rem,5vw,3.4rem); font-weight:500; letter-spacing:-.035em;
  line-height:1.08; max-width:18ch; }
.halo .quiet .lead{ max-width:42ch; }
.halo .meta-row{ display:flex; gap:1.5rem; flex-wrap:wrap; justify-content:center; margin-top:1.5rem; }
.halo .meta{ padding:1.4rem 1.8rem; min-width:180px; text-align:left; }
.halo .meta .n{ font-size:1.9rem; font-weight:500; letter-spacing:-.03em; }
.halo .meta .l{ font-size:.85rem; color:var(--muted); margin-top:.25rem; letter-spacing:.02em; }

/* ── testimonial ────────────────────────────────────────── */
.halo .quote{ max-width:780px; margin:0 auto; padding:3rem clamp(2rem,5vw,3.5rem); text-align:center; }
.halo .quote p{ font-size:clamp(1.3rem,2.6vw,1.7rem); line-height:1.45; font-weight:400;
  letter-spacing:-.02em; margin:0 0 1.6rem; }
.halo .quote .who{ color:var(--muted); font-size:.95rem; }

/* ── waitlist ───────────────────────────────────────────── */
.halo .waitlist{ max-width:680px; margin:0 auto; padding:clamp(2.4rem,5vw,3.4rem); text-align:center;
  border-radius:var(--r-hero); display:flex; flex-direction:column; align-items:center; gap:1.4rem; }
.halo .waitform{ display:flex; gap:.7rem; width:100%; max-width:460px; }
.halo .waitform .input{ flex:1; }
.halo .thanks{ display:flex; align-items:center; gap:.6rem; color:var(--text); font-weight:500;
  font-size:1.05rem; }
.halo .thanks .check{ width:34px; height:34px; border-radius:50%; display:grid; place-items:center;
  background:var(--card-strong); border:1px solid var(--border);
  box-shadow:0 1px 0 rgba(255,255,255,.8) inset, 0 0 0 4px rgba(200,255,216,.35); }

/* ── footer ─────────────────────────────────────────────── */
.halo footer{ padding-block:3.5rem; }
.halo .foot{ display:flex; align-items:center; justify-content:space-between; gap:1.5rem;
  flex-wrap:wrap; padding-top:2.2rem; border-top:1px solid rgba(111,118,132,.14); }
.halo .foot .links{ display:flex; gap:1.4rem; flex-wrap:wrap; }
.halo .foot a{ color:var(--muted); text-decoration:none; font-size:.9rem; transition:color var(--d) var(--ease); }
.halo .foot a:hover{ color:var(--text); }
.halo .foot .copy{ color:var(--muted); font-size:.85rem; }

/* ── responsive ─────────────────────────────────────────── */
@media (max-width:900px){
  .halo .hero-wrap{ grid-template-columns:1fr; text-align:center; }
  .halo .hero-copy{ max-width:none; align-items:center; }
  .halo .hero-actions{ justify-content:center; }
  .halo .stage{ order:-1; min-height:340px; }
  .halo .grid-3{ grid-template-columns:1fr; }
  .halo .navlinks{ display:none; }
  .halo .section-head{ margin-bottom:2.2rem; }
}
@media (max-width:520px){
  .halo .waitform{ flex-direction:column; }
}

/* ── accessibility: respect reduced transparency ────────── */
@media (prefers-reduced-transparency:reduce){
  .halo .ambient{ display:none; }
  .halo .glass, .halo .btn, .halo .input, .halo .navbar, .halo .disc{
    background:rgba(255,255,255,.97) !important;
    -webkit-backdrop-filter:none !important; backdrop-filter:none !important;
  }
  .halo .glass::after, .halo .glass-light::after, .halo .disc .sheen{ opacity:.2; }
}

/* ── accessibility: respect reduced motion ──────────────── */
@media (prefers-reduced-motion:reduce){
  .halo .disc, .halo .disc .sheen, .halo .disc .core,
  .halo .disc-parallax{ animation:none !important; transform:none !important; }
  .halo .reveal{ opacity:1 !important; transform:none !important; }
  .halo *{ transition-duration:.001ms !important; }
}
`;
