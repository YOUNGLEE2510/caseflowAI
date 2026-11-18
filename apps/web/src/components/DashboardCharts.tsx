import {
  Bar, BarChart, CartesianGrid, Cell,
  Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import { useMemo } from "react";
import { useLocale } from "../i18n";
import { useTheme } from "../theme";
import type { DashboardData } from "../types";

const STATUS_TOKENS: Record<string, string> = {
  new: "--chart-2",
  triaged: "--chart-4",
  in_progress: "--chart-1",
  waiting: "--chart-3",
  resolved: "--chart-6",
  closed: "--chart-7"
};

/** Chart colours come from the design tokens and are re-read when the theme changes. */
function useChartPalette() {
  const { resolved } = useTheme();
  return useMemo(() => {
    const style = typeof document === "undefined" ? null : getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) => style?.getPropertyValue(name).trim() || fallback;
    return {
      status: Object.fromEntries(Object.entries(STATUS_TOKENS).map(([key, token]) => [key, read(token, "#8a9199")])) as Record<string, string>,
      open: read("--chart-1", "#2b8c6f"),
      risk: read("--chart-5", "#c2522a"),
      grid: read("--chart-grid", "#e4e9e6"),
      axis: read("--chart-axis", "#64746d"),
      surface: read("--surface", "#ffffff"),
      border: read("--border", "#d8e1dc"),
      ink: read("--ink", "#12201c"),
      fallback: read("--chart-7", "#8a9199")
    };
  }, [resolved]);
}

export function DashboardCharts({ data }: { data: DashboardData }) {
  const { text } = useLocale();
  const palette = useChartPalette();
  const tooltipStyle = { fontSize: 13, borderRadius: 8, color: palette.ink, background: palette.surface, border: `1px solid ${palette.border}` };

  const statusNames: Record<string, string> = {
    new: text("Mới", "New"),
    triaged: text("Đã phân loại", "Triaged"),
    in_progress: text("Đang xử lý", "In progress"),
    waiting: text("Đang chờ", "Waiting"),
    resolved: text("Đã giải quyết", "Resolved"),
    closed: text("Đã đóng", "Closed")
  };

  const donutData = data.statusDistribution
    .filter(item => item.value > 0)
    .map(item => ({
      name: statusNames[item.name] || item.name,
      value: item.value,
      color: palette.status[item.name] || palette.fallback
    }));

  const totalCases = donutData.reduce((sum, d) => sum + d.value, 0);

  const barData = data.teamWorkload.map(item => ({
    name: item.team,
    open: item.open,
    risk: item.risk
  }));

  return (
    <section className="dashboard-charts">
      <figure>
        <figcaption>{text("Phân bố trạng thái", "Status distribution")}</figcaption>
        <div className="donut-layout">
          <div className="donut-chart" role="img" aria-label={donutData.map(d => `${d.name}: ${d.value}`).join(", ")}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius="55%"
                  outerRadius="85%"
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                  stroke="none"
                  isAnimationActive={false}
                >
                  {donutData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: palette.ink }} />
              </PieChart>
            </ResponsiveContainer>
            <span className="donut-center">{totalCases}</span>
          </div>
          <div className="chart-legend">
            {donutData.map((entry, index) => (
              <div key={index}>
                <span style={{ background: entry.color }} />
                <small>{entry.name}</small>
                <strong>{entry.value}</strong>
              </div>
            ))}
          </div>
        </div>
      </figure>

      <figure>
        <figcaption>{data.workloadBy === "property" ? text("Hồ sơ đang mở theo cơ sở", "Open cases by property") : text("Hồ sơ đang mở theo bộ phận", "Open cases by team")}</figcaption>
        <div className="workload-legend"><span><i style={{ background: palette.open }} />{text("Đang mở", "Open")}</span><span><i style={{ background: palette.risk }} />{text("Nguy cơ SLA", "At SLA risk")}</span></div>
        <div className="dashboard-chart workload-chart" style={{ height: Math.max(100, Math.min(380, barData.length * 52 + 40)) }} role="img" aria-label={barData.map(d => `${d.name}: ${d.open} ${text("đang mở", "open")}, ${d.risk} ${text("rủi ro", "at risk")}`).join(", ")}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} layout="vertical" margin={{ left: 8, right: 24 }} accessibilityLayer>
              <CartesianGrid horizontal={false} stroke={palette.grid} />
              <XAxis type="number" allowDecimals={false} stroke={palette.grid} tick={{ fill: palette.axis, fontSize: 12 }} />
              <YAxis type="category" dataKey="name" width={140} tickMargin={12} axisLine={false} tickLine={false} tick={{ fill: palette.axis, fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: palette.ink }} cursor={{ fill: palette.grid }} />
              <Bar
                dataKey="open"
                name={text("Đang mở", "Open")}
                fill={palette.open}
                maxBarSize={20}
                isAnimationActive={false}
                radius={[0, 3, 3, 0]}
              />
              <Bar
                dataKey="risk"
                name={text("Rủi ro", "At risk")}
                fill={palette.risk}
                maxBarSize={20}
                isAnimationActive={false}
                radius={[0, 3, 3, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </figure>
    </section>
  );
}
