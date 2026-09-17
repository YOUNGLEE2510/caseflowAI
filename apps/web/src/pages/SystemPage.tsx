import { useState } from "react";
import { Activity, Database, RefreshCw, ShieldCheck } from "lucide-react";
import { ErrorState, LoadingState, PageHeader, Pagination, formatDate } from "../components/ui";
import { useApiData } from "../hooks/useApiData";
import { useLocale } from "../i18n";

interface SystemStatus {
  database: {
    engine: string;
    connected: boolean;
  };
  ai: {
    connected: boolean;
    classifier?: string;
    trainingSamples?: number;
  };
  storage: {
    provider: string;
    bytes: number;
    files: number;
  };
  counts: {
    overdueCases: number;
    unassignedCases: number;
    draftArticles: number;
    activeUsers: number;
  };
  checkedAt: string;
}

interface AuditLogItem {
  _id: string;
  actorName: string;
  actorRole: string;
  action: string;
  resource: string;
  createdAt: string;
}

interface AuditPage {
  logs: AuditLogItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface ReviewMetrics {
  total: number;
  reviewed: number;
  pending: number;
  confirmationRate: number | null;
  reviewCoverage: number | null;
}

const AUDIT_RESOURCES = [
  "CaseRecord",
  "User",
  "ServiceDefinition",
  "KnowledgeArticle",
  "Attachment",
  "Incident"
];

export function SystemPage() {
  const { text } = useLocale();
  const [page, setPage] = useState(1);
  const [resource, setResource] = useState("");

  const status = useApiData<SystemStatus>("/system/status");
  const audit = useApiData<AuditPage>(
    `/analytics/audit-log?page=${page}${resource ? `&resource=${resource}` : ""}`
  );
  const reviews = useApiData<ReviewMetrics>("/analytics/ai-accuracy");

  const handleRefresh = () => {
    void status.reload();
    void audit.reload();
    void reviews.reload();
  };

  return (
    <div className="page-stack">
      <PageHeader
        title={text("Vận hành hệ thống", "System operations")}
        actions={
          <button
            className="button button-secondary"
            disabled={status.loading}
            onClick={handleRefresh}
          >
            <RefreshCw size={16} />
            {text("Làm mới", "Refresh")}
          </button>
        }
      />

      {status.loading ? <LoadingState /> : null}
      {status.error ? <ErrorState message={status.error} onRetry={status.reload} /> : null}

      {status.data && !status.loading ? (
        <>
          <section className="system-services">
            <h2>{text("Hạ tầng", "Infrastructure")}</h2>
            <dl className="system-definition">
              <div>
                <dt>
                  <Database size={18} />
                  MongoDB
                </dt>
                <dd className={status.data.database.connected ? "active-label" : "inactive-label"}>
                  {status.data.database.connected
                    ? text("Đã kết nối", "Connected")
                    : text("Mất kết nối", "Disconnected")}
                </dd>
              </div>
              <div>
                <dt>
                  <Activity size={18} />
                  {text("Dịch vụ AI", "AI service")}
                </dt>
                <dd>
                  {status.data.ai.connected
                    ? status.data.ai.classifier
                    : text("Đang dùng bộ quy tắc dự phòng", "Rule-based fallback active")}
                </dd>
              </div>
              <div>
                <dt>{text("Tệp đính kèm", "Attachments")}</dt>
                <dd>
                  {status.data.storage.files} {text("tệp", "files")} ·{" "}
                  {(status.data.storage.bytes / 1048576).toFixed(1)} MB ·{" "}
                  {text("Ổ đĩa cục bộ", "Local disk")}
                </dd>
              </div>
              <div>
                <dt>{text("Kiểm tra lúc", "Checked at")}</dt>
                <dd>{formatDate(status.data.checkedAt)}</dd>
              </div>
            </dl>
          </section>

          <section>
            <h2>{text("Cần theo dõi", "Operational checks")}</h2>
            <dl className="system-counters">
              <div>
                <dt>{text("Hồ sơ quá hạn", "Overdue cases")}</dt>
                <dd>{status.data.counts.overdueCases}</dd>
              </div>
              <div>
                <dt>{text("Chưa có người xử lý", "Unassigned cases")}</dt>
                <dd>{status.data.counts.unassignedCases}</dd>
              </div>
              <div>
                <dt>{text("Tài liệu chờ duyệt", "Draft documents")}</dt>
                <dd>{status.data.counts.draftArticles}</dd>
              </div>
              <div>
                <dt>{text("Tài khoản hoạt động", "Active accounts")}</dt>
                <dd>{status.data.counts.activeUsers}</dd>
              </div>
            </dl>
          </section>
        </>
      ) : null}

      {reviews.error ? <ErrorState message={reviews.error} onRetry={reviews.reload} /> : null}
      {reviews.data ? (
        <section>
          <h2>
            <ShieldCheck size={18} /> {text("Đánh giá phân luồng AI", "AI routing review")}
          </h2>
          <dl className="system-counters">
            <div>
              <dt>{text("Đã được đánh giá", "Reviewed")}</dt>
              <dd>
                {reviews.data.reviewed}/{reviews.data.total}
              </dd>
            </div>
            <div>
              <dt>{text("Tỷ lệ được xác nhận", "Confirmation rate")}</dt>
              <dd>
                {reviews.data.confirmationRate === null
                  ? text("Chưa có dữ liệu", "No data")
                  : `${reviews.data.confirmationRate}%`}
              </dd>
            </div>
            <div>
              <dt>{text("Chờ đánh giá", "Pending review")}</dt>
              <dd>{reviews.data.pending}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className="table-panel">
        <div className="panel-heading">
          <h2>{text("Nhật ký thay đổi", "Audit log")}</h2>
          <select
            className="sort-dropdown"
            aria-label={text("Loại dữ liệu", "Resource type")}
            value={resource}
            onChange={(event) => {
              setResource(event.target.value);
              setPage(1);
            }}
          >
            <option value="">{text("Tất cả", "All resources")}</option>
            {AUDIT_RESOURCES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        {audit.loading ? <LoadingState /> : null}
        {audit.error ? <ErrorState message={audit.error} onRetry={audit.reload} /> : null}

        {audit.data && !audit.loading ? (
          <>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{text("Thời điểm", "Time")}</th>
                    <th>{text("Người thực hiện", "Actor")}</th>
                    <th>{text("Thao tác", "Action")}</th>
                    <th>{text("Đối tượng", "Resource")}</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.data.logs.map((log) => (
                    <tr key={log._id}>
                      <td>{formatDate(log.createdAt)}</td>
                      <td>{log.actorName}</td>
                      <td>{log.action}</td>
                      <td>{log.resource}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!audit.data.total ? (
                <div className="inline-empty">
                  {text("Chưa có thay đổi được ghi nhận.", "No recorded changes.")}
                </div>
              ) : null}
            </div>
            <Pagination {...audit.data} onPageChange={setPage} />
          </>
        ) : null}
      </section>
    </div>
  );
}
