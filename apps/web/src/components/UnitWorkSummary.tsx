import { ArrowRight, CheckCircle2, Hammer, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useApiData } from "../hooks/useApiData";
import { useLocale } from "../i18n";

interface UnitSummary { total: number; rentable: number; readiness: Record<string, number> }

/** Unit board at a glance, for housekeeping and for staff whose request queue is empty. */
export function UnitWorkSummary() {
  const { text } = useLocale();
  const { data, error } = useApiData<{ summary: UnitSummary }>("/rental/units?view=summary");
  if (error || !data) return null;
  const { summary } = data;
  const items = [
    { key: "needs_cleaning", icon: Sparkles, label: text("Căn chờ dọn", "Units to clean"), value: summary.readiness.needs_cleaning || 0 },
    { key: "under_repair", icon: Hammer, label: text("Căn đang tu sửa", "Units under repair"), value: summary.readiness.under_repair || 0 },
    { key: "rentable", icon: CheckCircle2, label: text("Sẵn sàng cho thuê", "Ready to let"), value: summary.rentable }
  ];
  return (
    <section className="unit-work-summary panel" aria-labelledby="unit-work-title">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">{text(`${summary.total} căn hộ`, `${summary.total} units`)}</span>
          <h2 id="unit-work-title">{text("Việc tại căn hộ", "Unit work")}</h2>
        </div>
        <Link to="/units" className="button button-secondary button-small">{text("Mở bảng căn hộ", "Open unit board")}<ArrowRight size={16} /></Link>
      </div>
      <div className="unit-work-grid">
        {items.map(item => (
          <Link key={item.key} to="/units" className="unit-work-item">
            <item.icon size={18} aria-hidden="true" />
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </Link>
        ))}
      </div>
    </section>
  );
}
