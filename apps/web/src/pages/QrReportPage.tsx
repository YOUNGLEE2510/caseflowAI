import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, Send, TriangleAlert } from "lucide-react";
import { api } from "../api";
import { BrandLogo } from "../components/BrandLogo";
import { LocaleSwitcher } from "../components/LocaleSwitcher";
import { ThemeSwitcher } from "../components/ThemeSwitcher";
import { useLocale } from "../i18n";

type UnitInfo = { organizationName: string; propertyName: string; unitCode: string; categories: { key: string; name: string }[] };
const TOKEN = /^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{22}$/;

// Public page opened from the QR code posted in a unit. No sign-in required.
export function QrReportPage() {
  const { token = "" } = useParams();
  const { text } = useLocale();
  const validToken = TOKEN.test(token);
  const [info, setInfo] = useState<UnitInfo | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [done, setDone] = useState<{ code: string; message: string } | null>(null);

  useEffect(() => {
    if (!validToken) return;
    api<UnitInfo>(`/public/qr/${token}`).then(setInfo)
      .catch(cause => setLoadError(cause instanceof Error ? cause.message : text("Không mở được mã QR.", "Unable to open this QR code.")));
  }, [token, validToken, text]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setFailure("");
    try {
      const category = String(form.get("category") || "");
      setDone(await api<{ code: string; message: string }>(`/public/qr/${token}/reports`, { method: "POST", body: JSON.stringify({
        name: form.get("name"), phone: form.get("phone"), description: form.get("description"),
        ...(category ? { category } : {}), ...(form.get("website") ? { website: form.get("website") } : {})
      }) }));
    } catch (cause) { setFailure(cause instanceof Error ? cause.message : text("Không gửi được phản ánh.", "Unable to send the report.")); }
    finally { setBusy(false); }
  }

  return <main className="login-reset-screen qr-report-screen">
    <div className="login-locale"><LocaleSwitcher /><ThemeSwitcher /></div>
    <section className="login-panel qr-report-panel">
      <div className="login-heading">
        <span className="auth-page-logo"><BrandLogo size={36} tagline={info?.organizationName || text("Vận hành căn hộ", "Apartment operations")} /></span>
        <h1>{text("Báo sự cố căn hộ", "Report a problem")}</h1>
      </div>
      {info ? <p className="qr-unit">{info.propertyName} · {text("Căn", "Unit")} <strong>{info.unitCode}</strong></p> : null}
      <div className="qr-emergency" role="note">
        <TriangleAlert size={20} aria-hidden="true" />
        <p>{text("Cháy, khói, điện giật, nước ngập gần ổ điện, có người kẹt thang máy: gọi ngay 114 và báo bảo vệ tòa nhà. Không chờ phản hồi qua biểu mẫu này.",
          "Fire, smoke, electric shock, water near power, someone trapped in a lift: call 114 now and alert building security. Do not wait for a reply to this form.")}</p>
      </div>
      {!validToken || loadError ? <div className="form-error" role="alert">{loadError || text("Mã QR không hợp lệ. Vui lòng liên hệ ban quản lý.", "This QR code is invalid. Please contact the building office.")}</div> : null}
      {done ? <div className="qr-done" role="status">
        <CheckCircle2 size={28} aria-hidden="true" />
        <h2>{text("Đã gửi phản ánh", "Report sent")}</h2>
        <p>{done.message}</p>
        <p>{text("Mã tiếp nhận", "Reference")}: <strong>{done.code}</strong></p>
      </div> : null}
      {info && !done ? <form className="form-stack" onSubmit={submit}>
        <label className="field"><span>{text("Họ tên", "Your name")}</span><input name="name" required minLength={2} maxLength={80} autoComplete="name" /></label>
        <label className="field"><span>{text("Số điện thoại để ban quản lý gọi lại", "Phone number for a call back")}</span>
          <input name="phone" type="tel" inputMode="tel" required pattern="[0-9+ .()\-]{9,20}" maxLength={20} autoComplete="tel" /></label>
        <label className="field"><span>{text("Loại sự cố (không bắt buộc)", "Type of problem (optional)")}</span>
          <select name="category" defaultValue=""><option value="">{text("Không rõ", "Not sure")}</option>
            {info.categories.map(item => <option key={item.key} value={item.key}>{item.name}</option>)}</select></label>
        <label className="field"><span>{text("Mô tả sự cố", "What is wrong?")}</span>
          <textarea name="description" required minLength={12} maxLength={2000} rows={5}
            placeholder={text("Ví dụ: Điều hòa phòng ngủ chạy nhưng không lạnh từ tối qua.", "e.g. The bedroom air conditioner runs but does not cool since last night.")} /></label>
        {/* Honeypot for bots; hidden from people and assistive technology. */}
        <div className="qr-honeypot" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
        <p className="password-hint">{text("Số điện thoại chỉ dùng để ban quản lý gọi lại xác nhận trước khi cử kỹ thuật lên căn.",
          "Your phone number is only used to call you back before a technician visits.")}</p>
        {failure ? <p className="form-error" role="alert">{failure}</p> : null}
        <button className="button button-primary login-button" disabled={busy}><Send size={18} /><span>{busy ? text("Đang gửi", "Sending") : text("Gửi phản ánh", "Send report")}</span></button>
      </form> : null}
      <Link className="text-link reset-login-link" to="/login">{text("Đã có tài khoản? Đăng nhập để theo dõi hồ sơ", "Have an account? Sign in to track requests")}</Link>
    </section>
  </main>;
}
