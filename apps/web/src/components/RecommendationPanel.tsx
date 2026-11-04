import { useEffect, useState } from "react";
import { Check, Sparkles, X } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useLocale } from "../i18n";

interface Recommendation {
  _id: string;
  items: Array<{ _id: string; action: string; reason: string; content?: string; decision: string; caseId?: string }>;
  citations: Array<{ id: string; title: string; excerpt: string; sourceLabel: string; version: string }>;
}

export function RecommendationPanel({ caseId, description, serviceKey, customFields, onDraft, onAction, overview = false, autoSuggest = false }: {
  caseId?: string; description?: string; serviceKey?: string; customFields?: Record<string, string>;
  onDraft?: (value: string) => void;
  onAction?: (action: string) => void;
  overview?: boolean;
  autoSuggest?: boolean;
}) {
  const { text } = useLocale();
  const [result, setResult] = useState<{ recommendation: Recommendation; fingerprint: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dismissReasons, setDismissReasons] = useState<Record<string, string>>({});
  const fingerprint = overview ? "{}" : JSON.stringify({ caseId, text: description, serviceKey, customFields });
  const recommendation = result?.fingerprint === fingerprint ? result.recommendation : null;
  useEffect(() => {
    if (!autoSuggest || caseId || overview || (description?.trim().length || 0) < 30) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setBusy(true); setError("");
      void api<{ recommendation: Recommendation }>("/recommendations", { method: "POST", body: fingerprint, signal: controller.signal })
        .then(response => { if (!controller.signal.aborted) setResult({ ...response, fingerprint }); })
        .catch(() => { if (!controller.signal.aborted) setError(text("Không tải được gợi ý. Bạn vẫn có thể gửi yêu cầu.", "Suggestions unavailable. You can still submit your request.")); })
        .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    }, 4000);
    return () => { window.clearTimeout(timer); controller.abort(); setBusy(false); };
  }, [autoSuggest, caseId, overview, description, fingerprint, text]);
  async function generate() {
    setBusy(true); setError("");
    try {
      const response = await api<{ recommendation: Recommendation }>(overview ? "/recommendations/overview" : "/recommendations", { method: "POST", body: fingerprint });
      setResult({ ...response, fingerprint });
    } catch (e) { setError(e instanceof Error ? e.message : text("Không tải được gợi ý.", "Unable to load suggestions.")); }
    finally { setBusy(false); }
  }
  async function decide(item: Recommendation["items"][number], decision: "accepted" | "dismissed") {
    if (!recommendation || busy) return;
    setBusy(true); setError("");
    try {
      const response = await api<{ recommendation: Recommendation }>(`/recommendations/${recommendation._id}/items/${item._id}`, {
        method: "PATCH", body: JSON.stringify({ decision, ...(decision === "dismissed" ? { reason: dismissReasons[item._id] || "unspecified" } : {}) }) });
      setResult({ ...response, fingerprint });
      if (decision === "accepted" && item.action === "draft_reply" && item.content) onDraft?.(item.content);
      if (decision === "accepted") onAction?.(item.action);
    } catch (e) { setError(e instanceof Error ? e.message : text("Không lưu được đánh giá.", "Unable to save feedback.")); }
    finally { setBusy(false); }
  }
  if (autoSuggest && !busy && !error && !recommendation?.items.length && !recommendation?.citations.length) return null;
  return <section className="panel recommendation-panel">
    <div className="panel-heading"><h2>{overview ? text("Gợi ý điều phối", "Operations suggestions") : autoSuggest ? text("Hướng dẫn liên quan", "Related guidance") : text("Gợi ý xử lý", "Suggested next steps")}</h2>
      <button type="button" className="button button-secondary" disabled={busy || (!overview && !caseId && (description?.trim().length || 0) < 12)} onClick={generate}>
        <Sparkles size={16} />{busy ? text("Đang tải", "Loading") : text("Lấy gợi ý", "Get suggestions")}
      </button></div>
    {error && <p role="alert">{error}</p>}
    {recommendation?.items.map(item => <div key={item._id} className="recommendation-item">
      <p>{item.reason}</p>
      {item.caseId && <p><Link className="text-link" to={`/cases/${item.caseId}`}>{text("Mở hồ sơ", "Open case")}</Link></p>}
      {item.content && <p className="recommendation-draft">{item.content}</p>}
      {item.decision === "pending" ? <div className="recommendation-actions">
        <select aria-label={text("Lý do bỏ qua", "Dismissal reason")} value={dismissReasons[item._id] || ""} onChange={event => setDismissReasons(current => ({ ...current, [item._id]: event.target.value }))}>
          <option value="">{text("Lý do bỏ qua (tùy chọn)", "Dismissal reason (optional)")}</option>
          <option value="incorrect">{text("Gợi ý chưa đúng", "Incorrect")}</option>
          <option value="not_applicable">{text("Không áp dụng", "Not applicable")}</option>
          <option value="already_done">{text("Đã thực hiện", "Already done")}</option>
        </select>
        <button type="button" className="button button-secondary" disabled={busy} onClick={() => decide(item, "accepted")}><Check size={16} />{text("Chấp nhận", "Accept")}</button>
        <button type="button" className="button button-secondary" disabled={busy} onClick={() => decide(item, "dismissed")}><X size={16} />{text("Bỏ qua", "Dismiss")}</button>
      </div> : <p role="status">{item.decision === "accepted" ? text("Đã ghi nhận đánh giá", "Feedback recorded") : text("Đã bỏ qua", "Dismissed")}</p>}
    </div>)}
    {recommendation?.citations.map((source, index) => <details key={source.id} className="recommendation-citation">
      <summary>[S{index + 1}] {source.title} · {source.version}</summary><p>{source.excerpt}</p><small>{source.sourceLabel}</small>
    </details>)}
  </section>;
}
