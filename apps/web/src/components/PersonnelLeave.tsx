import { useState, type FormEvent } from "react";
import { Check, X, Plus } from "lucide-react";
import { useApiData } from "../hooks/useApiData";
import { useAuth } from "../auth";
import { api } from "../api";
import { useConfirmation } from "./ConfirmationProvider";
import { useToast } from "./Toast";
import { ErrorState, LoadingState, Pagination } from "./ui";

type Leave = { _id: string; employeeId: string; employeeName: string; start: string; end: string; reason: string; status: string; reviewNote?: string };
const labels: Record<string, string> = { pending: "Chờ duyệt", approved: "Đã duyệt", rejected: "Từ chối", cancelled: "Đã hủy" };
export function PersonnelLeave() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const { data, reload, error, loading } = useApiData<{ leaves: Leave[]; total: number; totalPages: number }>(`/personnel/leaves?page=${page}&limit=10`);
  const confirm = useConfirmation(); const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState({ start: "", end: "", reason: "" });
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !await confirm({ title: "Gửi đơn nghỉ phép?", message: `${draft.start} → ${draft.end}` })) return;
    setBusy(true);
    try { await api("/personnel/leaves", { method: "POST", body: JSON.stringify(draft) }); setDraft({ start: "", end: "", reason: "" }); await reload(); toast.success("Đã gửi đơn nghỉ phép."); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Không thể gửi đơn."); } finally { setBusy(false); }
  }
  async function review(leave: Leave, status: string) {
    if (busy || !await confirm({ title: `${labels[status]} đơn nghỉ?`, message: `${leave.employeeName}: ${leave.start} → ${leave.end}`, danger: status !== "approved" })) return;
    setBusy(true);
    try { await api(`/personnel/${leave.employeeId}/leaves/${leave._id}`, { method: "PATCH", body: JSON.stringify({ status, reviewNote: reviewNotes[leave._id] || "" }) }); await reload(); toast.success("Đã cập nhật đơn nghỉ."); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Không thể cập nhật."); } finally { setBusy(false); }
  }
  return <section className="personnel-section"><h2>Nghỉ phép</h2>
    <form onSubmit={submit} className="personnel-form">
      <label>Từ ngày<input type="date" required value={draft.start} onChange={event => setDraft({ ...draft, start: event.target.value })} /></label>
      <label>Đến ngày<input type="date" required min={draft.start} value={draft.end} onChange={event => setDraft({ ...draft, end: event.target.value })} /></label>
      <label className="personnel-wide">Lý do<textarea required minLength={5} maxLength={500} value={draft.reason} onChange={event => setDraft({ ...draft, reason: event.target.value })} /></label>
      <button className="button button-primary" disabled={busy}><Plus size={16} />Gửi đơn</button>
    </form>
    {error && <ErrorState message={error} onRetry={reload} />}
    {loading && <LoadingState />}
    {!loading && !error && !data?.leaves.length && <p>Chưa có đơn nghỉ phép.</p>}
    <div className="personnel-leaves">{data?.leaves.slice().sort((a, b) => b.start.localeCompare(a.start)).map(leave => <article key={leave._id} className="personnel-leave">
      <div><strong>{leave.employeeName}</strong><p>{leave.start} → {leave.end} · {labels[leave.status]}</p><p>{leave.reason}</p></div>
      <div className="button-row">{leave.employeeId === user?.id && leave.status === "pending" && <button className="button button-secondary" disabled={busy} onClick={() => void review(leave, "cancelled")}><X size={16} />Hủy đơn</button>}
        {leave.employeeId !== user?.id && (user?.role !== "agent" || user.personnelManager) && leave.status === "pending" && <><label>Lý do từ chối<input maxLength={500} value={reviewNotes[leave._id] || ""} onChange={event => setReviewNotes({ ...reviewNotes, [leave._id]: event.target.value })} /></label><button className="button button-primary" disabled={busy} onClick={() => void review(leave, "approved")}><Check size={16} />Duyệt</button><button className="button button-secondary" disabled={busy || !reviewNotes[leave._id]?.trim()} onClick={() => void review(leave, "rejected")}><X size={16} />Từ chối</button></>}
      </div>
    </article>)}</div>
    <Pagination page={page} totalPages={data?.totalPages || 0} total={data?.total || 0} limit={10} onPageChange={setPage} />
  </section>;
}
