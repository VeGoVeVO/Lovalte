import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { AppShell } from "../../lib/AppShell";
import { GlassButton, GlassCard, Icon } from "../../design-system/halo";
import { LanguageSwitcher, useT } from "../../lib/i18n";
import { clearNativeSession } from "../../lib/nativeSession";
import { useSession } from "../../lib/auth";

const settingsCss = `
.lvt-settings { display:flex; flex-direction:column; gap:.85rem; }
.lvt-settings-row { display:flex; align-items:center; justify-content:space-between; gap:1rem; width:100%;
  padding:1rem 1.1rem; text-decoration:none; color:var(--text); }
.lvt-settings-copy { min-width:0; display:flex; flex-direction:column; gap:.22rem; }
.lvt-settings-copy strong { font-size:1rem; font-weight:650; }
.lvt-settings-copy span { color:var(--muted); font-size:.9rem; line-height:1.4; }
.lvt-settings-action { flex-shrink:0; display:flex; align-items:center; gap:.55rem; }
.lvt-settings-minirow { display:grid; grid-template-columns:1fr 1fr; gap:.55rem; margin-top:.85rem; }
.lvt-settings-minirow .btn { justify-content:center; }
.lvt-email-tests { padding:0; overflow:hidden; }
.lvt-email-tests-toggle { width:100%; border:0; background:transparent; color:var(--text); cursor:pointer; text-align:left; }
.lvt-email-tests-body { display:grid; gap:.9rem; padding:0 1.1rem 1rem; }
.lvt-email-tests-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.55rem; }
.lvt-email-status { min-height:1.25rem; margin:0; color:var(--muted); font-size:.84rem; line-height:1.45; }
@media (max-width: 767px) {
  .lvt-settings-row { padding:.92rem 1rem; }
  .lvt-settings-copy strong { font-size:.98rem; }
  .lvt-settings-copy span { font-size:.84rem; }
  .lvt-settings-minirow { grid-template-columns:1fr; }
  .lvt-email-tests-grid { grid-template-columns:1fr; }
}
`;

type EmailTestPreset = "welcome" | "invitation" | "password-reset" | "support";

const EMAIL_TEST_PRESETS: EmailTestPreset[] = [
  "welcome",
  "invitation",
  "password-reset",
  "support",
];

const EMAIL_TEST_LABELS: Record<EmailTestPreset, string> = {
  welcome: "Welcome",
  invitation: "Invitation",
  "password-reset": "Password reset",
  support: "Support",
};

function SettingsLink({
  to,
  title,
  description,
}: {
  to: string;
  title: string;
  description: string;
}) {
  return (
    <Link to={to} viewTransition className="glass glass-hover lvt-settings-row">
      <span className="lvt-settings-copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </span>
      <span className="lvt-settings-action" aria-hidden="true">
        <Icon.Arrow />
      </span>
    </Link>
  );
}

export function SettingsPage() {
  const { t } = useT();
  const nav = useNavigate();
  const qc = useQueryClient();
  const session = useSession();
  const [lastEmailTest, setLastEmailTest] = useState<EmailTestPreset | null>(null);
  const [testingOpen, setTestingOpen] = useState(false);
  const emailTest = useMutation({
    mutationFn: (preset: EmailTestPreset) => api.post("/api/v1/admin/email-tests", { preset }),
    onSuccess: (_data, preset) => setLastEmailTest(preset),
  });
  const logout = useMutation({
    mutationFn: () => api.post("/api/v1/auth/logout"),
    onSettled: () => {
      clearNativeSession();
      qc.clear();
      nav("/login");
    },
  });

  return (
    <AppShell title={t("Settings")} narrow>
      <style>{settingsCss}</style>
      <div className="lvt-settings">
        {session.data?.isAdmin ? (
          <GlassCard className="lvt-settings-row" aria-label={t("Support")}>
            <span className="lvt-settings-copy">
              <strong>{t("Support")}</strong>
              <span>{t("Open your tickets or manage customer support from the admin desk.")}</span>
              <span className="lvt-settings-minirow">
                <Link to="/app/support" viewTransition className="btn ghost">
                  {t("My tickets")}
                </Link>
                <Link to="/admin" viewTransition className="btn">
                  {t("All tickets")}
                </Link>
              </span>
            </span>
          </GlassCard>
        ) : (
          <SettingsLink
            to="/app/support"
            title={t("Support")}
            description={t("Open tickets, reply to support, and follow up on help requests.")}
          />
        )}
        <SettingsLink
          to="/app/staff"
          title={t("Team")}
          description={t("Invite and manage the people who can use this account.")}
        />
        <GlassCard className="lvt-settings-row" aria-label={t("Language")}>
          <span className="lvt-settings-copy">
            <strong>{t("Language")}</strong>
            <span>{t("Choose the language for this device.")}</span>
          </span>
          <span className="lvt-settings-action">
            <LanguageSwitcher />
          </span>
        </GlassCard>

        {session.data?.isAdmin ? (
          <GlassCard light className="lvt-email-tests" aria-label={t("Email testing")}>
            <button
              type="button"
              className="lvt-email-tests-toggle lvt-settings-row"
              onClick={() => setTestingOpen((open) => !open)}
              aria-expanded={testingOpen}
            >
              <span className="lvt-settings-copy">
                <strong>{t("Testing")}</strong>
                <span>{t("Send each Lovalte email preset to your admin email.")}</span>
              </span>
              <span className="lvt-settings-action">
                <Icon.Arrow
                  aria-hidden="true"
                  style={{ transform: testingOpen ? "rotate(90deg)" : undefined }}
                />
              </span>
            </button>
            {testingOpen ? (
              <div className="lvt-email-tests-body">
                <div className="lvt-email-tests-grid">
                  {EMAIL_TEST_PRESETS.map((preset) => (
                    <GlassButton
                      key={preset}
                      type="button"
                      variant="ghost"
                      disabled={emailTest.isPending}
                      onClick={() => emailTest.mutate(preset)}
                    >
                      {EMAIL_TEST_LABELS[preset]}
                    </GlassButton>
                  ))}
                </div>
                <p className="lvt-email-status" role={emailTest.isError ? "alert" : "status"}>
                  {emailTest.isError
                    ? t("Could not send the test email.")
                    : lastEmailTest
                      ? t("Sent {name} to {email}.", {
                          name: EMAIL_TEST_LABELS[lastEmailTest],
                          email: session.data.email,
                        })
                      : ""}
                </p>
              </div>
            ) : null}
          </GlassCard>
        ) : null}

        <button
          type="button"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
          className="btn ghost lvt-settings-row"
          style={{ justifyContent: "space-between", textAlign: "left" }}
        >
          <span className="lvt-settings-copy">
            <strong>{t("Log out")}</strong>
            <span>{t("Sign out of this account on this device.")}</span>
          </span>
          <span className="lvt-settings-action">
            <Icon.Arrow aria-hidden="true" />
          </span>
        </button>
      </div>
    </AppShell>
  );
}
