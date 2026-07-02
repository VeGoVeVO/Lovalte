import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
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
  { to: "/app/scan", label: "Scan" },
  { to: "/app/settings", label: "Settings" },
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
  settings: (
    <>
      <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .32 1.76l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.76-.32 1.6 1.6 0 0 0-.96 1.46V21a2 2 0 0 1-4 0v-.09a1.6 1.6 0 0 0-1-1.46 1.6 1.6 0 0 0-1.75.32l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.6 1.6 0 0 0 4.6 15a1.6 1.6 0 0 0-1.46-.96H3a2 2 0 0 1 0-4h.09a1.6 1.6 0 0 0 1.46-1 1.6 1.6 0 0 0-.32-1.75l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.6 1.6 0 0 0 1.76.32h.08a1.6 1.6 0 0 0 .96-1.46V3a2 2 0 0 1 4 0v.09a1.6 1.6 0 0 0 .96 1.46h.08a1.6 1.6 0 0 0 1.76-.32l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.32 1.76v.08a1.6 1.6 0 0 0 1.46.96H21a2 2 0 0 1 0 4h-.09a1.6 1.6 0 0 0-1.46.96Z" />
    </>
  ),
};
const TABS = [
  { to: "/app", label: "Home", icon: "home" },
  { to: "/app/builder", label: "Cards", icon: "card" },
  { to: "/app/members", label: "Members", icon: "users" },
  { to: "/app/scan", label: "Scan", icon: "scan" },
  { to: "/app/settings", label: "Settings", icon: "settings" },
];
let lastAnimatedTabPath: string | null = null;

function tabPathFor(pathname: string): string | null {
  if (pathname === "/support" || pathname.startsWith("/app/support")) {
    return "/app/settings";
  }
  const match = TABS.find((tab) =>
    tab.to === "/app" ? pathname === "/app" : pathname.startsWith(tab.to),
  );
  return match?.to ?? null;
}

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
.lvt-main { view-transition-name:lvt-page; contain:layout; }
.lvt-pageview { animation:lvtPageIn .34s cubic-bezier(.22,1,.36,1) both; will-change:opacity, transform, filter; }
@keyframes lvtPageIn { from { opacity:.001; transform:translate3d(0, 12px, 0) scale(.992); filter:blur(4px); } to { opacity:1; transform:none; filter:none; } }
@keyframes lvtPageOut { from { opacity:1; transform:none; filter:none; } to { opacity:.001; transform:translate3d(0, -6px, 0) scale(.998); filter:blur(2px); } }
@supports (view-transition-name: lvt-page) {
  ::view-transition-old(lvt-page) { animation:lvtPageOut .22s cubic-bezier(.4,0,.2,1) both; }
  ::view-transition-new(lvt-page) { animation:lvtPageIn .36s cubic-bezier(.22,1,.36,1) both; }
}
.lvt-titlebar { position:relative; display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:.75rem;
  width:100%; margin:0 0 1.15rem; padding:.72rem .9rem; border-radius:var(--r-lg);
  background:
    linear-gradient(135deg, rgba(255,255,255,.52), rgba(247,250,253,.26)),
    radial-gradient(130% 120% at 0% 0%, rgba(200,238,255,.20), transparent 54%),
    radial-gradient(120% 115% at 100% 100%, rgba(255,221,244,.18), transparent 58%),
    var(--card);
  border:1px solid var(--border);
  -webkit-backdrop-filter:blur(20px) saturate(var(--sat));
  backdrop-filter:blur(20px) saturate(var(--sat));
  box-shadow:var(--shadow-soft); }
.lvt-page-title { grid-column:2; margin:0; text-align:center; font-size:clamp(1.15rem, 1rem + 1vw, 1.45rem);
  font-weight:600; letter-spacing:-0.015em; text-wrap:balance; }
.lvt-title-action { grid-column:3; justify-self:end; min-width:0; display:flex; align-items:center; justify-content:flex-end; }
.lvt-title-spacer { grid-column:1; min-width:0; }
@media (max-width: 767px) {
  .lvt-shell {
    background:
      radial-gradient(760px 520px at -18% -12%, rgba(169,245,255,.36), transparent 64%),
      radial-gradient(720px 520px at 112% 10%, rgba(255,221,244,.34), transparent 68%),
      radial-gradient(680px 520px at 40% 112%, rgba(229,216,255,.30), transparent 70%);
  }
  .lvt-topnav { display: none !important; }
  .lvt-main { padding-top: calc(.85rem + env(safe-area-inset-top, 0px)) !important; padding-bottom: calc(58px + env(safe-area-inset-bottom, 0px)) !important; min-width: 0; }
  .lvt-main.lvt-no-tabs { padding-bottom: calc(1.25rem + env(safe-area-inset-bottom, 0px)) !important; }
  .lvt-titlebar { min-height:58px; padding:.62rem .8rem; border-radius:20px; margin-bottom:1rem;
    grid-template-columns:minmax(52px, 1fr) auto minmax(52px, 1fr); }
  .lvt-page-title { font-size:clamp(1.08rem, 1rem + .5vw, 1.28rem); }
  .lvt-title-action .btn { min-height:42px; padding:.62rem .84rem; }
  .lvt-tabbar { display: flex; align-items:flex-start; position: fixed; left: 0; right: 0; bottom: 0; z-index: 50;
    height: calc(56px + env(safe-area-inset-bottom, 0px));
    padding: .16rem .36rem max(.08rem, env(safe-area-inset-bottom, 0px));
    border-radius: 0;
    background:
      linear-gradient(135deg, rgba(255,255,255,.42), rgba(247,250,253,.22)),
      radial-gradient(130% 120% at 0% 0%, rgba(200,238,255,.22), transparent 54%),
      radial-gradient(120% 115% at 100% 100%, rgba(255,221,244,.18), transparent 58%),
      var(--card);
    -webkit-backdrop-filter: blur(24px) saturate(175%);
    backdrop-filter: blur(24px) saturate(175%);
    border: 1px solid var(--border); border-bottom: 0; border-left:0; border-right:0;
    box-shadow:
      0 1px 1px rgba(255,255,255,.78) inset,
      0 -16px 40px -28px rgba(46,62,92,.45);
    overflow:hidden; transform: translateZ(0); }
  .lvt-tabbar::before { content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none;
    background:linear-gradient(180deg, rgba(255,255,255,.55), rgba(255,255,255,0) 42%); opacity:.75; }
  .lvt-tabbar::after { content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none;
    background:
      radial-gradient(110% 80% at 0% 0%, rgba(200,238,255,.16), transparent 42%),
      radial-gradient(110% 80% at 100% 0%, rgba(229,216,255,.14), transparent 44%),
      radial-gradient(130% 90% at 100% 100%, rgba(255,221,244,.10), transparent 48%);
    opacity:.6; }
  .lvt-tab-indicator { position:absolute; z-index:1; left:.36rem; top:.28rem; width:calc((100% - .72rem) / 5); height:48px;
    border-radius:18px;
    background:
      linear-gradient(145deg, rgba(255,255,255,.92), rgba(255,255,255,.42)),
      radial-gradient(120% 135% at 12% 0%, rgba(169,245,255,.48), transparent 58%),
      radial-gradient(125% 120% at 100% 100%, rgba(255,221,244,.42), transparent 58%),
      radial-gradient(120% 90% at 70% 0%, rgba(200,255,232,.24), transparent 54%);
    border:1px solid rgba(255,255,255,.9);
    box-shadow:
      0 1px 0 rgba(255,255,255,.96) inset,
      0 -1px 0 rgba(42,62,88,.08) inset,
      0 10px 18px -14px rgba(255,255,255,.95),
      0 18px 34px -20px rgba(46,62,92,.68),
      0 6px 14px -12px rgba(49,95,118,.55);
    -webkit-backdrop-filter:blur(18px) saturate(170%);
    backdrop-filter:blur(18px) saturate(170%);
    transform:translateX(calc(var(--active-index, 0) * 100%));
    transition:transform .62s cubic-bezier(.22,1,.36,1), opacity .24s var(--ease);
    pointer-events:none; }
  .lvt-tab { flex:1; height:52px; display:flex; flex-direction:column; align-items:center; justify-content:flex-start; gap:0;
    color:#94A3B8; text-decoration:none; font-size:.66rem; font-weight:650; padding:.28rem 0 0;
    letter-spacing:.01em; -webkit-tap-highlight-color: transparent; position:relative; z-index:1;
    transition:color .62s cubic-bezier(.34,1.56,.64,1), transform .62s cubic-bezier(.34,1.56,.64,1); }
  .lvt-tab:active { transform:scale(.98); }
  .lvt-tab svg { width:25px; height:25px; margin-top:.12rem; transform:none;
    transition:filter .42s var(--ease), stroke-width .42s var(--ease), color .42s var(--ease); position:relative; z-index:1; }
  .lvt-tab-label { position:absolute; bottom:.38rem; transform:translateY(0);
    transition:color .42s var(--ease), text-shadow .42s var(--ease); }
  .lvt-tab.active { color:#315f76; }
  .lvt-tab.active svg {
    filter:drop-shadow(0 4px 10px rgba(77, 140, 168, .42));
    stroke-width:2.35;
  }
  .lvt-tab.active .lvt-tab-label {
    color:#315f76;
    text-shadow:0 5px 12px rgba(120, 190, 210, .34);
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
  .lvt-pageview { animation:none !important; }
  ::view-transition-old(lvt-page), ::view-transition-new(lvt-page) { animation:none !important; }
  .lvt-tab-indicator, .lvt-tab, .lvt-tab svg, .lvt-tab-label { transition:none !important; filter:none !important; }
}
/* Accessibility: opaque fallback when the user asks for reduced transparency. */
@media (prefers-reduced-transparency: reduce){
  .lvt-mobilehead, .lvt-tabbar, .lvt-titlebar {
    background: rgba(255,255,255,.96) !important;
    -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
}
`;

/** Authenticated-app shell. Desktop: top glass nav. Mobile: title card + a
 *  native-style bottom tab bar (App-Store-friendly), safe-area aware. */
export function AppShell({
  title,
  titleAction,
  children,
  narrow,
}: {
  title?: string;
  titleAction?: ReactNode;
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
  const showMobileTabs = Boolean(session);
  const currentTabPath = tabPathFor(loc.pathname);
  const [animatedTabPath, setAnimatedTabPath] = useState<string | null>(
    () => lastAnimatedTabPath ?? currentTabPath,
  );
  const currentTabIndex = Math.max(
    0,
    TABS.findIndex((tab) => tab.to === (animatedTabPath ?? currentTabPath)),
  );

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setAnimatedTabPath(currentTabPath);
      lastAnimatedTabPath = currentTabPath;
    });
    return () => cancelAnimationFrame(frame);
  }, [currentTabPath]);

  // The platform super-admin gets an extra cross-tenant "Admin" entry.
  const ADMIN_LINK = { to: "/admin", label: "Admin" };
  const navLinks = session?.isAdmin ? [...NAV, ADMIN_LINK] : NAV;
  const logout = useMutation({
    mutationFn: () => api.post("/api/v1/auth/logout"),
    onSettled: () => {
      clearNativeSession();
      qc.clear();
      nav("/login");
    },
  });
  const active = (to: string, path: string | null) => path === to;
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
                  <Link key={n.to} to={n.to} viewTransition>
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

        <main
          className={`container lvt-rise lvt-main${showMobileTabs ? "" : " lvt-no-tabs"}`}
          style={{ paddingTop: "1.25rem", paddingBottom: "5rem" }}
        >
          <div className={narrow ? "lvt-narrow" : undefined}>
            <div className="lvt-pageview" key={loc.pathname}>
              {title ? (
                <div className="lvt-titlebar">
                  <span className="lvt-title-spacer" aria-hidden="true" />
                  <h1 className="cardt lvt-page-title">{title}</h1>
                  <div className="lvt-title-action">{titleAction}</div>
                </div>
              ) : null}
              {children}
            </div>
          </div>
        </main>

        {/* Mobile bottom tab bar */}
        {showMobileTabs && (
          <nav
            className="lvt-tabbar"
            aria-label="Primary"
            style={{ "--active-index": currentTabIndex } as CSSProperties}
          >
            <span className="lvt-tab-indicator" aria-hidden="true" />
            {TABS.map((tab) => (
              <Link
                key={tab.to}
                to={tab.to}
                viewTransition
                className={`lvt-tab${active(tab.to, animatedTabPath) ? " active" : ""}`}
                aria-current={active(tab.to, currentTabPath) ? "page" : undefined}
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
                <span className="lvt-tab-label">{t(tab.label)}</span>
              </Link>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
