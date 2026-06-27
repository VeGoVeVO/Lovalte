import { useState, type ReactNode } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { haloCss } from "../design-system/halo";

const NAV: { to: string; label: string }[] = [
  { to: "/app", label: "Dashboard" },
  { to: "/app/builder", label: "Builder" },
  { to: "/app/members", label: "Members" },
  { to: "/app/staff", label: "Staff" },
  { to: "/app/analytics", label: "Analytics" },
  { to: "/app/issue", label: "Issue" },
  { to: "/app/scan", label: "Scan" },
];

// Mobile: a 5-item native-style bottom tab bar (the daily-driver sections).
const ICONS: Record<string, ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5M5 9.5V20h14V9.5" />,
  card: <><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M3 9.5h18" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6.5a3 3 0 0 1 0 5.8M20.5 19a5 5 0 0 0-3-4.5" /></>,
  ticket: <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H6a2 2 0 0 1-2-2 2 2 0 0 0 0-4ZM14 6v12" />,
  scan: <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M4 12h16" />,
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
  { to: "/app/analytics", label: "Analytics" },
];

const shellCss = `
.lvt-mobilehead, .lvt-tabbar { display: none; }
.lvt-more-menu { position: absolute; top: calc(100% + 6px); right: 0; min-width: 160px; background:#fff;
  border:1px solid rgba(20,24,32,.1); border-radius:12px; box-shadow:0 16px 40px -16px rgba(16,18,27,.45);
  padding:.3rem; z-index:60; animation:lvtPop .14s ease-out both; }
.lvt-more-menu a, .lvt-more-menu button { display:block; width:100%; text-align:left; padding:.6rem .7rem;
  border:0; background:transparent; border-radius:8px; font:inherit; font-size:.92rem; color:var(--text); text-decoration:none; cursor:pointer; }
.lvt-more-menu a:hover, .lvt-more-menu button:hover { background:#F0F6FA; }
@media (max-width: 767px) {
  .lvt-topnav { display: none !important; }
  .lvt-mobilehead { display: flex; align-items:center; justify-content:space-between; gap:.75rem;
    position: sticky; top: 0; z-index: 40; padding: calc(.7rem + env(safe-area-inset-top)) 1rem .7rem;
    background: rgba(252,252,253,.82); backdrop-filter: blur(14px); border-bottom:1px solid rgba(20,24,32,.06); }
  .lvt-main { padding-top: 1.25rem !important; padding-bottom: calc(80px + env(safe-area-inset-bottom)) !important; }
  .lvt-tabbar { display: flex; position: fixed; left: 0; right: 0; bottom: 0; z-index: 50;
    padding-bottom: env(safe-area-inset-bottom); background: rgba(255,255,255,.86); backdrop-filter: blur(16px);
    border-top: 1px solid rgba(20,24,32,.08); box-shadow: 0 -6px 24px -16px rgba(16,18,27,.4); }
  .lvt-tab { flex:1; min-height:54px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px;
    color: var(--muted,#6F7684); text-decoration:none; font-size:.62rem; font-weight:500; padding:.45rem 0 .3rem;
    -webkit-tap-highlight-color: transparent; }
  .lvt-tab.active { color:#3a86ff; }
  .lvt-tab svg { width:23px; height:23px; }
}
@media (prefers-reduced-motion: reduce){ .lvt-more-menu { animation:none; } }
`;

/** Authenticated-app shell. Desktop: top glass nav. Mobile: slim header + a
 *  native-style bottom tab bar (App-Store-friendly), safe-area aware. */
export function AppShell({ title, children }: { title?: string; children: ReactNode }) {
  const nav = useNavigate();
  const loc = useLocation();
  const qc = useQueryClient();
  const [moreOpen, setMoreOpen] = useState(false);
  const logout = useMutation({
    mutationFn: () => api.post("/api/v1/auth/logout"),
    onSettled: () => { qc.clear(); nav("/login"); },
  });
  const active = (to: string) => (to === "/app" ? loc.pathname === "/app" : loc.pathname.startsWith(to));

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
                {NAV.map((n) => <Link key={n.to} to={n.to}>{n.label}</Link>)}
              </div>
              <div className="navcta">
                <button className="btn ghost" onClick={() => logout.mutate()} aria-label="Log out">Log out</button>
              </div>
            </nav>
          </div>
        </header>

        {/* Mobile slim header */}
        <header className="lvt-mobilehead">
          <Link to="/app" className="brand" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: ".5rem" }}>
            <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: "50%", background: "linear-gradient(135deg,#A9F5FF,#5BA7C9)" }} />
            <span style={{ fontWeight: 600, color: "var(--text)" }}>Lovalte</span>
          </Link>
          <div style={{ position: "relative" }}>
            <button type="button" aria-label="More" aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)}
              style={{ width: 40, height: 40, borderRadius: 10, border: "1px solid rgba(20,24,32,.12)", background: "#fff", color: "var(--text)", display: "grid", placeItems: "center", cursor: "pointer" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
            </button>
            {moreOpen && (
              <>
                <div onClick={() => setMoreOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 55 }} />
                <div className="lvt-more-menu" role="menu">
                  {MORE.map((m) => <Link key={m.to} role="menuitem" to={m.to} onClick={() => setMoreOpen(false)}>{m.label}</Link>)}
                  <button role="menuitem" onClick={() => { setMoreOpen(false); logout.mutate(); }}>Log out</button>
                </div>
              </>
            )}
          </div>
        </header>

        <main className="container lvt-rise lvt-main" style={{ paddingTop: "2.5rem", paddingBottom: "5rem" }}>
          {title ? <h1 className="section" style={{ marginBottom: "2rem" }}>{title}</h1> : null}
          {children}
        </main>

        {/* Mobile bottom tab bar */}
        <nav className="lvt-tabbar" aria-label="Primary">
          {TABS.map((t) => (
            <Link key={t.to} to={t.to} className={`lvt-tab${active(t.to) ? " active" : ""}`} aria-current={active(t.to) ? "page" : undefined}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[t.icon]}</svg>
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
