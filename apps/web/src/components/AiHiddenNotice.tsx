import { EyeOff } from "lucide-react";
import { useLocale } from "../i18n";

/** Neutral notice for staff accounts in the study's manual condition (AI suggestions withheld). */
export function AiHiddenNotice() {
  const { text } = useLocale();
  return (
    <div className="ai-hidden-notice" role="status">
      <EyeOff size={16} aria-hidden="true" />
      <span>{text("Gợi ý AI đang tắt cho tài khoản này. Bạn tự phân loại, chọn mức ưu tiên và giao việc.", "AI suggestions are turned off for this account. You classify, prioritise and assign on your own.")}</span>
    </div>
  );
}
