import { useState } from "react";
import { Activity, Database, Download, RefreshCw, ShieldCheck } from "lucide-react";
import { apiBlob } from "../api";
import { useAuth } from "../auth";
import { useConfirmation } from "../components/ConfirmationProvider";
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
    modelVersion?: string;
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
  resourceId?: string;
  resourceLabel?: string;
  changes?: { code?: string; filename?: string; caseId?: string; name?: string; email?: string; title?: string; rows?: number; format?: string } | null;
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

const resourceLabels: Record<string, { vi: string; en: string }> = {
  CaseRecord: { vi: "Hồ sơ", en: "Case" }, User: { vi: "Người dùng", en: "User" }, ServiceDefinition: { vi: "Dịch vụ", en: "Service" },
  KnowledgeArticle: { vi: "Tài liệu", en: "Document" }, Attachment: { vi: "Tệp đính kèm", en: "Attachment" }, Incident: { vi: "Sự cố", en: "Incident" }
};
const actionLabels: Record<string, { vi: string; en: string }> = {
  "auth.login": { vi: "Đăng nhập", en: "Sign in" }, "auth.logout": { vi: "Đăng xuất", en: "Sign out" },
  "case.view": { vi: "Xem hồ sơ", en: "View case" }, "attachment.download": { vi: "Tải tệp", en: "Download attachment" },
  "case.create": { vi: "Tạo hồ sơ", en: "Create case" }, "case.update": { vi: "Cập nhật hồ sơ", en: "Update case" },
  "user.create": { vi: "Thêm người dùng", en: "Add user" }, "user.update": { vi: "Sửa người dùng", en: "Update user" },
  "knowledge.create": { vi: "Thêm tài liệu", en: "Add document" }, "knowledge.update": { vi: "Sửa tài liệu", en: "Update document" },
  "service.create": { vi: "Thêm dịch vụ", en: "Add service" }, "service.update": { vi: "Sửa dịch vụ", en: "Update service" },
  "attachment.upload": { vi: "Tải tệp lên", en: "Upload attachment" }, "ai.training_export": { vi: "Xuất dữ liệu huấn luyện", en: "Export training data" },
  "case.export": { vi: "Xuất hồ sơ", en: "Export cases" }, "knowledge.delete": { vi: "Ẩn tài liệu", en: "Disable document" },
  "service.delete": { vi: "Vô hiệu dịch vụ", en: "Disable service" }
};

export function SystemPage() {
  const { user } = useAuth();
  const confirm = useConfirmation();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const { locale, text } = useLocale();
  const [page, setPage] = useState(1);
  const [resource, setResource] = useState("");
  const [action, setAction] = useState("");

  const status = useApiData<SystemStatus>("/system/status");
  const audit = useApiData<AuditPage>(
    `/analytics/audit-log?page=${page}${resource ? `&resource=${resource}` : ""}${action ? `&action=${action}` : ""}`
  );
  const reviews = useApiData<ReviewMetrics>("/analytics/ai-accuracy");
  async function exportTraining() {
    if (!await confirm({ title: text("Xuất dữ liệu huấn luyện?", "Export training data?"), message: text("Chỉ xuất hồ sơ đã được xác nhận nhãn. Kiểm tra lại dữ liệu cá nhân trước khi chia sẻ hoặc huấn luyện.", "Only reviewed labels are exported. Review personal data before sharing or training.") })) return;
    setExporting(true); setExportError("");
    try {
      const blob = await apiBlob("/analytics/export/training.csv");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = "caseflow-reviewed-training.csv"; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setExportError(error instanceof Error ? error.message : text("Không thể xuất dữ liệu.", "Unable to export data.")); }
    finally { setExporting(false); }
  }

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
                    ? text("Đã kết nối", "Connected")
                    : text("Đang dùng bộ quy tắc dự phòng", "Rule-based fallback active")}
                  {status.data.ai.connected ? <small className="system-model-detail">{status.data.ai.classifier || text("Bộ phân loại", "Classifier")} · {status.data.ai.modelVersion || "—"}{status.data.ai.trainingSamples !== undefined ? ` · ${status.data.ai.trainingSamples} ${text("mẫu huấn luyện", "training samples")}` : ""}</small> : null}
                </dd>
              </div>
              <div>
                <dt>{text("Tệp đính kèm", "Attachments")}</dt>
                <dd>
                  {status.data.storage.files} {text("tệp", "files")} ·{" "}
                  {(status.data.storage.bytes / 1048576).toFixed(1)} MB ·{" "}
                  {status.data.storage.provider === "s3" ? text("Kho đối tượng S3", "S3 object storage") : text("Ổ đĩa cục bộ", "Local disk")}
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
          {["org_admin", "platform_admin"].includes(user?.role || "") ? <button className="button button-secondary" type="button" disabled={exporting} onClick={() => void exportTraining()}><Download size={16} />{text("Tải dữ liệu huấn luyện CSV", "Download training CSV")}</button> : null}
          {exportError ? <ErrorState message={exportError} onRetry={exportTraining} /> : null}
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
          <h2>{text("Nhật ký bảo mật và thay đổi", "Security and audit log")}</h2>
          <div className="audit-filters">
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
                {resourceLabels[value]?.[locale] || value}
              </option>
            ))}
          </select>
          <select
            className="sort-dropdown"
            aria-label={text("Loại hoạt động", "Activity type")}
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
              setPage(1);
            }}
          >
            <option value="">{text("Mọi hoạt động", "All activities")}</option>
            {Object.keys(actionLabels).map((value) => (
              <option key={value} value={value}>
                {actionLabels[value]?.[locale] || value}
              </option>
            ))}
          </select>
          </div>
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
                    <th>{text("Chi tiết", "Details")}</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.data.logs.map((log) => (
                    <tr key={log._id}>
                      <td>{formatDate(log.createdAt)}</td>
                      <td>{log.actorName}</td>
                      <td title={log.action}>{log.resource === "Attachment" && log.action === "case.update" ? actionLabels["attachment.upload"][locale] : actionLabels[log.action]?.[locale] || log.action}</td>
                      <td title={log.resource}>{resourceLabels[log.resource]?.[locale] || log.resource}</td>
                      <td title={log.resourceId}>{log.changes?.rows !== undefined ? text(`${log.changes.rows} dòng · ${log.changes.format || "CSV"}`, `${log.changes.rows} rows · ${log.changes.format || "CSV"}`) : log.resourceLabel || log.changes?.code || log.changes?.filename || log.changes?.name || log.changes?.title || log.changes?.email || (log.resource === "User" && log.action.startsWith("auth.") ? log.actorName : log.changes?.caseId || log.resourceId || "-")}</td>
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
