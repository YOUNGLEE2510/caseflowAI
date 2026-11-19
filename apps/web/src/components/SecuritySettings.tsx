import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { LogIn, LogOut, ShieldCheck } from "lucide-react";
import { api, setToken } from "../api";
import { useLocale } from "../i18n";
import { useApiData } from "../hooks/useApiData";
import { useConfirmation } from "./ConfirmationProvider";
import { ErrorState } from "./ui";

export function SecuritySettings({ organizationSlug = "" }: { organizationSlug?: string }) {
  const { text } = useLocale();
  const confirm = useConfirmation();
  const security = useApiData<{ mfaEnabled: boolean; mfaVerified: boolean; mfaRequired: boolean; mustChangePassword: boolean; signInMethod?: "password" | "google" | "microsoft"; providerReauthFresh?: boolean }>("/profile/security");
  const [setupUri, setSetupUri] = useState("");
  const [qrImage, setQrImage] = useState("");
  useEffect(() => {
    if (!setupUri) { setQrImage(""); return; }
    QRCode.toDataURL(setupUri, { margin: 1, width: 220 }).then(setQrImage).catch(() => setQrImage(""));
  }, [setupUri]);
  const provider = security.data?.signInMethod && security.data.signInMethod !== "password" ? security.data.signInMethod : null;
  const providerName = provider === "microsoft" ? "Microsoft" : "Google";
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
        const result = await api<{ secret: string; uri: string }>("/profile/mfa/setup", { method: "POST", body: JSON.stringify(password ? { password } : {}) });
        setPassword(""); setSecret(result.secret); setSetupUri(result.uri);
      } else {
        const result = await api<{ recoveryCodes?: string[] }>(`/profile/mfa/${kind}`, { method: "POST", body: JSON.stringify({ code }) });
        setCode(""); setSecret(""); setSetupUri("");
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
        {provider && security.data.providerReauthFresh ? <p className="form-hint">{text(`Bạn vừa đăng nhập bằng ${providerName} nên có thể thiết lập ngay, không cần mật khẩu.`, `You just signed in with ${providerName}, so you can set this up without a password.`)}</p> : null}
        {provider && !security.data.providerReauthFresh ? <p className="form-hint">{text(`Tài khoản đăng nhập bằng ${providerName}: đăng nhập lại để xác nhận danh tính (hiệu lực 10 phút), hoặc nhập mật khẩu nếu bạn có.`, `${providerName} account: sign in again to confirm it is you (valid for 10 minutes), or enter your password if you have one.`)}</p> : null}
        {!(provider && security.data.providerReauthFresh) ? <label className="field"><span>{text("Mật khẩu hiện tại", "Current password")}</span><input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required={!provider} /></label> : null}
        <div className="button-row">
          <button className="button button-primary" disabled={busy || (!password && !(provider && security.data.providerReauthFresh))}><ShieldCheck size={16} />{text("Thiết lập 2FA", "Set up 2FA")}</button>
          {provider && !security.data.providerReauthFresh ? <button type="button" className="button button-secondary" disabled={busy} onClick={async () => {
            try { await api("/auth/logout", { method: "POST" }); } catch { /* signing in again works either way */ }
            setToken(null); window.location.assign(`/login?organization=${encodeURIComponent(organizationSlug)}`);
          }}><LogIn size={16} />{text(`Đăng nhập lại bằng ${providerName}`, `Sign in again with ${providerName}`)}</button> : null}
        </div>
      </form>}
      {secret && qrImage ? <figure className="mfa-qr"><img src={qrImage} width={220} height={220} alt={text("Mã QR thiết lập ứng dụng Authenticator", "Authenticator setup QR code")} />
        <figcaption>{text("Quét bằng Google Authenticator, Microsoft Authenticator hoặc ứng dụng tương tự, rồi nhập mã 6 số bên dưới.", "Scan with Google Authenticator, Microsoft Authenticator or a similar app, then enter the 6-digit code below.")}</figcaption></figure> : null}
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
