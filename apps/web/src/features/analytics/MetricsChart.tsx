import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { useT } from "../../lib/i18n";

export interface TimeseriesPoint {
  day: string;
  count: number;
}

interface MetricsChartProps {
  data: TimeseriesPoint[];
  metricLabel: string;
  isLoading: boolean;
  isError: boolean;
}

function fmtDay(day: string): string {
  // Append local-time marker so the date isn't shifted by UTC offset
  return new Date(day + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

const CHART_HEIGHT = 260;

const tooltipContentStyle: React.CSSProperties = {
  background: "var(--card-strong)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  color: "var(--text)",
  fontSize: "0.875rem",
  boxShadow: "0 2px 12px -4px rgba(46,62,92,.18)",
};

const centeredBox: React.CSSProperties = {
  height: CHART_HEIGHT,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

export function MetricsChart({ data, metricLabel, isLoading, isError }: MetricsChartProps) {
  const { t } = useT();

  if (isLoading) {
    return (
      <div style={centeredBox} aria-busy="true" aria-label={t("Loading chart data")}>
        <span className="body">{t("Loading…")}</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div role="alert" style={centeredBox}>
        <span className="body">{t("Failed to load chart data. Please try again.")}</span>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div
        style={centeredBox}
        aria-label={t("No {metric} data for this period", { metric: metricLabel })}
      >
        <span className="body">{t("No data for this period.")}</span>
      </div>
    );
  }

  const chartData = data.map((p) => ({ day: fmtDay(p.day), count: p.count }));

  return (
    <div aria-label={t("{metric} timeseries line chart", { metric: metricLabel })}>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <LineChart data={chartData} margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 4" stroke="rgba(111,118,132,.14)" vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={40}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={tooltipContentStyle}
            labelStyle={{ color: "var(--muted)", marginBottom: ".25rem" }}
            cursor={{ stroke: "rgba(111,118,132,.2)", strokeWidth: 1 }}
            formatter={(value: number) => [value.toLocaleString(), metricLabel]}
          />
          <Line
            type="monotone"
            dataKey="count"
            stroke="var(--text)"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 4, fill: "var(--text)", stroke: "var(--card)", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
