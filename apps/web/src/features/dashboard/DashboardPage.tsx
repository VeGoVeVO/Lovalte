import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { AppShell } from "../../lib/AppShell";
import { GlassCard } from "../../design-system/halo";
import { useT } from "../../lib/i18n";

/* Owner dashboard overview. Reads the Analytics context CQRS read-model
   (GET /api/v1/analytics/overview). Tolerant of partial data while contexts land. */
type Overview = {
  totalMembers?: number;
  totalScans?: number;
  totalRedemptions?: number;
  pointsLiability?: number;
  cardsRemoved?: number;
};

const KPIS: { key: keyof Overview; label: string }[] = [
  { key: "totalMembers", label: "Active members" },
  { key: "totalScans", label: "Scans" },
  { key: "totalRedemptions", label: "Redemptions" },
  { key: "pointsLiability", label: "Points liability" },
  { key: "cardsRemoved", label: "Cards removed" },
];

export function DashboardPage() {
  const { t } = useT();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["analytics-overview"],
    queryFn: () => api.get<Overview>("/api/v1/analytics/overview"),
  });

  return (
    <AppShell title={t("Overview")}>
      {isError ? (
        <GlassCard className="feature"><p className="body">{t("Sign in to view your dashboard.")}</p></GlassCard>
      ) : (
        <div className="grid-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
          {KPIS.map((kpi) => (
            <GlassCard key={kpi.key} hover light className="meta">
              <div className="n">{isLoading ? "-" : (data?.[kpi.key] ?? 0).toLocaleString()}</div>
              <div className="l">{t(kpi.label)}</div>
            </GlassCard>
          ))}
        </div>
      )}
    </AppShell>
  );
}
