import { AlertCircle, Inbox } from "lucide-react";
import { useLocale } from "../../i18n";

export function LoadingState({ label = "Đang tải dữ liệu" }: { label?: string }) {
  return (
    <div className="state-panel">
      <span className="spinner" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { text } = useLocale();
  return (
    <div className="state-panel state-error">
      <AlertCircle size={20} />
      <span>{message}</span>
      {onRetry ? (
        <button className="button button-secondary button-small" onClick={onRetry}>
          {text("Thử lại", "Retry")}
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <Inbox size={28} />
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}
