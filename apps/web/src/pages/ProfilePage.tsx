import { useState } from "react";
import { Eye, EyeOff, Save, Shield, User as UserIcon } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import { useToast } from "../components/Toast";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "../components/ui";
import { useApiData } from "../hooks/useApiData";
import { useLocale } from "../i18n";

interface ProfileData {
  id: string;
  name: string;
  email: string;
  role: string;
  team: string;
  title: string;
  phone: string;
  avatarColor: string;
  lastLoginAt: string | null;
  createdAt: string;
}

const AVATAR_COLORS = [
  "#155c4d", "#2f6d91", "#73558d", "#b7791f", "#b13b3b",
  "#4f7a55", "#6b5b4d", "#456078", "#8b5e3c", "#5a6e3e"
];

const roleLabels: Record<string, { vi: string; en: string }> = {
  requester: { vi: "Người yêu cầu", en: "Requester" },
  agent: { vi: "Nhân viên xử lý", en: "Agent" },
  manager: { vi: "Quản lý", en: "Manager" },
  org_admin: { vi: "Quản trị tổ chức", en: "Organization Admin" },
  platform_admin: { vi: "Quản trị nền tảng", en: "Platform Admin" }
};

export function ProfilePage() {
  const { text, locale } = useLocale();
  const { logout } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useApiData<{ profile: ProfileData }>("/profile");
  const activity = useApiData<{ activity: Array<{ _id: string; action: string; resource: string; createdAt: string }> }>("/profile/activity");

  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editColor, setEditColor] = useState("");
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  if (loading) return <LoadingState label={text("Đang tải hồ sơ cá nhân", "Loading profile")} />;
  if (error || !data) return <ErrorState message={error || text("Không có dữ liệu.", "No data.")} onRetry={reload} />;

  const profile = data.profile;

  function startEdit() {
    setEditName(profile.name);
    setEditPhone(profile.phone);
    setEditColor(profile.avatarColor);
    setEditMode(true);
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const changes: Record<string, string> = {};
      if (editName !== profile.name) changes.name = editName;
      if (editPhone !== profile.phone) changes.phone = editPhone;
      if (editColor !== profile.avatarColor) changes.avatarColor = editColor;
      if (Object.keys(changes).length === 0) {
        setEditMode(false);
        return;
      }
      await api("/profile", { method: "PATCH", body: JSON.stringify(changes) });
      toast.success(text("Đã cập nhật hồ sơ.", "Profile updated."));
      setEditMode(false);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : text("Không thể cập nhật.", "Update failed."));
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error(text("Mật khẩu xác nhận không khớp.", "Passwords do not match."));
      return;
    }
    setChangingPassword(true);
    try {
      await api("/profile/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword })
      });
      toast.success(text("Đã đổi mật khẩu. Vui lòng đăng nhập lại.", "Password updated. Please sign in again."));
      logout();
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : text("Không thể đổi mật khẩu.", "Password change failed."));
    } finally {
      setChangingPassword(false);
    }
  }

  const rl = roleLabels[profile.role] || { vi: profile.role, en: profile.role };

  return (
    <div className="page-stack">
      <PageHeader
        title={text("Hồ sơ cá nhân", "My Profile")}
        description={text("Quản lý thông tin cá nhân và bảo mật tài khoản.", "Manage your personal information and account security.")}
      />

      {/* ── Profile Info ── */}
      <section className="panel profile-panel">
        <div className="profile-header">
          <span className="avatar avatar-large" style={{ backgroundColor: profile.avatarColor }}>
            {profile.name.split(" ").slice(-2).map((p) => p[0]).join("").toUpperCase()}
          </span>
          <div>
            <h2 className="profile-name">{profile.name}</h2>
            <span className="profile-role">
              {text(rl.vi, rl.en)} · {profile.team || profile.email}
            </span>
          </div>
        </div>

        {!editMode ? (
          <div>
            <div className="detail-grid profile-grid">
              <div>
                <small className="profile-label">Email</small>
                <div>{profile.email}</div>
              </div>
              <div>
                <small className="profile-label">{text("Điện thoại", "Phone")}</small>
                <div>{profile.phone || "—"}</div>
              </div>
              <div>
                <small className="profile-label">{text("Chức danh", "Title")}</small>
                <div>{profile.title || "—"}</div>
              </div>
              <div>
                <small className="profile-label">{text("Đăng nhập gần nhất", "Last login")}</small>
                <div>
                  {profile.lastLoginAt
                    ? new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-GB", {
                        dateStyle: "medium",
                        timeStyle: "short"
                      }).format(new Date(profile.lastLoginAt))
                    : "—"}
                </div>
              </div>
            </div>
            <div className="profile-actions">
              <button className="button button-secondary" onClick={startEdit}>
                <UserIcon size={16} />
                {text("Chỉnh sửa", "Edit")}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSaveProfile} className="form-stack profile-form">
            <label className="field">
              <span>{text("Họ tên", "Full name")}</span>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
                minLength={2}
                maxLength={100}
              />
            </label>
            <label className="field">
              <span>{text("Điện thoại", "Phone")}</span>
              <input
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                maxLength={20}
              />
            </label>
            <div className="field">
              <span>{text("Màu đại diện", "Avatar color")}</span>
              <div className="profile-color-picker">
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`profile-color-btn ${editColor === c ? "active" : ""}`}
                    style={{ background: c }}
                    onClick={() => setEditColor(c)}
                    aria-label={c}
                  />
                ))}
              </div>
            </div>
            <div className="profile-form-buttons">
              <button type="submit" className="button button-primary" disabled={saving}>
                <Save size={16} />
                {saving ? text("Đang lưu...", "Saving...") : text("Lưu thay đổi", "Save changes")}
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setEditMode(false)}
                disabled={saving}
              >
                {text("Hủy", "Cancel")}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* ── Recent Activity ── */}
      <section className="panel profile-panel">
        <h2>{text("Hoạt động gần đây", "Recent activity")}</h2>
        {activity.error ? <ErrorState message={activity.error} onRetry={activity.reload} /> : null}
        {activity.loading ? (
          <LoadingState />
        ) : activity.data?.activity && activity.data.activity.length > 0 ? (
          <ul className="profile-activity-list">
            {activity.data.activity.map((item) => (
              <li key={item._id}>
                <time>
                  {new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-GB", {
                    dateStyle: "short",
                    timeStyle: "short"
                  }).format(new Date(item.createdAt))}
                </time>
                {" · "}
                {item.action} · {item.resource}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title={text("Chưa có hoạt động nào", "No recent activity")}
            detail={text(
              "Các hoạt động của tài khoản sẽ xuất hiện tại đây.",
              "Account activities will appear here."
            )}
          />
        )}
      </section>

      {/* ── Change Password ── */}
      <section className="panel profile-panel">
        <div className="profile-section-header">
          <Shield size={20} />
          <h2>{text("Đổi mật khẩu", "Change password")}</h2>
        </div>
        <form onSubmit={handleChangePassword} className="form-stack profile-password-form">
          <div className="field">
            <label htmlFor="current-pw">{text("Mật khẩu hiện tại", "Current password")}</label>
            <span className="password-field">
              <input
                id="current-pw"
                type={showPasswords ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowPasswords((v) => !v)}
                aria-label={showPasswords ? "Hide" : "Show"}
              >
                {showPasswords ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </span>
          </div>
          <label className="field">
            <span>{text("Mật khẩu mới", "New password")}</span>
            <input
              type={showPasswords ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={10}
              maxLength={128}
              autoComplete="new-password"
            />
          </label>
          <label className="field">
            <span>{text("Xác nhận mật khẩu mới", "Confirm new password")}</span>
            <input
              type={showPasswords ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={10}
              maxLength={128}
              autoComplete="new-password"
            />
          </label>
          <button
            type="submit"
            className="button button-primary"
            disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
          >
            {changingPassword ? <span className="spinner spinner-light" /> : <Shield size={16} />}
            {changingPassword
              ? text("Đang cập nhật...", "Updating...")
              : text("Cập nhật mật khẩu", "Update password")}
          </button>
        </form>
      </section>
    </div>
  );
}
