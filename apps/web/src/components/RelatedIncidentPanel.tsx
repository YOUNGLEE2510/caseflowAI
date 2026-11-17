import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { Link2 } from "lucide-react";
import { api } from "../api";
import { useApiData } from "../hooks/useApiData";
import { useConfirmation } from "./ConfirmationProvider";
import { useLocale } from "../i18n";

export function RelatedIncidentPanel({ id, code, title }: { id: string; code: string; title: string }) {
  const { data, error, reload } = useApiData<{ matches: { id: string; code: string; title: string; score: number }[] }>(`/cases/${id}/related`);
  const confirm = useConfirmation();
  const navigate = useNavigate();
  const { text } = useLocale();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  if (!data?.matches.length && !error) return null;
  return <section className="page-stack">
    <h2>{text("Có thể liên quan đến sự cố chung", "Possible shared incident")}</h2>
    {error ? <p role="alert">{error} <button type="button" className="text-link" onClick={reload}>{text("Thử lại", "Retry")}</button></p> : null}
    {failure ? <p role="alert">{failure}</p> : null}
    {data?.matches.map(item => <Link key={item.id} to={`/cases/${item.id}`}>{item.code} · {item.title}</Link>)}
    {data?.matches.length ? <div><button type="button" className="button button-secondary" disabled={busy} onClick={async () => {
      if (!await confirm({ title: text("Tạo sự cố từ hồ sơ này", "Create incident from this request"),
        message: text("Kiểm tra nguyên nhân trước khi liên kết các phản ánh khác. Các hồ sơ vẫn được giữ riêng.", "Verify the cause before linking other requests. Each request remains separate.") })) return;
      setBusy(true);
      try { await api("/incidents", { method: "POST", body: JSON.stringify({ caseCode: code, title }) }); navigate("/incidents"); }
      catch (cause) { setFailure(cause instanceof Error ? cause.message : "Error"); }
      finally { setBusy(false); }
    }}><Link2 size={16} />{text("Tạo sự cố để điều phối", "Create incident for coordination")}</button></div> : null}
  </section>;
}
