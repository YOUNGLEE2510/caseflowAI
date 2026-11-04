import { useState } from "react";
import { LogOut, ShieldCheck } from "lucide-react";
import { api, setToken } from "../api";
import { useLocale } from "../i18n";
import { useApiData } from "../hooks/useApiData";
import { useConfirmation } from "./ConfirmationProvider";
import { ErrorState } from "./ui";

export function SecuritySettings() {
  const { text } = useLocale();
  const confirm = useConfirmation();
  const security = useApiData<{ mfaEnabled: boolean; mfaVerified: boolean; mfaRequired: boolean; mustChangePassword: boolean }>("/profile/security");
  const [password, setPassword] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function action(kind: "setup" | "enable" | "verify" | "logout-all") {
    if (!await confirm({ title: kind === "logout-all" ? text("Đăng xuất mọi thiết bị?", "Sign out all devices?") : text("Xác nhận bảo mật", "Confirm security change"), message: kind === "logout-all" ? text("Tất cả phiên đăng nhập sẽ bị thu hồi.", "All sign-in sessions will be revoked.") : text("Tiếp tục thao tác xác thực hai bước?", "Continue with two-factor authentication?") })) return;
    setBusy(true); setError("");
    try {
      if (kind === "logout-all") {
        await api("/auth/logout-all", { method: "POST" });
        setToken(null); window.location.assign("/login"); return;
      }
      if (kind === "setup") {
        const result = await api<{ secret: string }>("/profile/mfa/setup", { method: "POST", body: JSON.stringify({ password }) });
        setPassword(""); setSecret(result.secret);
      } else {
        const result = await api<{ recoveryCodes?: string[] }>(`/profile/mfa/${kind}`, { method: "POST", body: JSON.stringify({ code }) });
        setCode(""); setSecret("");
        if (result.recoveryCodes) setRecoveryCodes(result.recoveryCodes);
        else window.location.assign("/overview");
        security.reload();
      }
    } catch (error) { setError(error instanceof Error ? error.message : text("Không thể hoàn tất.", "Unable to complete.")); }
    finally { setBusy(false); }
  }
  return <section className="panel profile-panel" id="account-security">
    <div className="profile-section-header"><ShieldCheck size={20} /><h2>{text("Bảo mật tài khoản", "Account security")}</h2></div>
    <div className="form-stack profile-password-form">
      {security.error && <ErrorState message={security.error} onRetry={security.reload} />}
      {security.data?.mustChangePassword && <p role="alert">{text("Cần đổi mật khẩu được cấp trước khi sử dụng hệ thống.", "Change your temporary password before continuing.")}</p>}
      {security.data && <p role="status">{security.data.mfaEnabled ? text("Xác thực hai bước đã bật", "Two-factor authentication enabled") : security.data.mfaRequired ? text("Quản trị viên cần bật xác thực hai bước", "Administrators must enable two-factor authentication") : text("Xác thực hai bước chưa bật", "Two-factor authentication disabled")}</p>}
      {security.data && !security.data.mfaEnabled && !security.data.mustChangePassword && !secret && <form className="form-stack" onSubmit={event => { event.preventDefault(); void action("setup"); }}>
        <label className="field"><span>{text("Mật khẩu hiện tại", "Current password")}</span><input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></label>
        <button className="button button-secondary" disabled={busy}><ShieldCheck size={16} />{text("Thiết lập 2FA", "Set up 2FA")}</button>
      </form>}
      {secret && <label className="field"><span>{text("Khóa thiết lập ứng dụng Authenticator", "Authenticator setup key")}</span><input readOnly value={secret} aria-label={text("Khóa 2FA", "2FA key")} /></label>}
      {(secret || security.data?.mfaEnabled && !security.data.mfaVerified) && <form className="form-stack" onSubmit={event => { event.preventDefault(); void action(secret ? "enable" : "verify"); }}>
        <label className="field"><span>{text("Mã Authenticator hoặc mã khôi phục", "Authenticator or recovery code")}</span><input autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value.trim())} maxLength={20} required /></label>
        <button className="button button-primary" disabled={busy}><ShieldCheck size={16} />{text("Xác nhận 2FA", "Verify 2FA")}</button>
      </form>}
      {recoveryCodes.length > 0 && <div><h3>{text("Mã khôi phục dùng một lần", "One-time recovery codes")}</h3><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{recoveryCodes.join("\n")}</pre><button type="button" className="button button-secondary" onClick={() => window.location.assign("/overview")}>{text("Đã lưu mã khôi phục", "Recovery codes saved")}</button></div>}
      {error && <p role="alert" className="form-error">{error}</p>}
      <button type="button" className="button button-secondary" disabled={busy} onClick={() => void action("logout-all")}><LogOut size={16} />{text("Đăng xuất mọi thiết bị", "Sign out all devices")}</button>
    </div>
  </section>;
}
