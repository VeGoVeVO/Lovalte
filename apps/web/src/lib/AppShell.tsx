import { useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { haloCss } from "../design-system/halo";
import { useT, LanguageSwitcher } from "./i18n";

const NAV: { to: string; label: string }[] = [
  { to: "/app", label: "Dashboard" },
  { to: "/app/builder", label: "Builder" },
  { to: "/app/members", label: "Members" },
  { to: "/app/staff", label: "Staff" },
  { to: "/app/issue", label: "Issue" },
  { to: "/app/scan", label: "Scan" },
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
const MORE = [{ to: "/app/staff", label: "Staff" }];

const shellCss = `
.lvt-mobilehead, .lvt-tabbar { display: none; }
/* Grid children must be allowed to shrink, else min-width'd cards (.meta 180px)
   overflow narrow mobile columns and "leak" past the container. */
.halo .grid-2 > *, .halo .grid-3 > * { min-width: 0; }
.lvt-more-menu { position: absolute; top: calc(100% + 6px); right: 0; min-width: 168px;
  background: linear-gradient(180deg, rgba(255,255,255,.72), rgba(255,255,255,.55)), rgba(255,255,255,.40);
  -webkit-backdrop-filter: blur(20px) saturate(180%); backdrop-filter: blur(20px) saturate(180%);
  border:1px solid rgba(255,255,255,.6); border-radius:14px; box-shadow:0 16px 40px -16px rgba(16,18,27,.40);
  padding:.3rem; z-index:60; animation:lvtPop .14s ease-out both; }
.lvt-more-menu a, .lvt-more-menu button { display:block; width:100%; text-align:left; padding:.6rem .7rem;
  border:0; background:transparent; border-radius:9px; font:inherit; font-size:.92rem; color:var(--text); text-decoration:none; cursor:pointer; }
.lvt-more-menu a:hover, .lvt-more-menu button:hover { background:rgba(140,200,230,.20); }
@media (max-width: 767px) {
  .lvt-topnav { display: none !important; }
  .lvt-mobilehead { display: flex; align-items:center; justify-content:space-between; gap:.75rem;
    position: sticky; top: 0; z-index: 40; padding: calc(.7rem + env(safe-area-inset-top)) 1rem .7rem;
    background: linear-gradient(180deg, rgba(255,255,255,.60), rgba(255,255,255,.40)), rgba(255,255,255,.26);
    -webkit-backdrop-filter: blur(22px) saturate(180%); backdrop-filter: blur(22px) saturate(180%);
    border-bottom:1px solid rgba(255,255,255,.5); box-shadow: 0 1px 0 rgba(255,255,255,.5) inset; }
  .lvt-mobilehead .brand { min-width: 0; }
  .lvt-mobilehead .brand span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .lvt-main { padding-top: 1.25rem !important; padding-bottom: calc(80px + env(safe-area-inset-bottom)) !important; min-width: 0; }
  .lvt-tabbar { display: flex; position: fixed; left: 0; right: 0; bottom: 0; z-index: 50;
    padding-bottom: env(safe-area-inset-bottom);
    background: linear-gradient(180deg, rgba(255,255,255,.48), rgba(255,255,255,.66)), rgba(255,255,255,.26);
    -webkit-backdrop-filter: blur(24px) saturate(185%); backdrop-filter: blur(24px) saturate(185%);
    border-top: 1px solid rgba(255,255,255,.5); box-shadow: 0 -1px 0 rgba(255,255,255,.5) inset, 0 -8px 24px -16px rgba(46,62,92,.22); }
  .lvt-tab { flex:1; min-height:54px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px;
    color: var(--muted,#6F7684); text-decoration:none; font-size:.62rem; font-weight:500; padding:.45rem 0 .3rem;
    -webkit-tap-highlight-color: transparent; }
  .lvt-tab.active { color:#3a86ff; }
  .lvt-tab svg { width:23px; height:23px; }
}
@media (prefers-reduced-motion: reduce){ .lvt-more-menu { animation:none; } }
/* Accessibility: opaque fallback when the user asks for reduced transparency. */
@media (prefers-reduced-transparency: reduce){
  .lvt-mobilehead, .lvt-tabbar, .lvt-more-menu {
    background: rgba(255,255,255,.96) !important;
    -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
}
`;

/** Authenticated-app shell. Desktop: top glass nav. Mobile: slim header + a
 *  native-style bottom tab bar (App-Store-friendly), safe-area aware. */
export function AppShell({ title, children }: { title?: string; children: ReactNode }) {
  const nav = useNavigate();
  const loc = useLocation();
  const qc = useQueryClient();
  const { t } = useT();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const logout = useMutation({
    mutationFn: () => api.post("/api/v1/auth/logout"),
    onSettled: () => {
      qc.clear();
      nav("/login");
    },
  });
  const active = (to: string) =>
    to === "/app" ? loc.pathname === "/app" : loc.pathname.startsWith(to);

  return (
    <div className="halo" style={{ minHeight: "100vh" }}>
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
                {NAV.map((n) => (
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
            <span
              aria-hidden="true"
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: "linear-gradient(135deg,#A9F5FF,#5BA7C9)",
              }}
            />
            <span style={{ fontWeight: 600, color: "var(--text)" }}>Lovalte</span>
          </Link>
          <div style={{ position: "relative" }}>
            <button
              ref={moreTriggerRef}
              type="button"
              aria-label={t("More")}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((o) => !o)}
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,.55)",
                background: "rgba(255,255,255,.5)",
                WebkitBackdropFilter: "blur(14px) saturate(170%)",
                backdropFilter: "blur(14px) saturate(170%)",
                color: "var(--text)",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
              }}
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
                <div
                  className="lvt-more-menu"
                  role="menu"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setMoreOpen(false);
                      moreTriggerRef.current?.focus();
                    }
                  }}
                >
                  {MORE.map((m) => (
                    <Link key={m.to} role="menuitem" to={m.to} onClick={() => setMoreOpen(false)}>
                      {t(m.label)}
                    </Link>
                  ))}
                  <div style={{ padding: ".45rem .6rem" }}>
                    <LanguageSwitcher />
                  </div>
                  <button
                    role="menuitem"
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
          className="container lvt-rise lvt-main"
          style={{ paddingTop: "1.25rem", paddingBottom: "5rem" }}
        >
          {title ? (
            <h1
              className="cardt"
              style={{
                margin: "0 0 1.1rem",
                fontSize: "clamp(1.2rem, 1rem + 1vw, 1.5rem)",
                fontWeight: 600,
                letterSpacing: "-0.015em",
              }}
            >
              {title}
            </h1>
          ) : null}
          {children}
        </main>

        {/* Mobile bottom tab bar */}
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
      </div>
    </div>
  );
}
