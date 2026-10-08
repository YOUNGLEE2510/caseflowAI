import { useEffect, useState } from "react";
import { ArrowRight, Check, Eye, EyeOff, Network, ShieldCheck } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth";
import { api, apiUrl } from "../api";
import { LocaleSwitcher } from "../components/LocaleSwitcher";
import { Modal } from "../components/Modal";
import { useLocale } from "../i18n";

const demoAccounts = [
  { label: { vi: "Quản lý", en: "Manager" }, email: "manager@caseflow.local" },
  { label: { vi: "Nhân viên", en: "Staff" }, email: "agent@caseflow.local" },
  { label: { vi: "Sinh viên", en: "Student" }, email: "student@caseflow.local" }
];
const demoOrganizationSlug = "minh-khai-university";

export function LoginPage() {
  const { user, login, loginWithGoogle, loginWithMicrosoft } = useAuth();
  const { text } = useLocale();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [organizationSlug, setOrganizationSlug] = useState(demoOrganizationSlug);
  const [email, setEmail] = useState(demoAccounts[0].email);
  const [password, setPassword] = useState("Demo123!");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  const googleCode = searchParams.get("googleCode");
  const oauthError = searchParams.get("oauthError");
  const microsoftCode = searchParams.get("microsoftCode");
  const oauthProvider = searchParams.get("oauthProvider") === "microsoft" ? "Microsoft" : "Google";

  useEffect(() => {
    if (user) navigate("/overview", { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    if (!googleCode) return;
    let current = true;
    setLoading(true);
    setError("");
    void loginWithGoogle(googleCode)
      .then(() => { if (current) navigate("/overview", { replace: true }); })
      .catch(() => {
        if (current) {
          setError(text("Không thể hoàn tất đăng nhập Google. Tài khoản Google phải khớp với email đã được cấp trong tổ chức.", "Unable to complete Google sign-in. Your Google account must match an active organization account."));
          navigate("/login", { replace: true });
        }
      })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [googleCode, loginWithGoogle, navigate, text]);

  useEffect(() => {
    if (!oauthError) return;
    const message = oauthError === "not_configured"
      ? text(`Đăng nhập ${oauthProvider} chưa được cấu hình cho môi trường này.`, `${oauthProvider} sign-in has not been configured for this environment.`)
      : oauthError === "not_linked"
        ? text("Tài khoản Microsoft chưa được liên kết. Đăng nhập bằng mật khẩu rồi liên kết trong Hồ sơ cá nhân.", "Your Microsoft account is not linked. Sign in with your password and link it in your profile.")
        : text(`Không thể đăng nhập bằng ${oauthProvider}. Vui lòng thử lại hoặc dùng mật khẩu.`, `${oauthProvider} sign-in could not be completed. Please try again or use your password.`);
    setError(message);
  }, [oauthError, oauthProvider, text]);

  useEffect(() => {
    if (!microsoftCode) return;
    let current = true;
    setLoading(true);
    void loginWithMicrosoft(microsoftCode)
      .then(() => { if (current) navigate("/overview", { replace: true }); })
      .catch(() => { if (current) { setError(text("Không thể hoàn tất đăng nhập Microsoft.", "Unable to complete Microsoft sign-in.")); navigate("/login", { replace: true }); } })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [microsoftCode, loginWithMicrosoft, navigate, text]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(organizationSlug, email, password, remember);
      navigate("/overview", { replace: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : text("Không thể đăng nhập.", "Unable to sign in."));
    } finally {
      setLoading(false);
    }
  }

  async function requestPasswordReset(event: React.FormEvent) {
    event.preventDefault();
    setResetLoading(true);
    setResetMessage("");
    try {
      const result = await api<{ message: string }>("/auth/password-reset/request", {
        method: "POST",
        body: JSON.stringify({ organizationSlug, email })
      });
      setResetMessage(result.message);
    } catch (requestError) {
      setResetMessage(requestError instanceof Error ? requestError.message : text("Không thể gửi yêu cầu. Vui lòng thử lại.", "Unable to send the request. Please try again."));
    } finally {
      setResetLoading(false);
    }
  }

  function startGoogleLogin() {
    const query = new URLSearchParams({ organization: organizationSlug, remember: String(remember) });
    window.location.assign(apiUrl(`/auth/google?${query.toString()}`));
  }

  return (
    <div className="login-screen">
      <aside className="login-visual" aria-label={text("Trung tâm dịch vụ sinh viên", "Student service center")}>
        <div className="login-visual-overlay" />
        <div className="login-brand">
          <span className="brand-mark brand-mark-light">
            <Network size={22} />
          </span>
          <span>
            <strong>CaseFlow</strong>
            <small>Service Intelligence Platform</small>
          </span>
        </div>
        <div className="login-visual-copy">
          <span className="eyebrow">{text("Dịch vụ được kết nối", "Connected services")}</span>
          <h1>{text("Hỗ trợ đúng lúc,", "Help at the right time,")}<br />{text("rõ ràng ở từng bước.", "clarity at every step.")}</h1>
          <p>{text("Người yêu cầu, đội xử lý và tri thức tổ chức cùng làm việc trong một không gian.", "Bring requesters, service teams and trusted knowledge into one shared workspace.")}</p>
        </div>
      </aside>

      <main className="login-form-area">
        <div className="login-locale"><LocaleSwitcher /></div>
        <section className="login-panel">
          <div className="login-heading">
            <span className="eyebrow">{text("Đại học Minh Khai", "Minh Khai University")}</span>
            <h1>{text("Chào mừng trở lại", "Welcome back")}</h1>
            <p>{text("Đăng nhập để tiếp tục công việc đang dang dở.", "Sign in to pick up where you left off.")}</p>
          </div>

          <div className="demo-switcher" aria-label={text("Chọn tài khoản demo", "Choose a demo account")}>
            {demoAccounts.map((account) => (
              <button
                key={account.email}
                type="button"
                className={email === account.email ? "active" : ""}
                onClick={() => {
                  setOrganizationSlug(demoOrganizationSlug);
                  setEmail(account.email);
                  setPassword("Demo123!");
                }}
              >
                {text(account.label.vi, account.label.en)}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="form-stack">
            <label className="field">
              <span>{text("Mã tổ chức", "Organization code")}</span>
              <input
                value={organizationSlug}
                onChange={(event) => setOrganizationSlug(event.target.value.toLowerCase())}
                autoComplete="organization"
                placeholder="minh-khai-university"
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                required
              />
            </label>
            <label className="field">
              <span>{text("Email tổ chức", "Organization email")}</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <div className="field">
              <label htmlFor="login-password">{text("Mật khẩu", "Password")}</label>
              <span className="password-field">
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setShowPassword((value) => !value)}
                  title={showPassword ? text("Ẩn mật khẩu", "Hide password") : text("Hiện mật khẩu", "Show password")}
                  aria-label={showPassword ? text("Ẩn mật khẩu", "Hide password") : text("Hiện mật khẩu", "Show password")}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </div>

            <div className="login-form-meta">
              <label className="remember-field">
                <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
                <span>{text("Ghi nhớ đăng nhập", "Keep me signed in")}</span>
              </label>
              <button type="button" className="text-link" onClick={() => { setResetMessage(""); setResetOpen(true); }}>{text("Quên mật khẩu?", "Forgot password?")}</button>
            </div>

            {error ? <div className="form-error" role="alert">{error}</div> : null}
            <button className="button button-primary login-button" disabled={loading}>
              {loading ? <span className="spinner spinner-light" /> : <ArrowRight size={18} />}
              <span>{loading ? text("Đang đăng nhập", "Signing in") : text("Đăng nhập", "Sign in")}</span>
            </button>
          </form>

          <div className="login-provider-separator" aria-hidden="true"><span>{text("hoặc", "or")}</span></div>
          <button className="button login-google" type="button" onClick={startGoogleLogin} disabled={loading || !organizationSlug.trim()}>
            <img className="provider-mark" src="/google-logo.png" width="20" height="20" alt="" />
            <span>{text("Tiếp tục với Google", "Continue with Google")}</span>
          </button>

          <button className="button login-google login-microsoft" type="button" disabled={loading || !organizationSlug.trim()} onClick={() => {
            const query = new URLSearchParams({ organization: organizationSlug, remember: String(remember) });
            window.location.assign(apiUrl(`/auth/microsoft?${query}`));
          }}>
            <img className="provider-mark" src="/microsoft-logo.svg" width="20" height="20" alt="" />
            {text("Tiếp tục với Outlook / Microsoft", "Continue with Outlook / Microsoft")}
          </button>

          <div className="login-security">
            <ShieldCheck size={19} />
            <span>
              <strong>{text("Kết nối được bảo vệ", "Secure connection")}</strong>
              <small>{text("Phiên đăng nhập có thời hạn và được ghi nhận trong nhật ký kiểm toán.", "Sessions are time-limited and recorded in the audit log.")}</small>
            </span>
          </div>

          <div className="login-help">
            <Check size={18} />
            <span>
              <strong>{text("Chưa có tài khoản?", "Need an account?")}</strong>
              <small>{text("Liên hệ bộ phận hỗ trợ nếu email chưa được đăng ký.", "Contact your service desk if your email has not been registered.")}</small>
            </span>
          </div>
        </section>
        <footer className="login-footer">© 2026 CaseFlow · {text("Quyền riêng tư · Điều khoản", "Privacy · Terms")}</footer>
        {resetOpen ? <Modal title={text("Đặt lại mật khẩu", "Reset password")} onClose={() => setResetOpen(false)}>
          <form className="form-stack" onSubmit={requestPasswordReset}>
            <p className="modal-copy">{text("Nhập mã tổ chức và email đã đăng ký. Nếu tài khoản hợp lệ, hướng dẫn sẽ được gửi qua email.", "Enter your organization code and registered email. If the account is valid, instructions will be sent by email.")}</p>
            <label className="field"><span>{text("Mã tổ chức", "Organization code")}</span><input value={organizationSlug} onChange={(event) => setOrganizationSlug(event.target.value.toLowerCase())} required /></label>
            <label className="field"><span>{text("Email tổ chức", "Organization email")}</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            {resetMessage ? <p className="form-notice" role="status">{resetMessage}</p> : null}
            <footer className="editor-actions">
              <button type="button" className="button button-secondary" onClick={() => setResetOpen(false)}>{text("Hủy", "Cancel")}</button>
              <button className="button button-primary" disabled={resetLoading}>{resetLoading ? text("Đang gửi", "Sending") : text("Gửi hướng dẫn", "Send instructions")}</button>
            </footer>
          </form>
        </Modal> : null}
      </main>
    </div>
  );
}
