import { useState } from "react";
import { Check, Plus, Search, ShieldCheck, Pencil } from "lucide-react";
import { useAuth } from "../auth";
import { UserEditor } from "../components/AdminEditors";
import { Avatar, ErrorState, LoadingState, PageHeader } from "../components/ui";
import { useApiData } from "../hooks/useApiData";
import { useLocale } from "../i18n";
import type { Role, User } from "../types";

const roleLabels: Record<Role, { vi: string; en: string }> = {
  requester: { vi: "Người yêu cầu", en: "Requester" },
  agent: { vi: "Nhân viên", en: "Agent" },
  manager: { vi: "Quản lý", en: "Manager" },
  org_admin: { vi: "Quản trị tổ chức", en: "Organization admin" },
  platform_admin: { vi: "Quản trị nền tảng", en: "Platform admin" }
};

const permissionsByRole: Record<Role, Array<{ vi: string; en: string; enabled: boolean }>> = {
  requester: [
    { vi: "Xem hồ sơ của bản thân", en: "View own requests", enabled: true },
    { vi: "Gửi yêu cầu và phản hồi", en: "Submit requests and replies", enabled: true },
    { vi: "Xem hồ sơ toàn tổ chức", en: "View organization-wide requests", enabled: false }
  ],
  agent: [
    { vi: "Xem hồ sơ trong tổ chức", en: "View organization requests", enabled: true },
    { vi: "Cập nhật trạng thái hồ sơ", en: "Update request status", enabled: true },
    { vi: "Phân công người xử lý", en: "Assign requests", enabled: true }
  ],
  manager: [
    { vi: "Xem và tìm kiếm mọi hồ sơ", en: "View and search all requests", enabled: true },
    { vi: "Phân công người xử lý", en: "Assign requests", enabled: true },
    { vi: "Cập nhật ưu tiên", en: "Update priority", enabled: true },
    { vi: "Quản trị thành viên", en: "Manage members", enabled: false },
    { vi: "Cấu hình mô hình AI", en: "Configure AI models", enabled: false }
  ],
  org_admin: [
    { vi: "Quản trị thành viên", en: "Manage members", enabled: true },
    { vi: "Cấu hình danh mục dịch vụ", en: "Configure service catalog", enabled: true },
    { vi: "Xem nhật ký kiểm toán", en: "View audit log", enabled: true }
  ],
  platform_admin: [
    { vi: "Quản trị thành viên trong tổ chức", en: "Manage organization members", enabled: true },
    { vi: "Cấu hình dịch vụ", en: "Configure services", enabled: true },
    { vi: "Xem nhật ký kiểm toán", en: "View audit log", enabled: true }
  ]
};

export function UsersPage() {
  const { locale, text } = useLocale();
  const { user } = useAuth();
  const canManage = user && ["org_admin", "platform_admin"].includes(user.role);
  const { data, loading, error, reload } = useApiData<{ users: User[] }>("/users?includeInactive=true");
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  const filteredUsers = data?.users.filter((member) =>
    [member.name, member.email, member.team, roleLabels[member.role][locale]]
      .join(" ")
      .toLocaleLowerCase(locale)
      .includes(normalizedQuery)
  ) || [];
  const selected = data?.users.find((member) => member.id === selectedId) || filteredUsers[0] || data?.users[0];

  return (
    <div className="page-stack">
      <PageHeader
        title={text("Nhân sự và phân quyền", "People and access")}
        description={text(
          "Quản lý thành viên, vai trò và phạm vi dữ liệu trong tổ chức.",
          "Manage members, roles, and data access across the organization."
        )}
        actions={
          canManage ? <button className="button button-primary" onClick={() => setEditing("new")}>
            <Plus size={17} />
            {text("Thêm thành viên", "Add member")}
          </button> : null
        }
      />

      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {!loading && !error && data ? (
        <div className="user-admin-layout">
          <section className="panel user-list-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">{text("Tổ chức", "Organization")}</span>
                <h2>{text("Danh sách thành viên", "Members")}</h2>
              </div>
              <span className="panel-kpi">{data.users.length} {text("người", "people")}</span>
            </div>

            <label className="admin-search">
              <Search size={18} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={text("Tìm theo tên, email hoặc đơn vị", "Search by name, email, or team")}
              />
            </label>

            <div className="user-list-heading" aria-hidden="true">
              <span>{text("Thành viên", "Member")}</span>
              <span>{text("Vai trò", "Role")}</span>
              <span>{text("Đơn vị", "Team")}</span>
              <span>{text("Trạng thái", "Status")}</span>
            </div>
            <div className="user-list">
              {filteredUsers.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  className={selected?.id === member.id ? "selected" : ""}
                  onClick={() => setSelectedId(member.id)}
                >
                  <span className="member-cell">
                    <Avatar name={member.name} color={member.avatarColor} size="medium" />
                    <span>
                      <strong>{member.name}</strong>
                      <small>{member.email}</small>
                    </span>
                  </span>
                  <span className={`role-label role-${member.role}`}>
                    <ShieldCheck size={14} />
                    {roleLabels[member.role][locale]}
                  </span>
                  <span>{member.team || text("Toàn tổ chức", "All teams")}</span>
                  <span className={member.active === false ? "inactive-label" : "active-label"}>{member.active === false ? text("Đã khóa", "Disabled") : text("Hoạt động", "Active")}</span>
                </button>
              ))}
            </div>
            {!filteredUsers.length ? <div className="inline-empty">{text("Không tìm thấy thành viên phù hợp.", "No matching members found.")}</div> : null}
          </section>

          {selected ? (
            <aside className="panel user-permission-panel">
              <div className="permission-profile">
                <Avatar name={selected.name} color={selected.avatarColor} size="large" />
                <span>
                  <h2>{selected.name}</h2>
                  <small>{selected.email}</small>
                </span>
              </div>
              {canManage && selected.role !== "platform_admin" ? <button className="button button-secondary button-small" onClick={() => setEditing(selected)}><Pencil size={16} />{text("Sửa thành viên", "Edit member")}</button> : null}
              <div className="config-divider" />
              <dl className="permission-meta">
                <div>
                  <dt>{text("Vai trò", "Role")}</dt>
                  <dd>{roleLabels[selected.role][locale]}</dd>
                </div>
                <div>
                  <dt>{text("Phạm vi dữ liệu", "Data scope")}</dt>
                  <dd>{selected.role === "requester" ? text("Hồ sơ cá nhân", "Own requests") : text("Trong tổ chức", "Organization-wide")}</dd>
                </div>
                <div>
                  <dt>{text("Chức danh", "Job title")}</dt>
                  <dd>{selected.title || text("Chưa cập nhật", "Not provided")}</dd>
                </div>
              </dl>
              <div className="config-divider" />
              <section className="permission-section">
                <h3>{text("Quyền hiệu lực", "Effective permissions")}</h3>
                {permissionsByRole[selected.role].map((permission) => (
                  <div key={permission.en} className={permission.enabled ? "enabled" : ""}>
                    <span className="permission-toggle"><span /></span>
                    <span>{permission[locale]}</span>
                  </div>
                ))}
              </section>
              <div className="permission-note">
                <Check size={18} />
                <span>{text("Dữ liệu được cách ly theo tổ chức.", "Data is isolated by organization.")}</span>
              </div>
            </aside>
          ) : null}
        </div>
      ) : null}
      {editing ? <UserEditor member={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); }} /> : null}
    </div>
  );
}
