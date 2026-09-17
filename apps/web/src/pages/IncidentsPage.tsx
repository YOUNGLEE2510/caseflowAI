import { Activity, ArrowUpRight, Link2, Radio, Siren, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState, ErrorState, formatRelative, LoadingState, PageHeader } from "../components/ui";
import { useApiData } from "../hooks/useApiData";
import { useLocale } from "../i18n";
import type { Incident } from "../types";

const incidentStatusLabels: Record<Incident["status"], { vi: string; en: string }> = {
  monitoring: { vi: "Đang theo dõi", en: "Monitoring" },
  investigating: { vi: "Đang điều tra", en: "Investigating" },
  mitigated: { vi: "Đã giảm thiểu", en: "Mitigated" },
  resolved: { vi: "Đã giải quyết", en: "Resolved" }
};

export function IncidentsPage() {
  const { locale, text } = useLocale();
  const { data, loading, error, reload } = useApiData<{ incidents: Incident[] }>("/incidents");

  return (
    <div className="page-stack">
      <PageHeader
        title={text("Trung tâm sự cố", "Incident center")}
        description={text("Theo dõi các cụm yêu cầu và tín hiệu bất thường cần phối hợp xử lý.", "Track request clusters and unusual signals that need coordinated action.")}
      />
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
                    <span className="case-code">{incident.code}</span>
                    <h2>{incident.title}</h2>
                  </div>
                  <span className={`incident-status incident-status-${incident.status}`}>
                    <Radio size={13} />
                    {incidentStatusLabels[incident.status][locale]}
                  </span>
                </header>
                <p>{incident.summary}</p>
                <div className="incident-metrics">
                  <div>
                    <UsersRound size={17} />
                    <span>
                      <strong>{incident.affectedCount}</strong>
                      {text("người ảnh hưởng", "people affected")}
                    </span>
                  </div>
                  <div>
                    <Activity size={17} />
                    <span>
                      <strong>{incident.signal.growthRate}x</strong>
                      {text("tốc độ tăng", "growth rate")}
                    </span>
                  </div>
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
                  {incident.caseIds[0] ? (
                    <Link to={`/cases/${incident.caseIds[0]._id}`} className="text-link">
                      {text("Mở hồ sơ", "Open case")}
                      <ArrowUpRight size={15} />
                    </Link>
                  ) : null}
                </footer>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title={text("Không có sự cố đang theo dõi", "No active incidents")} detail={text("Các cụm bất thường mới sẽ xuất hiện tại đây.", "New anomaly clusters will appear here.")} />
        )
      ) : null}
    </div>
  );
}
