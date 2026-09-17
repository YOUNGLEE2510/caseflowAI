import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Inbox,
  Plus,
  Search,
  Siren,
  Sparkles,
  TriangleAlert
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { lazy, Suspense } from "react";
import {
  EmptyState,
  ErrorState,
  formatRelative,
  LoadingState,
  PageHeader,
  PriorityBadge,
  StatusBadge
} from "../components/ui";
import { useApiData } from "../hooks/useApiData";
import { useLocale } from "../i18n";
import type { CaseRecord, DashboardData } from "../types";

const DashboardCharts = lazy(async () => ({ default: (await import("../components/DashboardCharts")).DashboardCharts }));

function uniqueCases(primary: CaseRecord[], secondary: CaseRecord[]) {
  const records = new Map<string, CaseRecord>();
  for (const item of [...primary, ...secondary]) records.set(item._id, item);
  return [...records.values()].slice(0, 7);
}

function metricTrend(value: number | null, lowerIsBetter: boolean) {
  if (value === null || value === 0) return "flat";
  return (lowerIsBetter ? value < 0 : value > 0) ? "up" : "down";
}

export function OverviewPage() {
  const { user } = useAuth();
  const { locale, text } = useLocale();
  const { data, loading, error, reload } = useApiData<DashboardData>("/dashboard");

  if (loading) return <LoadingState label={text("Đang tổng hợp tình trạng vận hành", "Preparing your overview")} />;
  if (error || !data) return <ErrorState message={error || text("Không có dữ liệu.", "No data available.")} onRetry={reload} />;

  if (user?.role === "requester") {
    const recentCases = data.recentCases.slice(0, 3);
    const waitingCount = data.statusDistribution.find((item) => item.name === "waiting")?.value || 0;
    const displayName = user.name.split(" ").at(-1);

    return (
      <div className="page-stack requester-home">
        <section className="requester-welcome">
          <h1>{text(`Chào ${displayName},`, `Hi ${displayName},`)}</h1>
          <p>{text("Bạn cần CaseFlow hỗ trợ điều gì hôm nay?", "What can CaseFlow help you with today?")}</p>
        </section>

        <Link to="/cases/new" className="button button-primary requester-create">
          <Plus size={18} />
          {text("Tạo yêu cầu mới", "Create a request")}
        </Link>

        <Link to="/knowledge" className="requester-ai-card">
          <Sparkles size={20} />
          <span>
            <strong>{text("Tìm câu trả lời trước khi gửi", "Find an answer before submitting")}</strong>
            <small>{text("Tra cứu từ nguồn đã được tổ chức phê duyệt.", "Search your organization’s approved sources.")}</small>
          </span>
          <ArrowRight size={18} />
        </Link>

        <section className="requester-section">
          <header>
            <h2>{text("Hồ sơ của bạn", "Your cases")}</h2>
            <Link to="/cases" className="text-link">{text("Xem tất cả", "View all")}</Link>
          </header>
          <div className="requester-summary-grid">
            <article>
              <strong>{data.metrics.open}</strong>
              <span>{text("Đang xử lý", "In progress")}</span>
            </article>
            <article className="requester-summary-warning">
              <strong>{waitingCount}</strong>
              <span>{text("Chờ bạn phản hồi", "Waiting for you")}</span>
            </article>
          </div>
        </section>

        <section className="requester-section">
          <header>
            <h2>{text("Cập nhật gần đây", "Recent updates")}</h2>
          </header>
          {recentCases.length > 0 ? (
            <div className="requester-case-list">
              {recentCases.map((item) => (
                <Link to={`/cases/${item._id}`} key={item._id}>
                  <span className="case-code">{item.code}</span>
                  <strong>{item.title}</strong>
                  <StatusBadge status={item.status} />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              title={text("Chưa có hồ sơ nào", "No cases yet")}
              detail={text("Hồ sơ bạn gửi sẽ hiển thị tại đây", "Cases you submit will appear here")}
            />
          )}
        </section>
      </div>
    );
  }

  const metrics = [
    {
      label: text("Hồ sơ đang mở", "Open cases"),
      value: data.metrics.open,
      delta: data.metrics.openTrend,
      detail: text("tại thời điểm truy vấn", "at time of query"),
      icon: Inbox,
      trend: metricTrend(data.metrics.openTrend, true)
    },
    {
      label: text("Nguy cơ trễ SLA", "At risk of SLA breach"),
      value: data.metrics.atRisk,
      delta: data.metrics.atRiskTrend,
      detail: text("theo dự báo gần nhất", "latest available prediction"),
      icon: TriangleAlert,
      trend: metricTrend(data.metrics.atRiskTrend, true)
    },
    {
      label: text("Đã giải quyết", "Resolved"),
      value: data.metrics.resolved,
      delta: data.metrics.resolvedTrend,
      detail: text("trong 30 ngày", "in the last 30 days"),
      icon: CheckCircle2,
      trend: metricTrend(data.metrics.resolvedTrend, false)
    },
    {
      label: text("Sự cố đang mở", "Active incidents"),
      value: data.metrics.activeIncidents,
      delta: data.metrics.activeIncidentsTrend,
      detail: text("tại thời điểm truy vấn", "at time of query"),
      icon: Siren,
      trend: metricTrend(data.metrics.activeIncidentsTrend, true)
    }
  ];
  const priorityCases = uniqueCases(data.highRiskCases, data.recentCases);

  return (
    <div className="page-stack operations-overview">
      <PageHeader
        title={text("Tổng quan", "Overview")}
        description={new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-GB", { dateStyle: "full" }).format(new Date())}
        actions={
          <Link to="/cases/new" className="button button-primary">
            <Plus size={17} />
            {text("Tạo yêu cầu", "New request")}
          </Link>
        }
      />

      <section className="metric-grid" aria-label={text("Chỉ số tổng quan", "Overview metrics")}>
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article className="metric-card" key={metric.label}>
              <div className="metric-card-heading">
                <span className="metric-icon"><Icon size={16} /></span>
                <span>{metric.label}</span>
              </div>
              <strong>{metric.value}</strong>
              <div className="metric-card-footer">
                {metric.delta !== null ? <span className={`metric-delta metric-delta-${metric.trend}`}>
                  {metric.delta > 0 ? "+" : ""}{new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-GB", { maximumFractionDigits: 1 }).format(metric.delta)}%
                </span> : null}
                <small>{metric.detail}</small>
              </div>
            </article>
          );
        })}
      </section>

      <nav className="work-queue-shortcuts" aria-label={text("Hàng đợi nhanh", "Quick queues")}>
        <Link to="/cases?status=new"><Inbox size={18} /><span>{text("Chờ tiếp nhận", "Awaiting triage")}</span><ArrowRight size={16} /></Link>
        <Link to="/cases?status=in_progress"><Clock3 size={18} /><span>{text("Đang xử lý", "In progress")}</span><ArrowRight size={16} /></Link>
        <Link to="/cases?status=waiting"><TriangleAlert size={18} /><span>{text("Chờ phản hồi", "Waiting for a response")}</span><ArrowRight size={16} /></Link>
      </nav>

      <Suspense fallback={<div style={{ minHeight: 320 }} />}><DashboardCharts data={data} /></Suspense>
      <section className="priority-queue-panel">
        <div className="panel-heading">
          <div>
            <h2>{text("Cần xử lý trước", "Needs attention")}</h2>
          </div>
          <Link to="/cases" className="button button-secondary button-small">
            <Search size={16} />
            {text("Xem hàng đợi", "Open queue")}
          </Link>
        </div>

        {priorityCases.length ? (
          <div className="table-scroll">
            <table className="data-table priority-table">
              <thead>
                <tr>
                  <th>{text("Mã hồ sơ", "Case ID")}</th>
                  <th>{text("Tiêu đề", "Subject")}</th>
                  <th>{text("Người yêu cầu", "Requester")}</th>
                  <th>{text("Trạng thái", "Status")}</th>
                  <th>{text("Ưu tiên", "Priority")}</th>
                  <th>{text("Cập nhật", "Updated")}</th>
                </tr>
              </thead>
              <tbody>
                {priorityCases.map((item) => (
                  <tr key={item._id}>
                    <td><Link to={`/cases/${item._id}`} className="case-link">{item.code}</Link></td>
                    <td>
                      <Link to={`/cases/${item._id}`} className="table-title">{item.title}</Link>
                    </td>
                    <td>{item.requesterName}</td>
                    <td><StatusBadge status={item.status} /></td>
                    <td><PriorityBadge priority={item.priority} /></td>
                    <td>{formatRelative(item.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="inline-empty">
            <Clock3 size={18} /> {text("Không có hồ sơ cần ưu tiên.", "No cases need immediate attention.")}
          </div>
        )}
        <footer className="table-footer">
          <span>{text(`Hiển thị ${priorityCases.length} hồ sơ ưu tiên`, `Showing ${priorityCases.length} priority cases`)}</span>
          <Link to="/cases" className="text-link">{text("Xem toàn bộ hồ sơ", "View all cases")}</Link>
        </footer>
      </section>
    </div>
  );
}
