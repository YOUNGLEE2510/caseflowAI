import { useEffect, useState } from "react";
import { EyeOff } from "lucide-react";
import { api } from "../api";
import { useLocale } from "../i18n";
import { useConfirmation } from "./ConfirmationProvider";
import type { User } from "../types";

/** User study controls for one staff account: participant code and whether AI suggestions are hidden. */
export function AiStudySettings({ member, canChange, onSaved }: { member: User; canChange: boolean; onSaved: () => void }) {
  const { text } = useLocale();
  const confirm = useConfirmation();
  const [studyCode, setStudyCode] = useState(member.studyCode || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setStudyCode(member.studyCode || ""); setError(""); }, [member.id, member.studyCode]);
  const hidden = Boolean(member.aiSuggestionsHidden);

  async function save(nextHidden: boolean) {
    const code = studyCode.trim().toLowerCase();
    if (code && !/^p\d{2}$/.test(code)) { setError(text("Mã người tham gia dạng p01, p02…", "Participant code looks like p01, p02…")); return; }
    if (!await confirm({
      title: nextHidden ? text("Ẩn gợi ý AI cho tài khoản này?", "Hide AI suggestions for this account?") : text("Hiện lại gợi ý AI?", "Show AI suggestions again?"),
      message: text("Thay đổi áp dụng từ lần tải trang tiếp theo của người dùng và được ghi vào nhật ký.", "The change applies on the person's next page load and is recorded in the audit log.")
    })) return;
    setBusy(true); setError("");
    try {
      await api(`/users/${member.id}/ai-visibility`, { method: "PATCH", body: JSON.stringify({ aiSuggestionsHidden: nextHidden, studyCode: code || null }) });
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : text("Không lưu được.", "Could not save.")); }
    finally { setBusy(false); }
  }

  return (
    <section className="ai-study-settings" aria-labelledby={`ai-study-${member.id}`}>
      <h3 id={`ai-study-${member.id}`}><EyeOff size={16} aria-hidden="true" />{text("Thử nghiệm người dùng", "User study")}</h3>
      <p className="form-hint">{hidden
        ? text("Đang ẩn gợi ý AI (điều kiện thủ công).", "AI suggestions hidden (manual condition).")
        : text("Đang hiện gợi ý AI (điều kiện có AI).", "AI suggestions shown (assisted condition).")}</p>
      {canChange ? <>
        <label className="field"><span>{text("Mã người tham gia", "Participant code")}</span>
          <input value={studyCode} maxLength={3} placeholder="p01" onChange={event => setStudyCode(event.target.value)} /></label>
        <label className="ai-study-switch">
          <input type="checkbox" role="switch" checked={hidden} disabled={busy} onChange={event => void save(event.target.checked)} />
          <span>{text("Ẩn gợi ý AI", "Hide AI suggestions")}</span>
        </label>
      </> : member.studyCode ? <p className="form-hint">{text("Mã", "Code")}: {member.studyCode}</p> : null}
      {error ? <p role="alert" className="form-error">{error}</p> : null}
    </section>
  );
}
