import { useState } from "react";
import { createPortal } from "react-dom";
import { Merge } from "lucide-react";
import { api } from "../api";
import { useLocale } from "../i18n";
import { Modal } from "./Modal";
import { useConfirmation } from "./ConfirmationProvider";

export function CaseMergeButton({ caseId, onMerged }: { caseId: string; onMerged: () => void }) {
  const { text } = useLocale();
  const confirm = useConfirmation();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Array<{ _id: string; code: string; title: string }>>([]);
  const [targetId, setTargetId] = useState("");
  const [reason, setReason] = useState("duplicate_submission");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    setOpen(true); setBusy(true); setError(""); setTargetId(""); setOptions([]);
    try { setOptions((await api<{ cases: typeof options }>(`/cases/${caseId}/merge-options`)).cases); }
    catch (error) { setError(error instanceof Error ? error.message : text("Không tải được hồ sơ.", "Unable to load cases.")); }
    finally { setBusy(false); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const target = options.find(option => option._id === targetId);
    if (!target || !await confirm({ title: text("Gộp hồ sơ trùng?", "Merge duplicate case?"),
      message: text(`Hồ sơ này sẽ đóng và liên kết tới ${target.code}. Trao đổi và tệp gốc được giữ lại.`, `This case will close and link to ${target.code}. Original conversations and files are retained.`) })) return;
    setBusy(true); setError("");
    try {
      await api(`/cases/${caseId}/merge`, { method: "POST", body: JSON.stringify({ targetId, reason }) });
      setOpen(false); onMerged();
    } catch (error) { setError(error instanceof Error ? error.message : text("Không thể gộp hồ sơ.", "Unable to merge cases.")); }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" className="button button-secondary" onClick={() => void load()}><Merge size={16} />{text("Gộp hồ sơ trùng", "Merge duplicate")}</button>
    {open && createPortal(<Modal title={text("Gộp hồ sơ trùng", "Merge duplicate")} onClose={() => { if (!busy) setOpen(false); }}>
      <form className="form-stack" onSubmit={submit}>
        <label className="field"><span>{text("Hồ sơ chính", "Primary case")}</span><select required value={targetId} onChange={event => setTargetId(event.target.value)} disabled={busy}>
          <option value="">{text("Chọn hồ sơ chính", "Select primary case")}</option>
          {options.map(option => <option key={option._id} value={option._id}>{option.code} · {option.title}</option>)}
        </select></label>
        {!busy && !options.length && !error && <p role="status">{text("Không có hồ sơ mở được tạo trước, cùng người yêu cầu và cùng dịch vụ.", "No earlier open case with the same requester and service.")}</p>}
        <label className="field"><span>{text("Lý do", "Reason")}</span><select value={reason} onChange={event => setReason(event.target.value)} disabled={busy}>
          <option value="duplicate_submission">{text("Gửi trùng yêu cầu", "Duplicate submission")}</option>
          <option value="repeated_request">{text("Yêu cầu lặp lại cùng nội dung", "Repeated request")}</option>
        </select></label>
        {error && <p role="alert" className="form-error">{error}</p>}
        <button className="button button-primary" disabled={busy || !targetId}><Merge size={16} />{text("Gộp hồ sơ", "Merge cases")}</button>
      </form>
    </Modal>, document.body)}
  </>;
}
