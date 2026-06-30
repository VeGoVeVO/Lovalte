import { useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { api, type ApiError } from "../../lib/api";
import { AppShell } from "../../lib/AppShell";
import { GlassCard, GlassInput, GlassButton } from "../../design-system/halo";
import { useT } from "../../lib/i18n";
import { resolveNextPath } from "../../lib/nativeNavigation";
import { persistNativeSession } from "../../lib/nativeSession";

/* Owner/staff sign-in. Posts to the Identity context (POST /api/v1/auth/login),
   which sets the httpOnly session cookie, then routes into the dashboard. */
export function LoginPage() {
  const nav = useNavigate();
  const location = useLocation();
  const { t } = useT();
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
      const session = await api.post<{ token: string }>("/api/v1/auth/login", {
        email,
        password,
        ...(slug.trim() ? { slug: slug.trim() } : {}),
      });
      persistNativeSession(session);
      nav(resolveNextPath(location.search));
    } catch (err) {
      setError((err as ApiError).message ?? t("Login failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <GlassCard light className="waitlist" style={{ maxWidth: 440 }}>
        <h1 className="section">{t("Welcome back.")}</h1>
        <form
          onSubmit={submit}
          style={{ display: "flex", flexDirection: "column", gap: "1rem", width: "100%" }}
        >
          <GlassInput
            placeholder={t("Business slug (optional)")}
            aria-label={t("Business slug (optional)")}
            value={slug}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSlug(e.target.value)}
          />
          <GlassInput
            type="email"
            placeholder="you@business.com"
            aria-label={t("Email")}
            value={email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
          />
          <GlassInput
            type="password"
            placeholder={t("Password")}
            aria-label={t("Password")}
            value={password}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
          />
          {error ? (
            <p className="body" style={{ color: "#b4434e", margin: 0 }} role="alert">
              {error}
            </p>
          ) : null}
          <GlassButton type="submit" disabled={busy}>
            {busy ? t("Signing in…") : t("Sign in")}
          </GlassButton>
        </form>
        <p className="body" style={{ marginTop: "1rem" }}>
          {t("New here?")} <Link to="/signup">{t("Create a business")}</Link>
        </p>
      </GlassCard>
    </AppShell>
  );
}
