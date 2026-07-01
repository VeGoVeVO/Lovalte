import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api, type ApiError } from "../../lib/api";
import { AppShell } from "../../lib/AppShell";
import { GlassButton, GlassCard, GlassInput } from "../../design-system/halo";
import { persistNativeSession } from "../../lib/nativeSession";
import { useT } from "../../lib/i18n";

export function AcceptInvitationPage() {
  const { t } = useT();
  const nav = useNavigate();
  const qc = useQueryClient();
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
      const session = await api.post<{ token: string }>("/api/v1/auth/accept-invitation", {
        token,
        password,
      });
      persistNativeSession(session);
      qc.removeQueries({ queryKey: ["me"] });
      nav("/app", { replace: true });
    } catch (err) {
      setError((err as ApiError).message ?? t("Could not accept invitation."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <GlassCard light className="waitlist" style={{ maxWidth: 440 }}>
        <h1 className="section">{t("Join the workspace.")}</h1>
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
            {busy ? t("Joining…") : t("Join Lovalte")}
          </GlassButton>
          <p className="body" style={{ margin: 0 }}>
            <Link to="/login">{t("Back to sign in")}</Link>
          </p>
        </form>
      </GlassCard>
    </AppShell>
  );
}
