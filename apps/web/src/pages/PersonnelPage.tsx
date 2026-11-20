import { useState } from "react";
import { PersonnelLeave } from "../components/PersonnelLeave";
import "./personnel.css";
import { Save, Pencil, X } from "lucide-react";
import { useApiData } from "../hooks/useApiData";
import { useAuth } from "../auth";
import { api } from "../api";
import { useConfirmation } from "../components/ConfirmationProvider";
import { useToast } from "../components/Toast";
import { ErrorState, LoadingState, Pagination } from "../components/ui";
import { useLocale } from "../i18n";

type Member = { _id: string; name: string; email: string; role: string; team: string; title: string; employeeCode?: string; phone?: string; skills?: string[]; maxCaseload: number; employmentStatus?: string; joinedAt?: string | null; workingDays?: number[]; workStart?: string; workEnd?: string; workload: { open: number; completed30: number; overdue: number }; quality: { total: number; onTime: number; csat: number | null; rated: number } };
const statuses: Record<string, { vi: string; en: string }> = {
  working: { vi: "Đang làm việc", en: "Working" },
  on_leave: { vi: "Tạm nghỉ", en: "On leave" },
  inactive: { vi: "Ngừng làm việc", en: "Inactive" }
};
const dayLabel = (day: number, locale: "vi" | "en") => locale === "vi"
  ? (day === 0 ? "CN" : `T${day + 1}`)
  : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day];

export function PersonnelPage() {
  const { user } = useAuth();
  const { locale, text } = useLocale();
  const canManage = Boolean(user?.personnelManager || (user && ["manager", "org_admin", "platform_admin"].includes(user.role)));
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const { data, loading, error, reload } = useApiData<{ members: Member[]; total: number; totalPages: number }>(`/personnel?page=${page}&limit=20&q=${encodeURIComponent(search)}`);
  const [editing, setEditing] = useState<Member | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const confirm = useConfirmation();
  const toast = useToast();
  async function save() {
    if (!editing || busy) return;
    const openWork = editing.employmentStatus !== "working" && editing.workload.open > 0;
    // Only ask first when the change leaves open cases without an available assignee.
    if (openWork && !await confirm({
      title: text("Lưu hồ sơ nhân sự?", "Save personnel record?"),
      message: text(`${editing.name} · Còn ${editing.workload.open} hồ sơ đang xử lý; cần phân công lại thủ công.`, `${editing.name} · ${editing.workload.open} open cases must be reassigned manually.`)
    })) return;
    setBusy(true);
    try {
      await api(`/personnel/${editing._id}`, { method: "PATCH", body: JSON.stringify({ employeeCode: editing.employeeCode || "", title: editing.title, phone: editing.phone || "", skills: (editing.skills || []).map(value => value.trim()).filter(Boolean), maxCaseload: Number(editing.maxCaseload), employmentStatus: editing.employmentStatus || "working", joinedAt: editing.joinedAt?.slice(0, 10) || null, workingDays: editing.workingDays || [1, 2, 3, 4, 5], workStart: editing.workStart || "08:00", workEnd: editing.workEnd || "17:00" }) });
      setEditing(null); await reload(); toast.success(text("Đã lưu hồ sơ nhân sự.", "Personnel record saved."));
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : text("Không thể lưu hồ sơ.", "Unable to save the record.")); }
    finally { setBusy(false); }
  }
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const days = [1, 2, 3, 4, 5, 6, 0];
  return <div className="page-stack personnel-page">
    <div className="page-heading"><h1>{text("Nhân sự", "Personnel")}</h1></div>
    <form className="button-row" onSubmit={event => { event.preventDefault(); setPage(1); setSearch(query.trim()); }}>
      <label>{text("Tìm nhân viên", "Find staff")}<input value={query} onChange={event => setQuery(event.target.value)} placeholder={text("Bắt đầu bằng tên, mã hoặc đơn vị", "Start with a name, code or team")} /></label>
      <button className="button button-secondary" type="submit">{text("Tìm kiếm", "Search")}</button>
    </form>
    <div className="personnel-table"><table className="data-table"><thead><tr>
      <th>{text("Nhân viên", "Staff")}</th><th>{text("Đơn vị / chức danh", "Team / title")}</th><th>{text("Trạng thái", "Status")}</th>
      <th>{text("Tải / giới hạn", "Load / limit")}</th><th>{text("Hoàn tất (30 ngày)", "Completed (30 days)")}</th><th>{text("Quá hạn", "Overdue")}</th>
      <th>{text("Lịch làm việc", "Schedule")}</th><th />
    </tr></thead><tbody>
      {data?.members.map(member => <tr key={member._id}>
        <td>{member.name}<div>{member.employeeCode || text("Chưa có mã", "No code")}</div></td>
        <td>{member.team}<div>{member.title}</div></td>
        <td>{statuses[member.employmentStatus || "working"]?.[locale]}</td>
        <td>{member.workload.open} / {member.maxCaseload}</td><td>{member.workload.completed30}</td><td>{member.workload.overdue}</td>
        <td>{(member.workingDays || [1, 2, 3, 4, 5]).map(day => dayLabel(day, locale)).join(", ")}<div>{member.workStart || "08:00"}–{member.workEnd || "17:00"}</div></td>
        <td>{canManage && !(user?.role === "manager" && !user.personnelManager && member.role !== "agent") && <button className="button button-secondary" onClick={() => setEditing(member)} aria-label={text(`Sửa ${member.name}`, `Edit ${member.name}`)}><Pencil size={16} /></button>}</td>
      </tr>)}
    </tbody></table>{!data?.members.length && <p>{text("Chưa có nhân viên trong phạm vi của bạn.", "No staff in your scope yet.")}</p>}</div>
    <Pagination page={page} totalPages={data?.totalPages || 0} total={data?.total || 0} limit={20} onPageChange={setPage} />
    {editing && <form className="panel" onSubmit={event => { event.preventDefault(); void save(); }} style={{ padding: 24, display: "grid", gap: 16, maxWidth: 640 }}>
      <h2>{editing.name}</h2>
      <p>{text("30 ngày", "30 days")} · {text("Đúng hạn", "On time")}: {editing.quality?.onTime || 0}/{editing.quality?.total || 0} · {text("Hài lòng", "Satisfaction")}: {editing.quality?.csat == null ? text("Chưa có đánh giá", "No ratings yet") : `${editing.quality.csat.toFixed(1)}/5 (${editing.quality.rated} ${text("đánh giá", "ratings")})`}</p>
      {([["employeeCode", text("Mã nhân viên", "Employee code")], ["title", text("Chức danh", "Title")], ["phone", text("Số điện thoại", "Phone")]] as const).map(([key, label]) => <label key={key}>{label}<input maxLength={key === "title" ? 120 : key === "phone" ? 30 : 40} value={editing[key] || ""} onChange={event => setEditing({ ...editing, [key]: event.target.value })} /></label>)}
      <label>{text("Ngày vào làm", "Start date")}<input type="date" value={editing.joinedAt?.slice(0, 10) || ""} onChange={event => setEditing({ ...editing, joinedAt: event.target.value || null })} /></label>
      <label>{text("Trạng thái", "Status")}<select value={editing.employmentStatus || "working"} onChange={event => setEditing({ ...editing, employmentStatus: event.target.value })}>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label[locale]}</option>)}</select></label>
      <label>{text("Giới hạn hồ sơ đang xử lý", "Open case limit")}<input type="number" min={1} max={100} required value={editing.maxCaseload} onChange={event => setEditing({ ...editing, maxCaseload: Number(event.target.value) })} /></label>
      <label>{text("Chuyên môn (phân cách bằng dấu phẩy)", "Skills (comma separated)")}<input value={(editing.skills || []).join(",")} onChange={event => setEditing({ ...editing, skills: event.target.value.split(",") })} /></label>
      <fieldset><legend>{text("Lịch làm việc (giờ Việt Nam)", "Working schedule (Vietnam time)")}</legend><div className="button-row">{days.map(day => <label key={day}><input type="checkbox" checked={(editing.workingDays || [1, 2, 3, 4, 5]).includes(day)} onChange={event => setEditing({ ...editing, workingDays: event.target.checked ? [...(editing.workingDays || [1, 2, 3, 4, 5]), day] : (editing.workingDays || [1, 2, 3, 4, 5]).filter(value => value !== day) })} />{dayLabel(day, locale)}</label>)}</div>
        <label>{text("Bắt đầu", "Start")}<input type="time" value={editing.workStart || "08:00"} onChange={event => setEditing({ ...editing, workStart: event.target.value })} /></label><label>{text("Kết thúc", "End")}<input type="time" value={editing.workEnd || "17:00"} onChange={event => setEditing({ ...editing, workEnd: event.target.value })} /></label>
      </fieldset>
      <div className="button-row"><button type="submit" className="button button-primary" disabled={busy}><Save size={16} />{text("Lưu", "Save")}</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => setEditing(null)}><X size={16} />{text("Hủy", "Cancel")}</button></div>
    </form>}
    <PersonnelLeave />
  </div>;
}
