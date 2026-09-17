import { useState } from "react";
import { Check, Clock3, Network, Plus, UsersRound, Pencil } from "lucide-react";
import { useAuth } from "../auth";
import { ServiceEditor } from "../components/AdminEditors";
import { ErrorState, LoadingState, PageHeader } from "../components/ui";
import { useApiData } from "../hooks/useApiData";
import { useLocale } from "../i18n";
import type { ServiceDefinition } from "../types";

const classificationHints: Record<string, { vi: string; en: string }> = {
  access_account: { vi: "đăng nhập, mật khẩu, email xác thực, tài khoản, cổng sinh viên", en: "sign in, password, verification email, account, student portal" },
  academic_support: { vi: "học phần, lịch học, đăng ký môn, cố vấn học tập, thực tập", en: "course, class schedule, enrollment, academic advising, internship" },
  student_finance: { vi: "học phí, công nợ, giao dịch, hóa đơn, miễn giảm", en: "tuition, balance, transaction, invoice, fee waiver" },
  student_services: { vi: "thẻ sinh viên, giấy xác nhận, hỗ trợ đời sống, thủ tục", en: "student card, confirmation letter, wellbeing support, procedure" },
  facilities: { vi: "phòng học, thiết bị, cơ sở vật chất, điện, mạng", en: "classroom, equipment, facilities, electricity, network" },
  examination: { vi: "lịch thi, phòng thi, điểm thi, phúc khảo, khảo thí", en: "exam schedule, exam room, grade, review, assessment" }
};

export function ServicesPage() {
  const { locale, text } = useLocale();
  const { user } = useAuth();
  const canManage = user && ["org_admin", "platform_admin"].includes(user.role);
  const { data, loading, error, reload } = useApiData<{ services: ServiceDefinition[] }>("/services?includeInactive=true");
  const [editing, setEditing] = useState<ServiceDefinition | "new" | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = data?.services.find((service) => service.key === selectedKey) || data?.services[0];

  return (
    <div className="page-stack">
      <PageHeader
        title={text("Danh mục dịch vụ", "Service catalog")}
        description={text(
          "Quản lý nơi tiếp nhận, thời hạn phản hồi và dữ liệu cần có cho từng loại yêu cầu.",
          "Manage ownership, response targets, and required information for each request type."
        )}
        actions={
          canManage ? <button className="button button-primary" onClick={() => setEditing("new")}>
            <Plus size={17} />
            {text("Thêm dịch vụ", "Add service")}
          </button> : null
        }
      />

      {loading ? <LoadingState label={text("Đang tải danh mục dịch vụ", "Loading service catalog")} /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {!loading && !error && data ? (
        <div className="service-admin-layout">
          <section className="panel service-catalog-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">{text("Danh mục", "Catalog")}</span>
                <h2>{data.services.length} {text("dịch vụ", "services")}</h2>
              </div>
            </div>

            <div className="service-list-heading" aria-hidden="true">
              <span>{text("Dịch vụ", "Service")}</span>
              <span>{text("Đơn vị", "Team")}</span>
              <span>SLA</span>
              <span>{text("Trạng thái", "Status")}</span>
            </div>
            <div className="service-list">
              {data.services.map((service) => (
                <button
                  key={service._id}
                  type="button"
                  className={selected?._id === service._id ? "selected" : ""}
                  onClick={() => setSelectedKey(service.key)}
                >
                  <span className="service-list-name">
                    <span className="service-list-icon"><Network size={18} /></span>
                    <span>
                      <strong>{service.name}</strong>
                      <small>{service.key}</small>
                    </span>
                  </span>
                  <span>{service.team}</span>
                  <strong>{service.slaHours} {text("giờ", "hours")}</strong>
                  <span className={service.active === false ? "inactive-label" : "active-label"}>{service.active === false ? text("Tạm dừng", "Inactive") : text("Hoạt động", "Active")}</span>
                </button>
              ))}
            </div>
            <footer className="table-footer">
              <span>{text(
                `Hiển thị 1–${data.services.length} trong ${data.services.length} dịch vụ`,
                `Showing 1–${data.services.length} of ${data.services.length} services`
              )}</span>
            </footer>
          </section>

          {selected ? (
            <aside className="panel service-config-panel">
              <span className="eyebrow">{text("Cấu hình đang hiệu lực", "Current setup")}</span>
              <h2>{selected.name}</h2>
              <p className="config-key">{selected.key}</p>
              {canManage ? <button className="button button-secondary button-small" onClick={() => setEditing(selected)}><Pencil size={16} />{text("Sửa cấu hình", "Edit setup")}</button> : null}

              <div className="config-divider" />
              <dl className="config-list">
                <div>
                  <dt><UsersRound size={16} /> {text("Đơn vị phụ trách", "Owning team")}</dt>
                  <dd>{selected.team}</dd>
                </div>
                <div>
                  <dt><Clock3 size={16} /> {text("SLA phản hồi", "Response target")}</dt>
                  <dd>{selected.slaHours} {text("giờ", "hours")}</dd>
                </div>
                <div>
                  <dt><Check size={16} /> {text("Trạng thái", "Status")}</dt>
                  <dd>{selected.active === false ? text("Tạm dừng", "Inactive") : text("Hoạt động", "Active")}</dd>
                </div>
              </dl>

              <div className="config-divider" />
              <section className="config-section">
                <h3>{text("Trường thông tin bắt buộc", "Required information")}</h3>
                <div className="config-chips">
                  {selected.requiredFields.length ? (
                    selected.requiredFields.map((field) => <span key={field}>{field}</span>)
                  ) : (
                    <small>{text("Không có trường bắt buộc bổ sung.", "No additional required fields.")}</small>
                  )}
                </div>
              </section>

              <section className="config-section">
                <h3>{text("Từ khóa hỗ trợ phân loại AI", "AI routing keywords")}</h3>
                <p>{classificationHints[selected.key]?.[locale] || `${selected.name}, ${selected.category}`}</p>
              </section>

              <div className="config-ai-note">
                <Check size={18} />
                <span>
                  <strong>{text("Phân luồng có nhân viên xác nhận", "Staff-reviewed routing")}</strong>
                  <small>{selected.category}</small>
                </span>
              </div>
            </aside>
          ) : null}
        </div>
      ) : null}
      {editing ? <ServiceEditor service={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); }} /> : null}
    </div>
  );
}
