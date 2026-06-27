import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, type ApiError } from "../../lib/api";
import { AppShell } from "../../lib/AppShell";
import { GlassCard, GlassInput, GlassButton } from "../../design-system/halo";

/* Business onboarding — creates the Tenant + owner User in one transaction
   (Identity context: POST /api/v1/auth/signup), sets the session, enters the app. */
export function SignupPage() {
  const nav = useNavigate();
  const [business, setBusiness] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/api/v1/auth/signup", { businessName: business, email, password });
      nav("/app");
    } catch (err) {
      setError((err as ApiError).message ?? "Sign up failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <GlassCard light className="waitlist" style={{ maxWidth: 460 }}>
        <h1 className="section">Start your loyalty program.</h1>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "1rem", width: "100%" }}>
          <GlassInput placeholder="Business name" aria-label="Business name"
            value={business} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBusiness(e.target.value)} />
          <GlassInput type="email" placeholder="you@business.com" aria-label="Email"
            value={email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)} />
          <GlassInput type="password" placeholder="Password (min 12 characters)" aria-label="Password"
            value={password} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)} />
          {error ? <p className="body" style={{ color: "#b4434e", margin: 0 }} role="alert">{error}</p> : null}
          <GlassButton type="submit" disabled={busy}>{busy ? "Creating…" : "Create business"}</GlassButton>
        </form>
        <p className="body" style={{ marginTop: "1rem" }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </GlassCard>
    </AppShell>
  );
}
