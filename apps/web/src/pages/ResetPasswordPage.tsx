import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { api } from "../api";
import { LocaleSwitcher } from "../components/LocaleSwitcher";
import { useLocale } from "../i18n";

export function ResetPasswordPage() {
  const { text } = useLocale();
  const [params] = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const organizationSlug = params.get("organization") || "";
  const token = params.get("token") || "";
  const validLink = /^[a-z0-9-]{2,80}$/.test(organizationSlug) && /^[a-f0-9]{64}$/i.test(token);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirmation) {
      setMessage(text("Mật khẩu xác nhận chưa khớp.", "Password confirmation does not match."));
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const result = await api<{ message: string }>("/auth/password-reset/confirm", {
        method: "POST",
        body: JSON.stringify({ organizationSlug, token, password })
      });
      setMessage(result.message);
    } catch (requestError) {
      setMessage(requestError instanceof Error ? requestError.message : text("Không thể đặt lại mật khẩu.", "Unable to reset the password."));
    } finally {
      setLoading(false);
    }
  }

  return <main className="login-reset-screen">
    <div className="login-locale"><LocaleSwitcher /></div>
    <section className="login-panel">
      <div className="login-heading">
        <span className="eyebrow">CaseFlow</span>
        <h1>{text("Đặt lại mật khẩu", "Reset your password")}</h1>
        <p>{text("Chọn mật khẩu mới cho tài khoản của bạn.", "Choose a new password for your account.")}</p>
      </div>
      {!validLink ? <div className="form-error" role="alert">{text("Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.", "This reset link is invalid or has expired.")}</div> : <form className="form-stack reset-password-form" onSubmit={handleSubmit}>
        <label className="field"><span>{text("Mật khẩu mới", "New password")}</span><span className="password-field"><input type={showPassword ? "text" : "password"} minLength={10} maxLength={128} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" className="icon-button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? text("Ẩn mật khẩu", "Hide password") : text("Hiện mật khẩu", "Show password")}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
        <label className="field"><span>{text("Xác nhận mật khẩu mới", "Confirm new password")}</span><input type={showPassword ? "text" : "password"} minLength={10} maxLength={128} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></label>
        <p className="password-hint">{text("Tối thiểu 10 ký tự.", "At least 10 characters.")}</p>
        {message ? <p className="form-notice" role="status">{message}</p> : null}
        <button className="button button-primary login-button" disabled={loading}><KeyRound size={18} /><span>{loading ? text("Đang cập nhật", "Updating") : text("Đặt lại mật khẩu", "Reset password")}</span></button>
      </form>}
      <Link className="text-link reset-login-link" to="/login">{text("Quay lại đăng nhập", "Back to sign in")}</Link>
    </section>
  </main>;
}
