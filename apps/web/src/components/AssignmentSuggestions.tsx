import { useEffect, useState } from "react";
import { RefreshCw, UserPlus } from "lucide-react";
import { api } from "../api";
import { useLocale } from "../i18n";

interface Option { id: string; name: string; open: number; overdue: number; capacity: number; atCapacity: boolean; skillMatch: boolean }
export function AssignmentSuggestions({ caseId, revision, saving, onAssign }: {
  caseId: string; revision: string; saving: boolean; onAssign: (id: string) => void;
}) {
  const { text } = useLocale();
  const [options, setOptions] = useState<Option[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<{ options: Option[] }>(`/cases/${caseId}/assignment-options`, { signal: controller.signal })
      .then((response) => { if (!controller.signal.aborted) setOptions(response.options); })
      .catch((err) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Request failed"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [caseId, revision, refresh]);
  return <section className="panel">
    <div className="panel-heading"><h2>{text("Gợi ý phân công", "Assignment suggestions")}</h2>
      <button type="button" className="button button-small" title={text("Cập nhật tải công việc", "Refresh workload")} aria-label={text("Cập nhật tải công việc", "Refresh workload")} disabled={loading || saving} onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={16} /></button>
    </div>
    {loading ? <p role="status">{text("Đang tải", "Loading")}</p> : error ? <p role="alert">{error}</p> : <ul className="assignment-options">
      {options.map((option) => <li key={option.id}><div><strong>{option.name}</strong><p>{text(`${option.open}/${option.capacity} hồ sơ · ${option.overdue} quá hạn`, `${option.open}/${option.capacity} cases · ${option.overdue} overdue`)}</p>
        {option.skillMatch ? <small>{text("Khớp kỹ năng dịch vụ", "Service skill match")}</small> : null}
        {option.atCapacity ? <small>{text("Đã đạt giới hạn tải", "At workload capacity")}</small> : null}
      </div><button type="button" className="button button-small" disabled={saving || option.atCapacity} onClick={() => onAssign(option.id)} aria-label={text(`Giao cho ${option.name}`, `Assign to ${option.name}`)} title={text(`Giao cho ${option.name}`, `Assign to ${option.name}`)}><UserPlus size={16} /></button></li>)}
      {!options.length ? <li>{text("Chưa có nhân viên phù hợp trong đơn vị.", "No eligible agents in this team.")}</li> : null}
    </ul>}
  </section>;
}
