import { useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { useSession } from "./auth";
import { haloCss } from "../design-system/halo";
import { useT, LanguageSwitcher } from "./i18n";
import { clearNativeSession } from "./nativeSession";

const NAV: { to: string; label: string }[] = [
  { to: "/app", label: "Dashboard" },
  { to: "/app/builder", label: "Builder" },
  { to: "/app/members", label: "Members" },
  { to: "/app/staff", label: "Staff" },
  { to: "/app/issue", label: "Issue" },
  { to: "/app/scan", label: "Scan" },
  { to: "/support", label: "Support" },
];

// Mobile: a 5-item native-style bottom tab bar (the daily-driver sections).
const ICONS: Record<string, ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5M5 9.5V20h14V9.5" />,
  card: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M3 9.5h18" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6.5a3 3 0 0 1 0 5.8M20.5 19a5 5 0 0 0-3-4.5" />
    </>
  ),
  ticket: (
    <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H6a2 2 0 0 1-2-2 2 2 0 0 0 0-4ZM14 6v12" />
  ),
  scan: (
    <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M4 12h16" />
  ),
};
const TABS = [
  { to: "/app", label: "Home", icon: "home" },
  { to: "/app/builder", label: "Cards", icon: "card" },
  { to: "/app/members", label: "Members", icon: "users" },
  { to: "/app/issue", label: "Issue", icon: "ticket" },
  { to: "/app/scan", label: "Scan", icon: "scan" },
];
const MORE = [
  { to: "/app/staff", label: "Staff" },
  { to: "/support", label: "Support" },
];

const shellCss = `
.lvt-mobilehead, .lvt-tabbar { display: none; }
.lvt-shell { min-height: 100vh; min-height: 100dvh; background: transparent; }
/* Narrow pages (forms/lists): title + content share one centered column. */
.lvt-narrow { max-width: 600px; margin: 0 auto; }
/* App <section> must not inherit the landing page's huge padding-block
   (.halo section, ~136px) — that leaked giant gaps into Analytics/Issue. */
.halo .lvt-main section { padding-block: 0; }
/* Grid children must be allowed to shrink, else min-width'd cards (.meta 180px)
   overflow narrow mobile columns and "leak" past the container. */
.halo .grid-2 > *, .halo .grid-3 > * { min-width: 0; }
.lvt-main { animation:lvtPageIn .28s cubic-bezier(.2,.8,.2,1) both; will-change:opacity, transform; }
@keyframes lvtPageIn { from { opacity:.001; transform:translate3d(0, 10px, 0) scale(.996); filter:blur(3px); } to { opacity:1; transform:none; filter:none; } }
.lvt-more-menu { position: absolute; top: calc(100% + 6px); right: 0; min-width: 168px;
  background: linear-gradient(180deg, rgba(255,255,255,.72), rgba(255,255,255,.55)), rgba(255,255,255,.40);
  -webkit-backdrop-filter: blur(20px) saturate(180%); backdrop-filter: blur(20px) saturate(180%);
  border:1px solid rgba(255,255,255,.6); border-radius:14px; box-shadow:0 16px 40px -16px rgba(16,18,27,.40);
  padding:.3rem; z-index:60; animation:lvtPop .14s ease-out both; }
.lvt-more-menu a, .lvt-more-menu button { display:block; width:100%; text-align:left; padding:.6rem .7rem;
  border:0; background:transparent; border-radius:9px; font:inherit; font-size:.92rem; color:var(--text); text-decoration:none; cursor:pointer; }
.lvt-more-menu a:hover, .lvt-more-menu button:hover { background:rgba(140,200,230,.20); }
.lvt-mobile-more { position:relative; }
.lvt-mobile-morebtn { width:40px; height:40px; border-radius:12px; border:1px solid rgba(255,255,255,.64);
  background:rgba(255,255,255,.44); -webkit-backdrop-filter:blur(14px) saturate(160%);
  backdrop-filter:blur(14px) saturate(160%); color:var(--text); display:grid; place-items:center;
  cursor:pointer; box-shadow:0 1px 0 rgba(255,255,255,.78) inset, 0 8px 18px -14px rgba(46,62,92,.34); }
.lvt-mobile-morebtn:focus-visible { outline:none; box-shadow:var(--shadow-soft), 0 0 0 4px rgba(169,245,255,.32); }
@media (max-width: 767px) {
  .lvt-shell {
    background:
      radial-gradient(760px 520px at -18% -12%, rgba(169,245,255,.36), transparent 64%),
      radial-gradient(720px 520px at 112% 10%, rgba(255,221,244,.34), transparent 68%),
      radial-gradient(680px 520px at 40% 112%, rgba(229,216,255,.30), transparent 70%);
  }
  .lvt-topnav { display: none !important; }
  .lvt-mobilehead { display: flex; align-items:center; justify-content:space-between; gap:.75rem;
    position: sticky; top: 0; z-index: 40; width:100%;
    padding: calc(.55rem + env(safe-area-inset-top, 0px)) .9rem .62rem;
    border-radius: 0;
    background:
      linear-gradient(135deg, rgba(255,255,255,.30), rgba(247,250,253,.14)),
      radial-gradient(135% 135% at 0% 0%, rgba(200,238,255,.12), transparent 58%),
      var(--card);
    -webkit-backdrop-filter: blur(20px) saturate(var(--sat));
    backdrop-filter: blur(20px) saturate(var(--sat));
    border:1px solid var(--border); border-top:0; border-left:0; border-right:0;
    box-shadow:0 1px 0 rgba(255,255,255,.72) inset, 0 10px 30px -24px rgba(46,62,92,.38); }
  .lvt-mobilehead::before { content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none;
    background:linear-gradient(180deg, rgba(255,255,255,.55), rgba(255,255,255,0) 36%); opacity:.75; }
  .lvt-mobilehead::after { content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none;
    background:
      radial-gradient(110% 80% at 0% 0%, rgba(200,238,255,.16), transparent 42%),
      radial-gradient(110% 80% at 100% 0%, rgba(229,216,255,.14), transparent 44%),
      radial-gradient(130% 90% at 100% 100%, rgba(255,221,244,.10), transparent 48%);
    opacity:.6; }
  .lvt-mobilehead > * { position:relative; z-index:1; }
  .lvt-mobilehead .brand { min-width: 0; min-height:44px; }
  .lvt-mobilehead .brand .dot { width:30px; height:30px; border-radius:9px; }
  .lvt-mobilehead .brand span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .lvt-main { padding-top: 1.15rem !important; padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px)) !important; min-width: 0; animation-duration:.36s; }
  .lvt-main.lvt-no-tabs { padding-bottom: calc(1.25rem + env(safe-area-inset-bottom, 0px)) !important; }
  .lvt-tabbar { display: flex; align-items:flex-start; position: fixed; left: 0; right: 0; bottom: 0; z-index: 50;
    height: calc(54px + env(safe-area-inset-bottom, 0px));
    padding: .18rem .45rem env(safe-area-inset-bottom, 0px);
    border-radius: 0;
    background:
      linear-gradient(135deg, rgba(255,255,255,.30), rgba(247,250,253,.14)),
      radial-gradient(135% 135% at 0% 0%, rgba(200,238,255,.12), transparent 58%),
      var(--card);
    -webkit-backdrop-filter: blur(20px) saturate(var(--sat));
    backdrop-filter: blur(20px) saturate(var(--sat));
    border: 1px solid var(--border); border-bottom: 0; border-left:0; border-right:0;
    box-shadow: 0 -1px 0 rgba(255,255,255,.72) inset, 0 -10px 30px -22px rgba(46,62,92,.42);
    overflow:hidden; transform: translateZ(0); }
  .lvt-tabbar::before { content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none;
    background:linear-gradient(180deg, rgba(255,255,255,.55), rgba(255,255,255,0) 42%); opacity:.75; }
  .lvt-tabbar::after { content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none;
    background:
      radial-gradient(110% 80% at 0% 0%, rgba(200,238,255,.16), transparent 42%),
      radial-gradient(110% 80% at 100% 0%, rgba(229,216,255,.14), transparent 44%),
      radial-gradient(130% 90% at 100% 100%, rgba(255,221,244,.10), transparent 48%);
    opacity:.6; }
  .lvt-tab { flex:1; height:50px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px;
    color: var(--muted,#6F7684); text-decoration:none; font-size:.61rem; font-weight:500; padding:.22rem 0 .16rem;
    border-radius:16px; -webkit-tap-highlight-color: transparent; position:relative; z-index:1;
    transition:color .28s var(--ease), transform .28s var(--ease); }
  .lvt-tab::before { content:""; position:absolute; inset:.22rem .18rem .18rem; border-radius:15px; opacity:0;
    background:
      linear-gradient(135deg, rgba(255,255,255,.74), rgba(255,255,255,.40)),
      radial-gradient(120% 135% at 18% 0%, rgba(169,245,255,.36), transparent 54%),
      radial-gradient(125% 120% at 100% 100%, rgba(255,221,244,.34), transparent 58%),
      radial-gradient(120% 90% at 72% 0%, rgba(229,216,255,.26), transparent 54%);
    border:1px solid rgba(255,255,255,.86);
    -webkit-backdrop-filter: blur(18px) saturate(170%);
    backdrop-filter: blur(18px) saturate(170%);
    box-shadow:
      0 1px 0 rgba(255,255,255,.92) inset,
      0 10px 18px -16px rgba(46,62,92,.46);
    transform:scale(.92) translateY(3px);
    transition:opacity .28s var(--ease), transform .28s var(--ease), border-color .28s var(--ease); }
  .lvt-tab::after { content:""; position:absolute; left:50%; top:.36rem; width:18px; height:2px; border-radius:999px;
    background:linear-gradient(90deg, rgba(169,245,255,.82), rgba(255,255,255,.94), rgba(255,221,244,.78));
    opacity:0; transform:translateX(-50%) scaleX(.55); transition:opacity .28s var(--ease), transform .28s var(--ease); }
  .lvt-tab.active {
    color:var(--text);
  }
  .lvt-tab.active::before { opacity:1; transform:scale(1) translateY(0); }
  .lvt-tab.active::after { opacity:.95; transform:translateX(-50%) scaleX(1); }
  .lvt-tab:active { transform:scale(.98); }
  .lvt-tab svg { width:22px; height:22px; transition:transform .28s var(--ease), stroke-width .28s var(--ease); position:relative; z-index:1; }
  .lvt-tab svg + * { position:relative; z-index:1; }
  .lvt-tab.active svg {
    transform:translateY(-1px) scale(1.07);
    stroke-width:2.1;
  }
  /* Keyboard up: a fixed bottom bar pins just above the keyboard and covers the
     focused field. Native apps hide the tab bar while typing — do the same, and
     reclaim the 80px it reserved so the form isn't padded for a bar that's gone.
     Scoped to text-entry fields so non-keyboard controls (range/color/checkbox)
     don't flicker the bar. */
  .halo:has(textarea:focus, [contenteditable]:focus, input:focus:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="button"]):not([type="submit"]):not([type="file"])) .lvt-tabbar { display: none; }
  .halo:has(textarea:focus, [contenteditable]:focus, input:focus:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="button"]):not([type="submit"]):not([type="file"])) .lvt-main { padding-bottom: calc(1.25rem + env(safe-area-inset-bottom, 0px)) !important; }
}
@media (prefers-reduced-motion: reduce){
  .lvt-more-menu, .lvt-main { animation:none !important; }
  .lvt-tab, .lvt-tab svg { transition:none !important; filter:none !important; }
}
/* Accessibility: opaque fallback when the user asks for reduced transparency. */
@media (prefers-reduced-transparency: reduce){
  .lvt-mobilehead, .lvt-tabbar, .lvt-more-menu {
    background: rgba(255,255,255,.96) !important;
    -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
}
`;

/** Authenticated-app shell. Desktop: top glass nav. Mobile: slim header + a
 *  native-style bottom tab bar (App-Store-friendly), safe-area aware. */
export function AppShell({
  title,
  children,
  narrow,
}: {
  title?: string;
  children: ReactNode;
  /** Constrain title + content to one centered column (forms/lists), so the
   *  heading lines up with the content instead of floating at the page edge. */
  narrow?: boolean;
}) {
  const nav = useNavigate();
  const loc = useLocation();
  const qc = useQueryClient();
  const { t } = useT();
  const { data: session } = useSession();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const showMobileTabs = Boolean(session);

  // The platform super-admin gets an extra cross-tenant "Admin" entry.
  const ADMIN_LINK = { to: "/admin", label: "Admin" };
  const navLinks = session?.isAdmin ? [...NAV, ADMIN_LINK] : NAV;
  const moreLinks = session?.isAdmin ? [...MORE, ADMIN_LINK] : MORE;
  const logout = useMutation({
    mutationFn: () => api.post("/api/v1/auth/logout"),
    onSettled: () => {
      clearNativeSession();
      qc.clear();
      nav("/login");
    },
  });
  const active = (to: string) =>
    to === "/app" ? loc.pathname === "/app" : loc.pathname.startsWith(to);
  return (
    <div className="halo lvt-shell">
      <style>{haloCss}</style>
      <style>{shellCss}</style>
      <div className="content">
        {/* Desktop top nav */}
        <header className="nav lvt-topnav">
          <div className="container">
            <nav className="glass navbar" aria-label="App">
              <Link to="/app" className="brand" style={{ textDecoration: "none" }}>
                <span className="dot" aria-hidden="true" /> Lovalte
              </Link>
              <div className="navlinks">
                {navLinks.map((n) => (
                  <Link key={n.to} to={n.to}>
                    {t(n.label)}
                  </Link>
                ))}
              </div>
              <div className="navcta" style={{ gap: ".6rem" }}>
                <LanguageSwitcher />
                <button
                  className="btn ghost"
                  onClick={() => logout.mutate()}
                  aria-label={t("Log out")}
                >
                  {t("Log out")}
                </button>
              </div>
            </nav>
          </div>
        </header>

        {/* Mobile slim header */}
        <header className="lvt-mobilehead">
          <Link
            to="/app"
            className="brand"
            style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: ".5rem" }}
          >
            <span className="dot" aria-hidden="true" />
            <span style={{ fontWeight: 600, color: "var(--text)" }}>Lovalte</span>
          </Link>
          <div className="lvt-mobile-more">
            <button
              ref={moreTriggerRef}
              type="button"
              className="lvt-mobile-morebtn"
              aria-label={t("More")}
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((o) => !o)}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <circle cx="5" cy="12" r="1.8" />
                <circle cx="12" cy="12" r="1.8" />
                <circle cx="19" cy="12" r="1.8" />
              </svg>
            </button>
            {moreOpen && (
              <>
                <div
                  onClick={() => setMoreOpen(false)}
                  style={{ position: "fixed", inset: 0, zIndex: 55 }}
                />
                {/* Plain link list (no role="menu" — that ARIA pattern needs full
                    arrow-key roving which we don't implement; Tab + Escape is enough). */}
                <div
                  className="lvt-more-menu"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setMoreOpen(false);
                      moreTriggerRef.current?.focus();
                    }
                  }}
                >
                  {moreLinks.map((m) => (
                    <Link key={m.to} to={m.to} onClick={() => setMoreOpen(false)}>
                      {t(m.label)}
                    </Link>
                  ))}
                  <div style={{ padding: ".45rem .6rem" }}>
                    <LanguageSwitcher />
                  </div>
                  <button
                    onClick={() => {
                      setMoreOpen(false);
                      logout.mutate();
                    }}
                  >
                    {t("Log out")}
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        <main
          className={`container lvt-rise lvt-main${showMobileTabs ? "" : " lvt-no-tabs"}`}
          style={{ paddingTop: "1.25rem", paddingBottom: "5rem" }}
        >
          <div className={narrow ? "lvt-narrow" : undefined}>
            {title ? (
              <h1
                className="cardt"
                style={{
                  margin: "0 0 1.1rem",
                  fontSize: "clamp(1.2rem, 1rem + 1vw, 1.5rem)",
                  fontWeight: 600,
                  letterSpacing: "-0.015em",
                  textAlign: narrow ? "center" : undefined,
                }}
              >
                {title}
              </h1>
            ) : null}
            {children}
          </div>
        </main>

        {/* Mobile bottom tab bar */}
        {showMobileTabs && (
          <nav className="lvt-tabbar" aria-label="Primary">
            {TABS.map((tab) => (
              <Link
                key={tab.to}
                to={tab.to}
                className={`lvt-tab${active(tab.to) ? " active" : ""}`}
                aria-current={active(tab.to) ? "page" : undefined}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {ICONS[tab.icon]}
                </svg>
                {t(tab.label)}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
