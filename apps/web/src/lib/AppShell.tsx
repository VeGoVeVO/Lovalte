import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
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

/* Authenticated-app shell. Reuses the Halo glass design system (injects the
   tokens once, wraps in `.halo`) so every app surface shares the marketing
   material. Provides nav + logout. */
export function AppShell({ title, children }: { title?: string; children: ReactNode }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const logout = useMutation({
    mutationFn: () => api.post("/api/v1/auth/logout"),
    onSettled: () => {
      qc.clear();
      nav("/login");
    },
  });

  return (
    <div className="halo" style={{ minHeight: "100vh" }}>
      <style>{haloCss}</style>
      <div className="content">
        <header className="nav">
          <div className="container">
            <nav className="glass navbar" aria-label="App">
              <Link to="/app" className="brand" style={{ textDecoration: "none" }}>
                <span className="dot" aria-hidden="true" />
                Lovalte
              </Link>
              <div className="navlinks">
                {NAV.map((n) => (
                  <Link key={n.to} to={n.to}>{n.label}</Link>
                ))}
              </div>
              <div className="navcta">
                <button className="btn ghost" onClick={() => logout.mutate()} aria-label="Log out">
                  Log out
                </button>
              </div>
            </nav>
          </div>
        </header>
        <main className="container lvt-rise" style={{ paddingTop: "2.5rem", paddingBottom: "5rem" }}>
          {title ? <h1 className="section" style={{ marginBottom: "2rem" }}>{title}</h1> : null}
          {children}
        </main>
      </div>
    </div>
  );
}
