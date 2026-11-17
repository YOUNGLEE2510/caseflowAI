import { Link2, Save, Unlink } from "lucide-react";
import { useState } from "react";
import { api } from "../api";
import { useApiData } from "../hooks/useApiData";
import { useLocale } from "../i18n";
import type { Incident } from "../types";
import { useConfirmation } from "./ConfirmationProvider";

export function IncidentEditor({ incident, onSaved }: { incident: Incident; onSaved: () => void }) {
  const { text } = useLocale();
  const confirm = useConfirmation();
  const path = `/incidents/${incident._id}`;
  const { data, error: loadError, loading, reload } = useApiData<{
    owners: { _id: string; name: string }[];
    candidates: { _id: string; code: string; title: string; unitCode?: string; score: number | null }[];
  }>(`${path}/options`);
  const [caseCode, setCaseCode] = useState("");
  const [ownerId, setOwnerId] = useState(incident.ownerId || "");
  const [status, setStatus] = useState(incident.status);
  const [resolution, setResolution] = useState(incident.resolution || "");
  const [rootCause, setRootCause] = useState(incident.rootCause || "");
  const [appointment, setAppointment] = useState(() => {
    if (!incident.appointmentAt) return "";
    const date = new Date(incident.appointmentAt);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function write(method: "PUT" | "PATCH", url: string, body: object, label: string) {
    if (!(await confirm({ title: label, message: text("Hồ sơ của từng người thuê vẫn được giữ riêng.", "Each tenant's request remains separate.") }))) return;
    setBusy(true);
    setError("");
    try {
      await api(url, { method, body: JSON.stringify(body) });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : text("Không thể cập nhật.", "Update failed."));
    } finally {
      setBusy(false);
    }
  }

  const link = (value: string, linked: boolean) => write("PUT", `${path}/cases`, { caseCode: value, linked },
    linked ? text("Liên kết hồ sơ", "Link request") : text("Gỡ liên kết", "Unlink request"));
  return <div className="page-stack">
    {error ? <p role="alert">{error}</p> : null}
    {loading ? <p role="status">{text("Đang tải lựa chọn…", "Loading options…")}</p> : null}
    {loadError ? <p role="alert">{loadError} <button type="button" className="text-link" onClick={reload}>{text("Thử lại", "Retry")}</button></p> : null}
    <form className="page-stack" onSubmit={event => {
      event.preventDefault();
      void write("PATCH", path, { version: incident.__v, ownerId: ownerId || null, status, severity: incident.severity,
        appointmentAt: appointment ? new Date(appointment).toISOString() : null, resolution, rootCause }, text("Lưu điều phối", "Save dispatch"));
    }}>
      <label className="field"><span>{text("Người phụ trách", "Owner")}</span>
        <select value={ownerId} disabled={!data} onChange={event => setOwnerId(event.target.value)}>
          <option value="">{text("Chưa giao", "Unassigned")}</option>
          {ownerId && !data?.owners.some(owner => owner._id === ownerId) ? <option value={ownerId}>{incident.ownerName}</option> : null}
          {data?.owners.map(owner => <option key={owner._id} value={owner._id}>{owner.name}</option>)}
        </select>
      </label>
      <label className="field"><span>{text("Lịch hẹn sửa", "Repair appointment")}</span><input type="datetime-local" value={appointment} onChange={event => setAppointment(event.target.value)} /></label>
      <label className="field"><span>{text("Trạng thái", "Status")}</span>
        <select value={status} onChange={event => setStatus(event.target.value as Incident["status"])}>
          <option value="monitoring">{text("Đang theo dõi", "Monitoring")}</option>
          <option value="investigating">{text("Đang điều tra", "Investigating")}</option>
          <option value="mitigated">{text("Đã giảm thiểu", "Mitigated")}</option>
          <option value="resolved">{text("Đã giải quyết", "Resolved")}</option>
        </select>
      </label>
      <label className="field"><span>{text("Nguyên nhân đã xác minh", "Verified root cause")}</span><textarea maxLength={2000} value={rootCause} onChange={event => setRootCause(event.target.value)} /></label>
      <label className="field"><span>{text("Kết quả kiểm tra / xử lý", "Inspection / repair outcome")}</span><textarea maxLength={2000} required={status === "resolved"} value={resolution} onChange={event => setResolution(event.target.value)} /></label>
      <button type="submit" className="button button-primary" disabled={busy || !data}><Save size={16} />{text("Lưu điều phối", "Save dispatch")}</button>
    </form>
    <form className="page-stack" onSubmit={event => { event.preventDefault(); void link(caseCode, true); }}>
      <label className="field"><span>{text("Mã hồ sơ cần liên kết", "Request code to link")}</span><input required maxLength={64} value={caseCode} onChange={event => setCaseCode(event.target.value)} /></label>
      <button type="submit" className="button button-secondary" disabled={busy}><Link2 size={16} />{text("Liên kết", "Link")}</button>
    </form>
    {data?.candidates.length ? <section className="incident-case-list incident-action-list">
      <h3>{text("Phản ánh gần đây cùng cơ sở", "Recent requests at this property")}</h3>
      {data.candidates.map(item => <button type="button" className="button button-secondary" key={item._id} disabled={busy}
        onClick={() => void link(item.code, true)}>
        <Link2 size={16} /> <span>{item.code} · {item.unitCode ? `${item.unitCode} · ` : ""}{item.title}
          {item.score !== null ? ` · ${text("Tương đồng", "Similarity")} ${Math.round(item.score * 100)}%` : ""}</span>
      </button>)}
    </section> : null}
    {incident.caseIds.length > 1 ? <section className="incident-case-list incident-action-list">
      <h3>{text("Gỡ liên kết hồ sơ", "Unlink requests")}</h3>
      {incident.caseIds.map(item => <button type="button" className="button button-secondary" disabled={busy} key={item._id} onClick={() => void link(item.code, false)}>
        <Unlink size={16} /> <span>{item.code} · {item.title}</span>
      </button>)}
    </section> : null}
  </div>;
}
