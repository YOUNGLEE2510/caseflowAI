import { useEffect, useState } from "react";
import { PhoneCall, ShieldCheck, ShieldX } from "lucide-react";
import { api } from "../api";
import { useLocale } from "../i18n";
import { useConfirmation } from "./ConfirmationProvider";
import { formatDate } from "./ui";
import type { CaseRecord } from "../types";

type Intake = NonNullable<CaseRecord["intakeVerification"]>;

// Staff-only panel for submissions sent through a unit's QR code.
export function IntakeVerificationPanel({ caseId, unitCode, intake, onChanged }: {
  caseId: string; unitCode?: string; intake: Intake; onChanged: () => void
}) {
  const { text } = useLocale();
  const confirm = useConfirmation();
  const [residents, setResidents] = useState<Array<{ _id: string; name: string }>>([]);
  const [residentId, setResidentId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const pending = intake.status === "pending";

  useEffect(() => {
    if (!pending) return;
    api<{ residents: Array<{ _id: string; name: string }> }>(`/cases/${caseId}/intake-verification/residents`)
      .then(result => setResidents(result.residents)).catch(() => setResidents([]));
  }, [caseId, pending]);

  async function decide(decision: "verified" | "rejected") {
    if (note.trim().length < 5) { setFailure(text("Ghi chú cách xác minh, tối thiểu 5 ký tự.", "Describe how you checked, at least 5 characters.")); return; }
    const ok = await confirm(decision === "verified"
      ? { title: text("Xác minh phản ánh", "Verify submission"), message: text("Hồ sơ sẽ được phép giao việc và xử lý như bình thường.", "The request can then be assigned and handled normally.") }
      : { title: text("Từ chối phản ánh", "Reject submission"), message: text("Hồ sơ sẽ được đóng và không xử lý. Chỉ dùng khi không liên hệ được hoặc nội dung không hợp lệ.", "The request will be closed without work. Use only for unreachable or invalid submissions."), danger: true });
    if (!ok) return;
    setBusy(true); setFailure("");
    try {
      await api(`/cases/${caseId}/intake-verification`, { method: "POST",
        body: JSON.stringify({ decision, note: note.trim(), ...(decision === "verified" && residentId ? { residentId } : {}) }) });
      onChanged();
    } catch (cause) { setFailure(cause instanceof Error ? cause.message : text("Không thể lưu.", "Unable to save.")); }
    finally { setBusy(false); }
  }

  if (!pending) {
    return <section className="panel intake-panel" aria-label={text("Xác minh mã QR", "QR verification")}>
      <p className="intake-summary">
        {intake.status === "verified" ? <ShieldCheck size={18} /> : <ShieldX size={18} />}
        <span>{intake.status === "verified" ? text("Đã xác minh phản ánh qua mã QR", "QR submission verified") : text("Đã từ chối phản ánh qua mã QR", "QR submission rejected")}
          {intake.verifiedByName ? ` · ${intake.verifiedByName}` : ""}{intake.verifiedAt ? ` · ${formatDate(intake.verifiedAt)}` : ""}</span>
      </p>
      {intake.note ? <p className="intake-note">{intake.note}</p> : null}
    </section>;
  }

  return <section className="panel intake-panel intake-pending" aria-label={text("Xác minh mã QR", "QR verification")}>
    <div className="panel-heading"><div>
      <span className="eyebrow">{text("Gửi qua mã QR", "Sent via QR code")} · {unitCode}</span>
      <h2>{text("Chờ xác minh người gửi", "Sender not verified yet")}</h2>
    </div></div>
    <p>{text("Ai cầm mã QR cũng gửi được. Gọi lại để xác nhận người gửi đang ở căn này trước khi giao việc.",
      "Anyone holding the QR code can submit. Call back to confirm the sender is at this unit before assigning work.")}</p>
    <dl className="intake-contact">
      <div><dt>{text("Người gửi tự khai", "Name given")}</dt><dd>{intake.reporterName}</dd></div>
      <div><dt>{text("Số điện thoại", "Phone")}</dt><dd>{intake.reporterPhone ? <a href={`tel:${intake.reporterPhone}`}><PhoneCall size={15} />{intake.reporterPhone}</a> : "—"}</dd></div>
    </dl>
    <label className="field"><span>{text("Gắn với tài khoản người thuê (không bắt buộc)", "Link to resident account (optional)")}</span>
      <select value={residentId} onChange={event => setResidentId(event.target.value)}>
        <option value="">{text("Người gửi chưa có tài khoản", "Sender has no account")}</option>
        {residents.map(person => <option key={person._id} value={person._id}>{person.name}</option>)}
      </select></label>
    <label className="field"><span>{text("Ghi chú xác minh", "Verification note")}</span>
      <textarea value={note} maxLength={500} rows={2} onChange={event => setNote(event.target.value)}
        placeholder={text("Ví dụ: Đã gọi lại, khách xác nhận đang ở căn và hẹn 15h.", "e.g. Called back, tenant confirmed and booked 3pm.")} /></label>
    {failure ? <p role="alert" className="form-error">{failure}</p> : null}
    <div className="intake-actions">
      <button type="button" className="button button-primary" disabled={busy} onClick={() => decide("verified")}><ShieldCheck size={16} />{text("Xác minh", "Verify")}</button>
      <button type="button" className="button button-secondary" disabled={busy} onClick={() => decide("rejected")}><ShieldX size={16} />{text("Từ chối", "Reject")}</button>
    </div>
  </section>;
}
