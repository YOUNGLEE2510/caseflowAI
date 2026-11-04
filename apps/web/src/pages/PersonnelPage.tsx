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

type Member = { _id: string; name: string; email: string; role: string; team: string; title: string; employeeCode?: string; phone?: string; skills?: string[]; maxCaseload: number; employmentStatus?: string; joinedAt?: string | null; workingDays?: number[]; workStart?: string; workEnd?: string; workload: { open: number; completed30: number; overdue: number }; quality: { total: number; onTime: number; csat: number | null; rated: number } };
const statuses: Record<string, string> = { working: "Đang làm việc", on_leave: "Tạm nghỉ", inactive: "Ngừng làm việc" };

export function PersonnelPage() {
  const { user } = useAuth();
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
    if (!editing || busy || !await confirm({ title: "Lưu hồ sơ nhân sự?", message: `${editing.name}${editing.employmentStatus !== "working" && editing.workload.open > 0 ? ` · Còn ${editing.workload.open} hồ sơ đang xử lý; cần phân công lại thủ công.` : ""}` })) return;
    setBusy(true);
    try {
      await api(`/personnel/${editing._id}`, { method: "PATCH", body: JSON.stringify({ employeeCode: editing.employeeCode || "", title: editing.title, phone: editing.phone || "", skills: (editing.skills || []).map(value => value.trim()).filter(Boolean), maxCaseload: Number(editing.maxCaseload), employmentStatus: editing.employmentStatus || "working", joinedAt: editing.joinedAt?.slice(0, 10) || null, workingDays: editing.workingDays || [1,2,3,4,5], workStart: editing.workStart || "08:00", workEnd: editing.workEnd || "17:00" }) });
      setEditing(null); await reload(); toast.success("Đã lưu hồ sơ nhân sự.");
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Không thể lưu hồ sơ."); }
    finally { setBusy(false); }
  }
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  return <div className="page-stack personnel-page">
    <div className="page-heading"><h1>Nhân sự</h1></div>
    <form className="button-row" onSubmit={event => { event.preventDefault(); setPage(1); setSearch(query.trim()); }}><label>Tìm nhân viên<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Bắt đầu bằng tên, mã hoặc đơn vị" /></label><button className="button button-secondary" type="submit">Tìm kiếm</button></form>
    <div className="personnel-table"><table className="data-table"><thead><tr><th>Nhân viên</th><th>Đơn vị / chức danh</th><th>Trạng thái</th><th>Tải / giới hạn</th><th>Hoàn tất (30 ngày)</th><th>Quá hạn</th><th>Lịch làm việc</th><th /></tr></thead><tbody>
      {data?.members.map(member => <tr key={member._id}>
        <td>{member.name}<div>{member.employeeCode || "Chưa có mã"}</div></td><td>{member.team}<div>{member.title}</div></td><td>{statuses[member.employmentStatus || "working"]}</td><td>{member.workload.open} / {member.maxCaseload}</td><td>{member.workload.completed30}</td><td>{member.workload.overdue}</td><td>{(member.workingDays || [1,2,3,4,5]).map(day => day === 0 ? "CN" : `T${day + 1}`).join(", ")}<div>{member.workStart || "08:00"}–{member.workEnd || "17:00"}</div></td>
        <td>{canManage && !(user?.role === "manager" && !user.personnelManager && member.role !== "agent") && <button className="button button-secondary" onClick={() => setEditing(member)} aria-label={`Sửa ${member.name}`}><Pencil size={16} /></button>}</td>
      </tr>)}
    </tbody></table>{!data?.members.length && <p>Chưa có nhân viên trong phạm vi của bạn.</p>}</div>
    <Pagination page={page} totalPages={data?.totalPages || 0} total={data?.total || 0} limit={20} onPageChange={setPage} />
    {editing && <form className="panel" onSubmit={event => { event.preventDefault(); void save(); }} style={{ padding: 24, display: "grid", gap: 16, maxWidth: 640 }}>
      <h2>{editing.name}</h2>
      <p>30 ngày · Đúng hạn: {editing.quality?.onTime || 0}/{editing.quality?.total || 0} · Hài lòng: {editing.quality?.csat == null ? "Chưa có đánh giá" : `${editing.quality.csat.toFixed(1)}/5 (${editing.quality.rated} đánh giá)`}</p>
      {([['employeeCode', 'Mã nhân viên'], ['title', 'Chức danh'], ['phone', 'Số điện thoại']] as const).map(([key, label]) => <label key={key}>{label}<input maxLength={key === 'title' ? 120 : key === 'phone' ? 30 : 40} value={editing[key] || ""} onChange={event => setEditing({ ...editing, [key]: event.target.value })} /></label>)}
      <label>Ngày vào làm<input type="date" value={editing.joinedAt?.slice(0, 10) || ""} onChange={event => setEditing({ ...editing, joinedAt: event.target.value || null })} /></label>
      <label>Trạng thái<select value={editing.employmentStatus || "working"} onChange={event => setEditing({ ...editing, employmentStatus: event.target.value })}>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Giới hạn hồ sơ đang xử lý<input type="number" min={1} max={100} required value={editing.maxCaseload} onChange={event => setEditing({ ...editing, maxCaseload: Number(event.target.value) })} /></label>
      <label>Chuyên môn (phân cách bằng dấu phẩy)<input value={(editing.skills || []).join(",")} onChange={event => setEditing({ ...editing, skills: event.target.value.split(",") })} /></label>
      <fieldset><legend>Lịch làm việc (giờ Việt Nam)</legend><div className="button-row">{[1,2,3,4,5,6,0].map(day => <label key={day}><input type="checkbox" checked={(editing.workingDays || [1,2,3,4,5]).includes(day)} onChange={event => setEditing({ ...editing, workingDays: event.target.checked ? [...(editing.workingDays || [1,2,3,4,5]), day] : (editing.workingDays || [1,2,3,4,5]).filter(value => value !== day) })} />{day === 0 ? "CN" : `T${day + 1}`}</label>)}</div>
      <label>Bắt đầu<input type="time" value={editing.workStart || "08:00"} onChange={event => setEditing({ ...editing, workStart: event.target.value })} /></label><label>Kết thúc<input type="time" value={editing.workEnd || "17:00"} onChange={event => setEditing({ ...editing, workEnd: event.target.value })} /></label>
      </fieldset>
      <div className="button-row"><button type="submit" className="button button-primary" disabled={busy}><Save size={16} />Lưu</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => setEditing(null)}><X size={16} />Hủy</button></div>
    </form>}
    <PersonnelLeave />
  </div>;
}
