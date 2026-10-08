import { BrainCircuit, Star } from "lucide-react";
import { useApiData } from "../hooks/useApiData";
import { useLocale } from "../i18n";

interface CsatMetrics {
  eligible: number;
  responses: number;
  responseRate: number | null;
  averageScore: number | null;
}

interface AiMetrics {
  total: number;
  reviewed: number;
  pending: number;
  reviewCoverage: number | null;
}

function ProgressWidget({ icon, label, value, detail }: {
  icon: typeof Star;
  label: string;
  value: number;
  detail: string;
}) {
  const Icon = icon;
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <article className="progress-widget">
      <header>
        <span className="progress-widget-icon"><Icon size={16} /></span>
        <span>{label}</span>
        <strong>{Math.round(safeValue)}%</strong>
      </header>
      <div className="progress-widget-track" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(safeValue)} role="progressbar">
        <span style={{ width: `${safeValue}%` }} />
      </div>
      <small>{detail}</small>
    </article>
  );
}

export function OperationsProgress() {
  const { text } = useLocale();
  const csat = useApiData<CsatMetrics>("/analytics/csat");
  const ai = useApiData<AiMetrics>("/analytics/ai-accuracy");

  const csatValue = csat.data?.averageScore === null || csat.data?.averageScore === undefined
    ? 0
    : csat.data.averageScore * 20;
  const aiValue = ai.data?.reviewCoverage || 0;

  return (
    <section className="operations-progress" aria-label={text("Tiến độ vận hành", "Operational progress")}>
      <ProgressWidget
        icon={Star}
        label={text("Hài lòng dịch vụ", "Service satisfaction")}
        value={csatValue}
        detail={csat.data
          ? text(`${csat.data.responses}/${csat.data.eligible} phản hồi trong 30 ngày`, `${csat.data.responses}/${csat.data.eligible} responses in 30 days`)
          : text("Chưa có phản hồi để đánh giá", "No feedback available yet")}
      />
      <ProgressWidget
        icon={BrainCircuit}
        label={text("Kiểm duyệt AI", "AI review coverage")}
        value={aiValue}
        detail={ai.data
          ? text(`${ai.data.reviewed}/${ai.data.total} dự đoán đã được đánh giá`, `${ai.data.reviewed}/${ai.data.total} predictions reviewed`)
          : text("Chưa có dữ liệu phân luồng", "No routing data available yet")}
      />
    </section>
  );
}
