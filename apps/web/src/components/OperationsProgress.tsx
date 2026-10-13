import { BrainCircuit, RefreshCw, Star } from "lucide-react";
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

function ProgressWidget({ icon, label, value, displayValue, detail, loading, error, onRetry }: {
  icon: typeof Star;
  label: string;
  value: number | null;
  displayValue?: string;
  detail: string;
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  const { text } = useLocale();
  const Icon = icon;
  const safeValue = Math.max(0, Math.min(100, value ?? 0));
  return (
    <article className="progress-widget">
      <header>
        <span className="progress-widget-icon"><Icon size={16} /></span>
        <span>{label}</span>
        <strong>{loading || error ? "—" : displayValue || (value === null ? text("Chưa có dữ liệu", "No data") : `${Math.round(safeValue)}%`)}</strong>
      </header>
      {!loading && !error && value !== null ? <div className="progress-widget-track" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(safeValue)} role="progressbar">
        <span style={{ width: `${safeValue}%` }} />
      </div> : null}
      {error ? <div className="widget-error" role="alert"><small>{text("Không thể tải chỉ số", "Unable to load metric")}</small><button type="button" className="icon-button" aria-label={text("Thử lại", "Retry")} title={text("Thử lại", "Retry")} onClick={onRetry}><RefreshCw size={16} /></button></div> : <small>{loading ? text("Đang tải", "Loading") : detail}</small>}
    </article>
  );
}

export function OperationsProgress() {
  const { text } = useLocale();
  const csat = useApiData<CsatMetrics>("/analytics/csat");
  const ai = useApiData<AiMetrics>("/analytics/ai-accuracy");

  const csatValue = csat.data?.averageScore === null || csat.data?.averageScore === undefined
    ? null
    : csat.data.averageScore * 20;
  const aiValue = ai.data?.reviewCoverage ?? null;

  return (
    <section className="operations-progress" aria-label={text("Tiến độ vận hành", "Operational progress")}>
      <ProgressWidget
        icon={Star}
        label={text("Hài lòng dịch vụ", "Service satisfaction")}
        value={csatValue}
        displayValue={csatValue === null ? undefined : `${csat.data!.averageScore!.toFixed(1)}/5`}
        loading={csat.loading} error={csat.error} onRetry={csat.reload}
        detail={csat.data
          ? text(`${csat.data.responses}/${csat.data.eligible} phản hồi trong 30 ngày`, `${csat.data.responses}/${csat.data.eligible} responses in 30 days`)
          : text("Chưa có phản hồi để đánh giá", "No feedback available yet")}
      />
      <ProgressWidget
        icon={BrainCircuit}
        label={text("Kiểm duyệt AI", "AI review coverage")}
        value={aiValue}
        loading={ai.loading} error={ai.error} onRetry={ai.reload}
        detail={ai.data
          ? text(`${ai.data.reviewed}/${ai.data.total} dự đoán đã được đánh giá`, `${ai.data.reviewed}/${ai.data.total} predictions reviewed`)
          : text("Chưa có dữ liệu phân luồng", "No routing data available yet")}
      />
    </section>
  );
}
