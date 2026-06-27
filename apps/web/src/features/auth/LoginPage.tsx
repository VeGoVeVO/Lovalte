import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, type ApiError } from "../../lib/api";
import { AppShell } from "../../lib/AppShell";
import { GlassCard, GlassInput, GlassButton } from "../../design-system/halo";

/* Owner/staff sign-in. Posts to the Identity context (POST /api/v1/auth/login),
   which sets the httpOnly session cookie, then routes into the dashboard. */
export function LoginPage() {
  const nav = useNavigate();
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/v1/auth/login", { email, password, ...(slug.trim() ? { slug: slug.trim() } : {}) });
      nav("/app");
    } catch (err) {
      setError((err as ApiError).message ?? "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <GlassCard light className="waitlist" style={{ maxWidth: 440 }}>
        <h1 className="section">Welcome back.</h1>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "1rem", width: "100%" }}>
          <GlassInput placeholder="Business slug (optional)" aria-label="Business slug (optional)"
            value={slug} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSlug(e.target.value)} />
          <GlassInput type="email" placeholder="you@business.com" aria-label="Email"
            value={email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)} />
          <GlassInput type="password" placeholder="Password" aria-label="Password"
            value={password} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)} />
          {error ? <p className="body" style={{ color: "#b4434e", margin: 0 }} role="alert">{error}</p> : null}
          <GlassButton type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</GlassButton>
        </form>
        <p className="body" style={{ marginTop: "1rem" }}>
          New here? <Link to="/signup">Create a business</Link>
        </p>
      </GlassCard>
    </AppShell>
  );
}
