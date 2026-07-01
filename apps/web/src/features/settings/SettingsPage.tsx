import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { AppShell } from "../../lib/AppShell";
import { GlassCard, Icon } from "../../design-system/halo";
import { LanguageSwitcher, useT } from "../../lib/i18n";
import { clearNativeSession } from "../../lib/nativeSession";

const settingsCss = `
.lvt-settings { display:flex; flex-direction:column; gap:.85rem; }
.lvt-settings-row { display:flex; align-items:center; justify-content:space-between; gap:1rem; width:100%;
  padding:1rem 1.1rem; text-decoration:none; color:var(--text); }
.lvt-settings-copy { min-width:0; display:flex; flex-direction:column; gap:.22rem; }
.lvt-settings-copy strong { font-size:1rem; font-weight:650; }
.lvt-settings-copy span { color:var(--muted); font-size:.9rem; line-height:1.4; }
.lvt-settings-action { flex-shrink:0; display:flex; align-items:center; gap:.55rem; }
@media (max-width: 767px) {
  .lvt-settings-row { padding:.92rem 1rem; }
  .lvt-settings-copy strong { font-size:.98rem; }
  .lvt-settings-copy span { font-size:.84rem; }
}
`;

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
        <SettingsLink
          to="/app/support"
          title={t("Support")}
          description={t("Open tickets, reply to support, and follow up on help requests.")}
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
