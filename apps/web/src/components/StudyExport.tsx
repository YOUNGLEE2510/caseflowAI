import { useState, type FormEvent } from "react";
import { apiBlob } from "../api";
import { useLocale } from "../i18n";

export function StudyExport() {
  const { text } = useLocale();
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [participants, setParticipants] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function download(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (from > to) { setError(text("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.", "Start date must not be after end date.")); return; }
    const codes = participants.split(",").map(code => code.trim().toLowerCase()).filter(Boolean);
    if (codes.some(code => !/^p\d{2}$/.test(code))) { setError(text("Nhập mã dạng p01, p02, ngăn cách bằng dấu phẩy.", "Use participant codes such as p01, p02, separated by commas.")); return; }
    setBusy(true);
    try {
      const query = new URLSearchParams({ from, to, ...(codes.length ? { participants: [...new Set(codes)].join(",") } : {}) });
      const blob = await apiBlob(`/study/export.csv?${query}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = "caseflow-study.csv"; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : text("Không thể xuất dữ liệu.", "Unable to export data.")); }
    finally { setBusy(false); }
  }
  return <form className="panel study-export" onSubmit={download} aria-label={text("Xuất dữ liệu thử nghiệm", "Export study data")}>
    <h2>{text("Xuất dữ liệu thử nghiệm", "Export study data")}</h2>
    <p className="form-hint">{text("Chỉ xuất mã người tham gia và hồ sơ đã xác nhận. Khoảng ngày tính theo giờ Việt Nam.", "Exports participant codes and confirmed requests only. Dates use Vietnam time.")}</p>
    <div className="study-export-fields">
      <label className="field"><span>{text("Từ ngày", "From date")}</span><input type="date" required value={from} onChange={e => setFrom(e.target.value)} /></label>
      <label className="field"><span>{text("Đến ngày", "To date")}</span><input type="date" required value={to} onChange={e => setTo(e.target.value)} /></label>
      <label className="field"><span>{text("Mã người tham gia (để trống chọn tất cả)", "Participant codes (leave empty for all)")}</span><input maxLength={399} placeholder="p01, p02" value={participants} onChange={e => setParticipants(e.target.value)} /></label>
    </div>
    {error ? <p role="alert" className="form-error">{error}</p> : null}
    <button type="submit" className="button button-secondary" disabled={busy}>{busy ? text("Đang xuất…", "Exporting…") : text("Xuất dữ liệu thử nghiệm", "Export study data")}</button>
  </form>;
}
