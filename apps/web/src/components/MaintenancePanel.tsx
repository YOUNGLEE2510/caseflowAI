import { useRef, useState } from "react";
import { Save, Play, CheckCheck, X } from "lucide-react";
import { api } from "../api";
import { useApiData } from "../hooks/useApiData";
import { useAuth } from "../auth";
import { useLocale } from "../i18n";
import { useConfirmation } from "./ConfirmationProvider";

type Task = { _id: string; __v: number; title: string; assetCode: string; dueAt: string; status: string; result: string };
export function MaintenancePanel({ assets }: { assets: { code: string; name: string }[] }) {
  const { data, error, reload } = useApiData<{ tasks: Task[]; owners: { _id: string; name: string }[] }>("/rental/tasks");
  const { user } = useAuth();
  const manage = user?.role !== "agent";
  const { text } = useLocale();
  const confirm = useConfirmation();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [results, setResults] = useState<Record<string, string>>({});
  const pending = useRef<{ body: string; key: string } | null>(null);
  const statusLabel: Record<string, string> = { planned: text("Đã lên lịch", "Planned"), in_progress: text("Đang xử lý", "In progress"),
    completed: text("Hoàn thành", "Completed"), cancelled: text("Đã hủy", "Cancelled") };
  async function update(task: Task, status: string) {
    if (!await confirm({ title: statusLabel[status], message: task.title })) return;
    setBusy(true); setFailure("");
    try {
      await api(`/rental/tasks/${task._id}`, { method: "PATCH", body: JSON.stringify({ version: task.__v, status, result: results[task._id] || "" }) });
      await reload();
    } catch (cause) { setFailure(cause instanceof Error ? cause.message : "Error"); }
    finally { setBusy(false); }
  }
  return <section className="page-stack">
    <h2>{text("Phiếu sửa chữa theo thiết bị", "Asset repair tasks")}</h2>
    {error ? <p role="alert">{error} <button type="button" onClick={reload}>{text("Thử lại", "Retry")}</button></p> : null}
    {failure ? <p role="alert">{failure}</p> : null}
    {manage ? <form className="page-stack" onSubmit={async event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const body = JSON.stringify({ title: form.get("title"), assetCode: form.get("assetCode"), assigneeId: form.get("assigneeId"),
        dueAt: new Date(String(form.get("dueAt"))).toISOString() });
      if (!await confirm({ title: text("Tạo phiếu sửa", "Create repair task"), message: String(form.get("title")) })) return;
      if (pending.current?.body !== body) pending.current = { body, key: crypto.randomUUID() };
      setBusy(true); setFailure("");
      try { await api(`/rental/tasks/${pending.current.key}`, { method: "PUT", body }); pending.current = null; await reload(); }
      catch (cause) { setFailure(cause instanceof Error ? cause.message : "Error"); }
      finally { setBusy(false); }
    }}>
      <label className="field"><span>{text("Nội dung sửa chữa", "Repair task")}</span><input name="title" required minLength={3} maxLength={160} /></label>
      <label className="field"><span>{text("Thiết bị", "Asset")}</span><select required name="assetCode"><option value="">{text("Chọn thiết bị", "Select asset")}</option>
        {assets.map(asset => <option key={asset.code} value={asset.code}>{asset.code} · {asset.name}</option>)}</select></label>
      <label className="field"><span>{text("Kỹ thuật viên", "Technician")}</span><select required name="assigneeId"><option value="">{text("Chọn người xử lý", "Select technician")}</option>
        {data?.owners.map(owner => <option key={owner._id} value={owner._id}>{owner.name}</option>)}</select></label>
      <label className="field"><span>{text("Hạn sửa chữa", "Due date")}</span><input type="datetime-local" name="dueAt" required /></label>
      <div><button className="button button-primary" disabled={busy || !data}><Save size={16} />{text("Tạo phiếu sửa", "Create repair task")}</button></div>
    </form> : null}
    {data?.tasks.map(task => <article key={task._id} className="page-stack">
      <h3>{task.assetCode} · {task.title}</h3><p>{statusLabel[task.status]} · {new Date(task.dueAt).toLocaleString()}</p>
      {task.result ? <p>{task.result}</p> : null}
      {["planned", "in_progress"].includes(task.status) ? <>
        <label className="field"><span>{text("Kết quả / Lý do", "Outcome / Reason")}</span><textarea maxLength={2000} value={results[task._id] || ""} onChange={event => setResults({ ...results, [task._id]: event.target.value })} /></label>
        <div className="button-row">
          {task.status === "planned" ? <button type="button" className="button button-secondary" disabled={busy} onClick={() => void update(task, "in_progress")}><Play size={16} />{text("Bắt đầu", "Start")}</button> :
            <button type="button" className="button button-primary" disabled={busy || !results[task._id]?.trim()} onClick={() => void update(task, "completed")}><CheckCheck size={16} />{text("Hoàn thành", "Complete")}</button>}
          {manage ? <button type="button" className="button button-secondary" disabled={busy || !results[task._id]?.trim()} onClick={() => void update(task, "cancelled")}><X size={16} />{text("Hủy phiếu", "Cancel task")}</button> : null}
        </div>
      </> : null}
    </article>)}
  </section>;
}
