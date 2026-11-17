import { ArrowUpRight, Link2, Plus, Radio, Siren, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import { EmptyState, ErrorState, formatRelative, LoadingState, PageHeader } from "../components/ui";
import { Modal } from "../components/Modal";
import { useApiData } from "../hooks/useApiData";
import { useLocale } from "../i18n";
import type { Incident } from "../types";
import { api } from "../api";
import { useAuth } from "../auth";
import { IncidentEditor } from "../components/IncidentEditor";
import { useConfirmation } from "../components/ConfirmationProvider";

const incidentStatusLabels: Record<Incident["status"], { vi: string; en: string }> = {
  monitoring: { vi: "Đang theo dõi", en: "Monitoring" },
  investigating: { vi: "Đang điều tra", en: "Investigating" },
  mitigated: { vi: "Đã giảm thiểu", en: "Mitigated" },
  resolved: { vi: "Đã giải quyết", en: "Resolved" }
};

export function IncidentsPage() {
  const [opened, setOpened] = useState<Incident | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState("");
  const { user } = useAuth();
  const canManage = user?.role === "manager" || user?.role === "org_admin" || user?.role === "platform_admin";
  const confirm = useConfirmation();
  const { locale, text } = useLocale();
  const { data, loading, error, reload } = useApiData<{ incidents: Incident[] }>("/incidents");

  return (
    <div className="page-stack">
      <PageHeader
        title={text("Trung tâm sự cố", "Incident center")}
        description={text("Theo dõi các cụm yêu cầu và tín hiệu bất thường cần phối hợp xử lý.", "Track request clusters and unusual signals that need coordinated action.")}
      />
      {canManage ? <div><button type="button" className="button button-primary" onClick={() => { setCreateError(""); setCreating(true); }}><Plus size={16} />{text("Tạo sự cố", "Create incident")}</button></div> : null}
      {loading ? <LoadingState label={text("Đang phân tích tín hiệu sự cố", "Analyzing incident signals")} /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {!loading && !error && data ? (
        data.incidents.length ? (
          <div className="incident-grid">
            {data.incidents.map((incident) => (
              <article className="incident-card" key={incident._id}>
                <header>
                  <span className={`incident-icon severity-${incident.severity}`}>
                    <Siren size={19} />
                  </span>
                  <div>
                    <span className="case-code">{incident.propertyCode || incident.code}</span>
                    <h2>{incident.title}</h2>
                  </div>
                  <span className={`incident-status incident-status-${incident.status}`}>
                    <Radio size={13} />
                    {incidentStatusLabels[incident.status][locale]}
                  </span>
                </header>
                <p>{incident.summary}</p>
                <div className="incident-metrics">
                  {!incident.propertyCode ? <div>
                    <UsersRound size={17} />
                    <span>
                      <strong>{incident.affectedCount}</strong>
                      {text("người ảnh hưởng", "people affected")}
                    </span>
                  </div> : null}
                  <div>
                    <Link2 size={17} />
                    <span>
                      <strong>{incident.caseIds.length}</strong>
                      {text("hồ sơ đã liên kết", "linked cases")}
                    </span>
                  </div>
                </div>
                <div className="keyword-row">
                  {incident.signal.keywords.map((keyword) => (
                    <span key={keyword}>{keyword}</span>
                  ))}
                </div>
                <footer>
                  <span>{incident.team} · {text("phát hiện", "detected")} {formatRelative(incident.detectedAt)}</span>
                  {incident.caseIds.length || incident.propertyCode ? (
                    <button type="button" onClick={() => setOpened(incident)} className="text-link">
                      {canManage && incident.propertyCode && incident.status !== "resolved" ? text("Điều phối", "Coordinate") : text("Chi tiết", "Details")}
                      <ArrowUpRight size={15} />
                    </button>
                  ) : null}
                </footer>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title={text("Không có sự cố đang theo dõi", "No active incidents")} detail={text("Chưa có sự cố được ghi nhận.", "No incidents have been recorded.")} />
        )
      ) : null}
      {opened ? <Modal title={opened.title} onClose={() => setOpened(null)}>
        <div className="page-stack">
          {opened.ownerName ? <p>{text("Phụ trách", "Owner")}: {opened.ownerName}</p> : null}
          {opened.appointmentAt ? <p>{text("Lịch hẹn", "Appointment")}: {new Date(opened.appointmentAt).toLocaleString(locale === "vi" ? "vi-VN" : "en")}</p> : null}
          {opened.resolution ? <p>{opened.resolution}</p> : null}
          {opened.rootCause ? <p>{text("Nguyên nhân", "Root cause")}: {opened.rootCause}</p> : null}
          <div className="incident-case-list">{opened.caseIds.map(item => <Link key={item._id} to={`/cases/${item._id}`}><span className="case-code">{item.code}</span><strong>{item.title}</strong><ArrowUpRight size={16} /></Link>)}</div>
          {canManage && opened.propertyCode && opened.status !== "resolved" ? <IncidentEditor incident={opened} onSaved={() => { setOpened(null); void reload(); }} /> : null}
        </div>
      </Modal> : null}
      {creating ? <Modal title={text("Tạo sự cố", "Create incident")} onClose={() => { if (!saving) setCreating(false); }}>
        <form className="page-stack" onSubmit={async event => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          if (!(await confirm({ title: text("Tạo sự cố", "Create incident"), message: text("Liên kết hồ sơ gốc vào sự cố mới?", "Link the initial request to a new incident?") }))) return;
          setSaving(true);
          setCreateError("");
          try {
            await api("/incidents", { method: "POST", body: JSON.stringify({ title: fields.get("title"), caseCode: fields.get("caseCode") }) });
            setCreating(false);
            void reload();
          } catch (cause) {
            setCreateError(cause instanceof Error ? cause.message : text("Không thể tạo sự cố.", "Unable to create incident."));
          } finally {
            setSaving(false);
          }
        }}>
          {createError ? <p role="alert">{createError}</p> : null}
          <label className="field"><span>{text("Tên sự cố", "Incident title")}</span><input name="title" required minLength={3} maxLength={160} /></label>
          <label className="field"><span>{text("Mã hồ sơ gốc", "Initial request code")}</span><input name="caseCode" required maxLength={64} /></label>
          <button type="submit" className="button button-primary" disabled={saving}><Plus size={16} />{text("Tạo sự cố", "Create incident")}</button>
        </form>
      </Modal> : null}
    </div>
  );
}
