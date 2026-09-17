import {
  Bar, BarChart, CartesianGrid, Cell,
  Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import { useLocale } from "../i18n";
import type { DashboardData } from "../types";

// Màu cho từng trạng thái — đồng bộ với badge CSS
const STATUS_COLORS: Record<string, string> = {
  new: "#4d8fb8",
  triaged: "#6a7fc1",
  in_progress: "#2b8c6f",
  waiting: "#c2872a",
  resolved: "#5a9a62",
  closed: "#8a9199"
};

export function DashboardCharts({ data }: { data: DashboardData }) {
  const { text } = useLocale();

  const statusNames: Record<string, string> = {
    new: text("Mới", "New"),
    triaged: text("Đã phân loại", "Triaged"),
    in_progress: text("Đang xử lý", "In progress"),
    waiting: text("Đang chờ", "Waiting"),
    resolved: text("Đã giải quyết", "Resolved"),
    closed: text("Đã đóng", "Closed")
  };

  // Donut data — chỉ hiện status có hồ sơ
  const donutData = data.statusDistribution
    .filter(item => item.value > 0)
    .map(item => ({
      name: statusNames[item.name] || item.name,
      value: item.value,
      color: STATUS_COLORS[item.name] || "#adb5be"
    }));

  const totalCases = donutData.reduce((sum, d) => sum + d.value, 0);

  // Bar data
  const barData = data.teamWorkload.map(item => ({
    name: item.team,
    open: item.open,
    risk: item.risk
  }));

  return (
    <section className="dashboard-charts">
      {/* Donut — phân bố trạng thái */}
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
                <Tooltip
                  contentStyle={{ fontSize: 13, borderRadius: 6 }}
                />
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

      {/* Bar — workload theo đội */}
      <figure>
        <figcaption>{text("Hồ sơ đang mở theo bộ phận", "Open cases by team")}</figcaption>
        <div className="dashboard-chart" role="img" aria-label={barData.map(d => `${d.name}: ${d.open}`).join(", ")}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} layout="vertical" margin={{ left: 8, right: 24 }} accessibilityLayer>
              <CartesianGrid horizontal={false} stroke="#e4e8ec" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ fontSize: 13, borderRadius: 6 }} />
              <Bar
                dataKey="open"
                name={text("Đang mở", "Open")}
                fill="#28705c"
                maxBarSize={20}
                isAnimationActive={false}
                radius={[0, 3, 3, 0]}
              />
              <Bar
                dataKey="risk"
                name={text("Rủi ro", "At risk")}
                fill="#c2522a"
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
