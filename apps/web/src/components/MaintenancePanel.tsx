import { useRef, useState } from "react";
import { Save, Play, CheckCheck, X, CalendarClock } from "lucide-react";
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
  const tasks = data?.tasks || [];
  const openTasks = tasks.filter(task => ["planned", "in_progress"].includes(task.status));
  const closedTasks = tasks.filter(task => !["planned", "in_progress"].includes(task.status));
  const tone: Record<string, string> = { planned: "badge-triaged", in_progress: "badge-waiting", completed: "badge-resolved", cancelled: "badge-closed" };
  const renderTask = (task: Task) => <article key={task._id} className={`repair-task repair-task-${task.status}`}>
    <div className="repair-task-head">
      <div><span className="repair-task-asset">{task.assetCode}</span><h3>{task.title}</h3></div>
      <span className={`badge badge-status ${tone[task.status] || "badge-closed"}`}>{statusLabel[task.status]}</span>
    </div>
    <p className="repair-task-due"><CalendarClock size={14} aria-hidden="true" />{text("Hạn", "Due")} {new Date(task.dueAt).toLocaleString()}</p>
    {task.result ? <p className="repair-task-result">{task.result}</p> : null}
    {["planned", "in_progress"].includes(task.status) ? <>
      <label className="field"><span>{text("Kết quả / Lý do", "Outcome / Reason")}</span><textarea rows={2} maxLength={2000} value={results[task._id] || ""} onChange={event => setResults({ ...results, [task._id]: event.target.value })} /></label>
      <div className="button-row">
        {task.status === "planned" ? <button type="button" className="button button-secondary button-small" disabled={busy} onClick={() => void update(task, "in_progress")}><Play size={14} />{text("Bắt đầu", "Start")}</button> :
          <button type="button" className="button button-primary button-small" disabled={busy || !results[task._id]?.trim()} onClick={() => void update(task, "completed")}><CheckCheck size={14} />{text("Hoàn thành", "Complete")}</button>}
        {manage ? <button type="button" className="button button-secondary button-small" disabled={busy || !results[task._id]?.trim()} onClick={() => void update(task, "cancelled")}><X size={14} />{text("Hủy phiếu", "Cancel task")}</button> : null}
      </div>
    </> : null}
  </article>;
  return <div className={manage ? "repair-layout" : "page-stack"}>
    <section className="panel repair-board">
      <div className="panel-heading"><div><span className="eyebrow">{text("Theo thiết bị", "By asset")}</span><h2>{text("Phiếu sửa chữa", "Repair tasks")}</h2></div>
        <span className="repair-count">{openTasks.length} {text("đang mở", "open")}</span></div>
      {error ? <p role="alert" className="form-error">{error} <button type="button" className="text-link" onClick={reload}>{text("Thử lại", "Retry")}</button></p> : null}
      {failure ? <p role="alert" className="form-error">{failure}</p> : null}
      {data && !tasks.length ? <p className="repair-empty">{text("Chưa có phiếu sửa chữa nào.", "No repair tasks yet.")}</p> : null}
      {openTasks.length ? <div className="repair-list">{openTasks.map(renderTask)}</div> : null}
      {closedTasks.length ? <details className="repair-closed"><summary>{text("Đã đóng", "Closed")} ({closedTasks.length})</summary><div className="repair-list">{closedTasks.map(renderTask)}</div></details> : null}
    </section>
    {manage ? <form className="panel repair-form" onSubmit={async event => {
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
      <div className="panel-heading"><h2>{text("Tạo phiếu mới", "New repair task")}</h2></div>
      <div className="rental-form-body">
        <label className="field"><span>{text("Nội dung sửa chữa", "Repair task")}</span><input name="title" required minLength={3} maxLength={160} /></label>
        <label className="field"><span>{text("Thiết bị", "Asset")}</span><select required name="assetCode"><option value="">{text("Chọn thiết bị", "Select asset")}</option>
          {assets.map(asset => <option key={asset.code} value={asset.code}>{asset.code} · {asset.name}</option>)}</select></label>
        <label className="field"><span>{text("Kỹ thuật viên", "Technician")}</span><select required name="assigneeId"><option value="">{text("Chọn người xử lý", "Select technician")}</option>
          {data?.owners.map(owner => <option key={owner._id} value={owner._id}>{owner.name}</option>)}</select></label>
        <label className="field"><span>{text("Hạn sửa chữa", "Due date")}</span><input type="datetime-local" name="dueAt" required /></label>
        <button className="button button-primary" disabled={busy || !data}><Save size={16} />{text("Tạo phiếu sửa", "Create repair task")}</button>
      </div>
    </form> : null}
  </div>;
}
