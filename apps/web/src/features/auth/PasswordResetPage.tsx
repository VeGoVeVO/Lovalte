import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, type ApiError } from "../../lib/api";
import { AppShell } from "../../lib/AppShell";
import { GlassButton, GlassCard, GlassInput } from "../../design-system/halo";
import { useT } from "../../lib/i18n";

export function ForgotPasswordPage() {
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post<void>("/api/v1/auth/password-reset/request", { email });
      setSent(true);
    } catch (err) {
      setError((err as ApiError).message ?? t("Could not send reset email."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <GlassCard light className="waitlist" style={{ maxWidth: 440 }}>
        <h1 className="section">{t("Reset your password.")}</h1>
        {sent ? (
          <>
            <p className="body">{t("If that email exists, a reset link is on its way.")}</p>
            <p className="body">
              <Link to="/login">{t("Back to sign in")}</Link>
            </p>
          </>
        ) : (
          <form
            onSubmit={submit}
            style={{ display: "flex", flexDirection: "column", gap: "1rem", width: "100%" }}
          >
            <GlassInput
              type="email"
              placeholder="you@business.com"
              aria-label={t("Email")}
              autoComplete="email"
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              required
            />
            {error ? (
              <p className="body" style={{ color: "#b4434e", margin: 0 }} role="alert">
                {error}
              </p>
            ) : null}
            <GlassButton type="submit" disabled={busy}>
              {busy ? t("Sending…") : t("Send reset link")}
            </GlassButton>
            <p className="body" style={{ margin: 0 }}>
              <Link to="/login">{t("Back to sign in")}</Link>
            </p>
          </form>
        )}
      </GlassCard>
    </AppShell>
  );
}

export function ResetPasswordPage() {
  const { t } = useT();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 12) {
      setError(t("Password must be at least 12 characters."));
      return;
    }
    setBusy(true);
    try {
      await api.post<void>("/api/v1/auth/password-reset/confirm", { token, password });
      nav("/login", { replace: true });
    } catch (err) {
      setError((err as ApiError).message ?? t("Could not reset password."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <GlassCard light className="waitlist" style={{ maxWidth: 440 }}>
        <h1 className="section">{t("Choose a new password.")}</h1>
        <form
          onSubmit={submit}
          style={{ display: "flex", flexDirection: "column", gap: "1rem", width: "100%" }}
        >
          <GlassInput
            type="password"
            placeholder={t("Password (min 12 characters)")}
            aria-label={t("Password")}
            autoComplete="new-password"
            value={password}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            required
          />
          {error ? (
            <p className="body" style={{ color: "#b4434e", margin: 0 }} role="alert">
              {error}
            </p>
          ) : null}
          <GlassButton type="submit" disabled={busy || !token}>
            {busy ? t("Saving…") : t("Save new password")}
          </GlassButton>
          <p className="body" style={{ margin: 0 }}>
            <Link to="/login">{t("Back to sign in")}</Link>
          </p>
        </form>
      </GlassCard>
    </AppShell>
  );
}
