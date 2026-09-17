import { useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import { api } from "../api";
import { useLocale } from "../i18n";
import type { KnowledgeArticle, ServiceDefinition, User } from "../types";
import { ErrorState } from "./ui";
import { Modal } from "./Modal";

export const categories = ["it_access", "academic_records", "student_services", "facilities", "finance", "general_support"];
type EditorActions = { onClose: () => void; onSaved: () => void };

export function ServiceEditor({ service, onClose, onSaved }: EditorActions & { service?: ServiceDefinition }) {
  const { text } = useLocale();
  const [form, setForm] = useState({ key: service?.key || "", name: service?.name || "", description: service?.description || "", category: service?.category || "general_support", team: service?.team || "", slaHours: service?.slaHours || 24, fields: service?.requiredFields.join("\n") || "", active: service?.active !== false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const { fields, ...values } = form;
      await api(service ? `/services/${service._id}` : "/services", { method: service ? "PATCH" : "POST", body: JSON.stringify({ ...values, autoAssign: false, requiredFields: fields.split("\n").map((field) => field.trim()).filter(Boolean) }) });
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : text("Không thể lưu.", "Unable to save.")); }
    finally { setBusy(false); }
  }
  return <Modal title={service ? text("Sửa dịch vụ", "Edit service") : text("Thêm dịch vụ", "Add service")} onClose={onClose}>
    <form className="form-stack" onSubmit={submit}>
      <label className="field"><span>{text("Mã dịch vụ", "Service key")}</span><input required minLength={2} maxLength={50} pattern="[a-z][a-z0-9_]*" disabled={Boolean(service)} value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} /></label>
      <label className="field"><span>{text("Tên dịch vụ", "Service name")}</span><input required minLength={2} maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
      <label className="field"><span>{text("Mô tả", "Description")}</span><textarea maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
      <div className="form-grid"><label className="field"><span>{text("Nhóm phân loại", "Category")}</span><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
      <label className="field"><span>{text("Đơn vị phụ trách", "Owning team")}</span><input required minLength={2} maxLength={60} value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })} /></label></div>
      <label className="field"><span>{text("SLA xử lý (giờ)", "Resolution SLA (hours)")}</span><input type="number" required min={1} max={720} value={form.slaHours} onChange={(e) => setForm({ ...form, slaHours: Number(e.target.value) })} /></label>
      <label className="field"><span>{text("Trường bắt buộc (mỗi dòng một tên)", "Required fields (one name per line)")}</span><textarea rows={3} disabled={form.key === "general_support"} value={form.fields} onChange={(e) => setForm({ ...form, fields: e.target.value })} /></label>
      {service && <label className="checkbox-field"><input type="checkbox" disabled={service.key === "general_support"} checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />{text("Đang hoạt động", "Active")}</label>}
      {error && <ErrorState message={error} />}
      <footer className="editor-actions"><button type="button" className="button button-secondary" onClick={onClose}>{text("Hủy", "Cancel")}</button><button className="button button-primary" disabled={busy}><Save size={16} />{text("Lưu dịch vụ", "Save service")}</button></footer>
    </form>
  </Modal>;
}

export function UserEditor({ member, onClose, onSaved }: EditorActions & { member?: User }) {
  const { text } = useLocale();
  const [form, setForm] = useState({ name: member?.name || "", email: member?.email || "", password: "", role: member?.role || "requester", team: member?.team || "", title: member?.title || "", active: member?.active !== false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const { password, ...values } = form;
      await api(member ? `/users/${member.id}` : "/users", { method: member ? "PATCH" : "POST", body: JSON.stringify(member ? values : { ...values, password }) });
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : text("Không thể lưu.", "Unable to save.")); }
    finally { setBusy(false); }
  }
  const protectedAdmin = member && ["org_admin", "platform_admin"].includes(member.role);
  return <Modal title={member ? text("Sửa thành viên", "Edit member") : text("Thêm thành viên", "Add member")} onClose={onClose}>
    <form className="form-stack" onSubmit={submit}>
      <label className="field"><span>{text("Họ tên", "Full name")}</span><input required minLength={2} maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
      <label className="field"><span>Email</span><input type="email" required disabled={Boolean(member)} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
      {!member && <label className="field"><span>{text("Mật khẩu ban đầu", "Initial password")}</span><input type="password" required minLength={10} maxLength={128} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>}
      <label className="field"><span>{text("Vai trò", "Role")}</span><select disabled={Boolean(protectedAdmin)} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as User["role"] })}><option value="requester">{text("Người yêu cầu", "Requester")}</option><option value="agent">{text("Nhân viên", "Agent")}</option><option value="manager">{text("Quản lý", "Manager")}</option><option value="org_admin">{text("Quản trị tổ chức", "Organization admin")}</option>{form.role === "platform_admin" && <option value="platform_admin">Platform admin</option>}</select></label>
      <label className="field"><span>{text("Đơn vị", "Team")}</span><input required={form.role === "agent"} maxLength={60} value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })} /></label>
      <label className="field"><span>{text("Chức danh", "Job title")}</span><input maxLength={100} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
      {member && <label className="checkbox-field"><input type="checkbox" disabled={Boolean(protectedAdmin)} checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />{text("Đang hoạt động", "Active")}</label>}
      {error && <ErrorState message={error} />}
      <footer className="editor-actions"><button type="button" className="button button-secondary" onClick={onClose}>{text("Hủy", "Cancel")}</button><button className="button button-primary" disabled={busy}><Save size={16} />{text("Lưu thành viên", "Save member")}</button></footer>
    </form>
  </Modal>;
}

export function ArticleEditor({ article, canPublish, onClose, onSaved }: EditorActions & { article?: KnowledgeArticle; canPublish: boolean }) {
  const { text } = useLocale();
  const [form, setForm] = useState({ title: article?.title || "", content: article?.content || "", category: article?.category || "general_support", sourceLabel: article?.sourceLabel || "", sourceUrl: article?.sourceUrl || "", version: article?.version || "1.0", status: canPublish ? article?.status || "draft" : "draft" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await api(article ? `/knowledge/${article._id}` : "/knowledge", { method: article ? "PATCH" : "POST", body: JSON.stringify(form) });
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : text("Không thể lưu.", "Unable to save.")); }
    finally { setBusy(false); }
  }
  return <Modal title={article ? text("Sửa tài liệu", "Edit document") : text("Thêm tài liệu", "Add document")} onClose={onClose}>
    <form className="form-stack" onSubmit={submit}>
      <label className="field"><span>{text("Tên tài liệu", "Document title")}</span><input required minLength={5} maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
      <label className="field"><span>{text("Nội dung", "Content")}</span><textarea rows={10} required minLength={20} maxLength={50000} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></label>
      <label className="field"><span>{text("Nhóm phân loại", "Category")}</span><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
      <label className="field"><span>{text("Nguồn ban hành", "Issuing source")}</span><input required minLength={2} maxLength={120} value={form.sourceLabel} onChange={(e) => setForm({ ...form, sourceLabel: e.target.value })} /></label>
      <label className="field"><span>{text("Liên kết nguồn", "Source URL")}</span><input type="url" value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} /></label>
      <label className="field"><span>{text("Phiên bản", "Version")}</span><input required maxLength={30} value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} /></label>
      {canPublish && <label className="checkbox-field"><input type="checkbox" checked={form.status === "published"} onChange={(e) => setForm({ ...form, status: e.target.checked ? "published" : "draft" })} />{text("Phê duyệt và công bố", "Approve and publish")}</label>}
      {error && <ErrorState message={error} />}
      <footer className="editor-actions"><button type="button" className="button button-secondary" onClick={onClose}>{text("Hủy", "Cancel")}</button><button className="button button-primary" disabled={busy}><Save size={16} />{text("Lưu tài liệu", "Save document")}</button></footer>
    </form>
  </Modal>;
}
