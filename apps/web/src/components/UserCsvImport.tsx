import { useState } from "react";
import { Upload } from "lucide-react";
import { Modal } from "./Modal";
import { api } from "../api";
import { useLocale } from "../i18n";
import { useConfirmation } from "./ConfirmationProvider";

type Row = { name: string; email: string; role: string; exists: boolean };
export function UserCsvImport({ onSaved }: { onSaved: () => void }) {
  const { text } = useLocale();
  const confirm = useConfirmation();
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function preview(file?: File) {
    setRows([]); setCsv(""); setMessage("");
    if (!file) return;
    if (file.size > 100000) { setMessage(text("Tệp quá lớn (tối đa 100 KB).", "File exceeds 100 KB.")); return; }
    setBusy(true);
    try {
      const content = await file.text();
      const result = await api<{ rows: Row[] }>("/users/import", { method: "POST", body: JSON.stringify({ csv: content }) });
      setCsv(content); setRows(result.rows);
    } catch (error) { setMessage(error instanceof Error ? error.message : text("Không đọc được CSV.", "Unable to read CSV.")); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!await confirm({ title: text("Xác nhận nhập thành viên?", "Import members?"), message: text("Tài khoản mới nhận link đặt mật khẩu qua email. Email đã có sẽ được bỏ qua.", "New members receive password setup links. Existing emails are skipped.") })) return;
    setBusy(true);
    try {
      const result = await api<{ results: Array<{ status: string }> }>("/users/import", { method: "POST", body: JSON.stringify({ csv, confirm: true }) });
      setMessage(text(`Đã tạo ${result.results.filter(row => row.status.startsWith("created")).length} tài khoản. Link đặt mật khẩu được xếp hàng gửi khi SMTP khả dụng.`, `Created ${result.results.filter(row => row.status.startsWith("created")).length} accounts. Setup emails are queued for SMTP delivery.`));
      setRows([]); setCsv(""); onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : text("Nhập thất bại.", "Import failed.")); }
    finally { setBusy(false); }
  }
  return <>
    <button className="button button-secondary" onClick={() => { setOpen(true); setMessage(""); }}><Upload size={16} />{text("Nhập CSV", "Import CSV")}</button>
    {open && <Modal title={text("Nhập thành viên", "Import members")} onClose={() => { if (!busy) { setOpen(false); setRows([]); setCsv(""); } }}>
      <label className="field"><span>{text("Tệp CSV (name,email,role,team)", "CSV file (name,email,role,team)")}</span><input type="file" accept=".csv,text/csv" disabled={busy} onChange={event => void preview(event.target.files?.[0])} /></label>
      {rows.length > 0 && <ul>{rows.map(row => <li key={row.email}>{row.name} · {row.email} · {row.role}{row.exists ? text(" · Đã tồn tại", " · Already exists") : ""}</li>)}</ul>}
      {message && <p role="status">{message}</p>}
      <div className="editor-actions"><button className="button button-primary" disabled={busy || !rows.length} onClick={() => void save()}>{text("Xác nhận nhập", "Confirm import")}</button></div>
    </Modal>}
  </>;
}
