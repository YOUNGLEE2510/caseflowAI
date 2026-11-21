import type { CaseStatus, Priority } from "../../types";
import { useLocale } from "../../i18n";

const statusLabels: Record<CaseStatus, string> = {
  new: "Mới",
  triaged: "Đã phân loại",
  in_progress: "Đang xử lý",
  waiting: "Chờ phản hồi",
  resolved: "Đã giải quyết",
  closed: "Đã đóng"
};

const priorityLabels: Record<Priority, string> = {
  low: "Thấp",
  normal: "Bình thường",
  high: "Cao",
  urgent: "Khẩn cấp"
};

export function StatusBadge({ status }: { status: CaseStatus }) {
  const { text } = useLocale();
  const english: Record<CaseStatus, string> = {
    new: "New",
    triaged: "Triaged",
    in_progress: "In progress",
    waiting: "Waiting",
    resolved: "Resolved",
    closed: "Closed"
  };
  return (
    <span className={`badge badge-status badge-${status}`}>
      {text(statusLabels[status], english[status])}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const { text } = useLocale();
  const english: Record<Priority, string> = {
    low: "Low",
    normal: "Normal",
    high: "High",
    urgent: "Urgent"
  };
  return (
    <span className={`badge badge-priority priority-${priority}`}>
      {text(priorityLabels[priority], english[priority])}
    </span>
  );
}

export function RiskBadge({ score }: { score: number }) {
  const { text } = useLocale();
  const level = score >= 0.7 ? "high" : score >= 0.4 ? "medium" : "low";
  return (
    // The score comes from an experimental model trained on simulated data: say so on hover.
    <span className={`risk-badge risk-${level}`} title={text("Ước tính thử nghiệm từ mô hình học trên dữ liệu mô phỏng; hạn xử lý do SLA quyết định.", "Experimental estimate from a model trained on simulated data; deadlines follow the SLA.")}>
      <span className="risk-dot" />
      {Math.round(score * 100)}% {text("rủi ro (ước tính)", "risk (estimate)")}
    </span>
  );
}
