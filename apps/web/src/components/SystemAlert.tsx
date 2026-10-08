import { CircleAlert, Info, Siren } from "lucide-react";
import { useLocale } from "../i18n";

type AlertType = "breach" | "warning" | "info";

const icons = {
  breach: Siren,
  warning: CircleAlert,
  info: Info
};

export function SystemAlert({ type, title, detail, progress }: {
  type: AlertType;
  title: string;
  detail: string;
  progress?: number;
}) {
  const { text } = useLocale();
  const Icon = icons[type];
  const safeProgress = Math.max(0, Math.min(100, progress || 0));

  return (
    <div className={`system-alert system-alert-${type}`}>
      <span className="system-alert-icon"><Icon size={17} /></span>
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
        {progress !== undefined ? (
          <div className="system-alert-progress" aria-label={text(`${safeProgress}% cần theo dõi`, `${safeProgress}% requires monitoring`)}>
            <span style={{ width: `${safeProgress}%` }} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
