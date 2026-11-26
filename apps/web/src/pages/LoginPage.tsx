import { useEffect, useState } from "react";
import { ArrowRight, Building2, Check, Eye, EyeOff, QrCode, ShieldCheck, Sparkles, Timer, Wrench } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth";
import { api, apiUrl } from "../api";
import { BrandLogo } from "../components/BrandLogo";
import { LocaleSwitcher } from "../components/LocaleSwitcher";
import { ThemeSwitcher } from "../components/ThemeSwitcher";
import { Modal } from "../components/Modal";
import { useLocale } from "../i18n";
import { useConfirmation } from "../components/ConfirmationProvider";

const defaultOrganizationSlug = "caseflow-rental";

export function LoginPage() {
  const { user, login, loginWithGoogle } = useAuth();
  const { text } = useLocale();
  const confirm = useConfirmation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [organizationSlug, setOrganizationSlug] = useState(defaultOrganizationSlug);
  const [organizations, setOrganizations] = useState<Array<{ name: string; slug: string }>>([]);
  const [organizationsLoaded, setOrganizationsLoaded] = useState(false);
  const [providers, setProviders] = useState({ google: false });
  useEffect(() => {
    let active = true;
    void api<{ google: boolean }>("/auth/providers")
      .then(value => { if (active) setProviders(value); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    void api<{ organizations: Array<{ name: string; slug: string }> }>("/auth/organizations?domain=rental").then(response => {
      if (!active) return;
      setOrganizations(response.organizations);
      const requested = searchParams.get("organization")?.trim().toLowerCase();
      // An unlisted organization can still be opened by its code (?organization=…).
      const selected = requested || (response.organizations.find(item => item.slug === defaultOrganizationSlug) || response.organizations[0])?.slug;
      if (selected) setOrganizationSlug(selected);
    }).catch(() => undefined).finally(() => { if (active) setOrganizationsLoaded(true); });
    return () => { active = false; };
  }, [searchParams]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  const googleCode = searchParams.get("googleCode");
  const oauthError = searchParams.get("oauthError");
  const oauthProvider = "Google";

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
      : text(`Không thể đăng nhập bằng ${oauthProvider}. Vui lòng thử lại hoặc dùng mật khẩu.`, `${oauthProvider} sign-in could not be completed. Please try again or use your password.`);
    setError(message);
  }, [oauthError, oauthProvider, text]);


  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // Until the organization list arrives the code is only the default guess: wait for it.
    if (!organizationsLoaded || loading) return;
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
    if (!await confirm({ title: text("Gửi hướng dẫn đổi mật khẩu?", "Send password reset instructions?"), message: email })) return;
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
    <div className="login-screen auth-screen">
      <aside className="auth-showcase" aria-label={text("Giới thiệu CaseFlow", "About CaseFlow")}>
        <BrandLogo tone="inverse" size={40} tagline={text("Vận hành căn hộ", "Apartment operations")} />
        <div className="auth-showcase-copy">
          <span className="auth-kicker">{text("Nền tảng vận hành căn hộ cho thuê", "Operations for rental apartments")}</span>
          <h2>{text("Mọi phản ánh của cư dân,", "Every resident request,")} <em>{text("một luồng xử lý rõ ràng.", "one clear path to done.")}</em></h2>
          <p>{text("Tiếp nhận qua ứng dụng hoặc mã QR, AI gợi ý phân loại và mức ưu tiên, kỹ thuật viên cập nhật tiến độ cho tới khi hoàn tất.", "Take reports in the app or by QR code, let AI suggest the category and priority, and track technicians until the job is done.")}</p>
        </div>
        <div className="auth-preview" aria-hidden="true">
          <div className="auth-ticket">
            <div className="auth-ticket-head">
              <span className="auth-ticket-unit">A301</span>
              <span className="auth-chip auth-chip-progress">{text("Đang xử lý", "In progress")}</span>
            </div>
            <strong>{text("Điều hòa phòng ngủ không lạnh", "Bedroom air conditioner not cooling")}</strong>
            <span className="auth-ticket-meta"><Wrench size={14} />{text("Kỹ thuật điện lạnh · hạn 15:00 hôm nay", "HVAC team · due 15:00 today")}</span>
            <ol className="auth-steps">
              <li className="done">{text("Tiếp nhận", "Received")}</li>
              <li className="done">{text("Điều phối", "Assigned")}</li>
              <li className="current">{text("Sửa chữa", "Repair")}</li>
              <li>{text("Hoàn tất", "Done")}</li>
            </ol>
          </div>
          <div className="auth-float auth-float-ai"><Sparkles size={16} /><span><small>{text("AI gợi ý", "AI suggestion")}</small>{text("Thiết bị · Ưu tiên cao", "Appliances · High priority")}</span></div>
          <div className="auth-float auth-float-sla"><Timer size={16} /><span><small>{text("Đúng hạn SLA", "On-time SLA")}</small>94%</span></div>
        </div>
        <ul className="auth-points">
          <li><QrCode size={18} />{text("Cư dân báo sự cố bằng mã QR, không cần tài khoản", "Residents report by QR code, no account needed")}</li>
          <li><Building2 size={18} />{text("Theo dõi căn hộ, thiết bị và lịch sửa chữa", "Track units, assets and repair schedules")}</li>
          <li><ShieldCheck size={18} />{text("Phân quyền theo vai trò, nhật ký kiểm toán đầy đủ", "Role-based access with a full audit log")}</li>
        </ul>
        <svg className="auth-skyline" viewBox="0 0 640 160" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
          <path d="M0 160V96h52V60h46v36h30V34h64v126m0 0V78h40V48h58v30h34V20h70v140m0 0V88h44V58h52v30h30V44h60v116m0 0V70h40v90" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </aside>

      <main className="login-form-area">
        <div className="login-locale"><LocaleSwitcher /><ThemeSwitcher /></div>
        <section className="login-panel">
          <div className="login-heading">
            <span className="auth-mobile-logo"><BrandLogo size={36} tagline={text("Vận hành căn hộ", "Apartment operations")} /></span>
            <h1>{text("Chào mừng trở lại", "Welcome back")}</h1>
            <p>{text("Đăng nhập để gửi phản ánh và theo dõi việc xử lý tại căn hộ của bạn.", "Sign in to report an issue and track repairs at your apartment.")}</p>
          </div>

          <form onSubmit={handleSubmit} className="form-stack">
            <label className="field">
              <span>{text("Đơn vị vận hành", "Property operator")}</span>
              {organizations.length > 1 && organizations.some(item => item.slug === organizationSlug) ? <select value={organizationSlug} onChange={event => setOrganizationSlug(event.target.value)} required aria-label={text("Đơn vị vận hành", "Property operator")}>
                {organizations.map(item => <option key={item.slug} value={item.slug}>{item.name}</option>)}
              </select> : organizations.length || !organizationsLoaded ? <input
                className="organization-fixed"
                readOnly
                value={organizations.find(item => item.slug === organizationSlug)?.name || (organizationsLoaded ? organizationSlug : text("Đang tải…", "Loading…"))}
                aria-label={text("Đơn vị vận hành", "Property operator")}
              /> : <input
                value={organizationSlug}
                onChange={(event) => setOrganizationSlug(event.target.value.toLowerCase())}
                autoComplete="organization"
                placeholder="caseflow-rental"
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                required
              />}
            </label>
            <label className="field">
              <span>{text("Email tài khoản", "Account email")}</span>
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
            <button className="button button-primary login-button" disabled={loading || !organizationsLoaded}>
              {loading ? <span className="spinner spinner-light" /> : <ArrowRight size={18} />}
              <span>{loading ? text("Đang đăng nhập", "Signing in") : text("Đăng nhập", "Sign in")}</span>
            </button>
          </form>

          {/* Google sign-in appears only when the deployment has it configured. */}
          {providers.google ? <div className="login-provider-separator" aria-hidden="true"><span>{text("hoặc", "or")}</span></div> : null}
          {providers.google ? <button className="button login-google" type="button" onClick={startGoogleLogin} title={!providers.google ? text("Chưa cấu hình đăng nhập Google", "Google sign-in is not configured") : undefined} disabled={loading || !organizationSlug.trim() || !providers.google}>
            <img className="provider-mark" src="/google-logo.png" width="20" height="20" alt="" />
            <span>{text("Tiếp tục với Google", "Continue with Google")}</span>
          </button> : null}

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
              <small>{text("Liên hệ ban quản lý căn hộ để được cấp tài khoản cư dân.", "Contact property management to receive your resident account.")}</small>
            </span>
          </div>
        </section>
        <footer className="login-footer">© 2026 CaseFlow</footer>
        {resetOpen ? <Modal title={text("Đặt lại mật khẩu", "Reset password")} onClose={() => setResetOpen(false)}>
          <form className="form-stack" onSubmit={requestPasswordReset}>
            <p className="modal-copy">{text("Nhập mã đơn vị vận hành và email tài khoản. Nếu thông tin hợp lệ, hướng dẫn đặt lại mật khẩu sẽ được gửi qua email.", "Enter your property operator code and account email. If the details are valid, password reset instructions will be emailed to you.")}</p>
            <label className="field"><span>{text("Mã đơn vị vận hành", "Property operator code")}</span><input value={organizationSlug} onChange={(event) => setOrganizationSlug(event.target.value.toLowerCase())} required /></label>
            <label className="field"><span>{text("Email tài khoản", "Account email")}</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
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
