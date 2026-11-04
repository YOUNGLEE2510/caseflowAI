import { CalendarClock, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import type { CaseRecord, CaseStatus } from "../types";
import { PriorityBadge, StatusBadge, formatRelative } from "./ui";
import { useLocale } from "../i18n";
import { useAuth } from "../auth";
import { api } from "../api";
import { useConfirmation } from "./ConfirmationProvider";
import { useState } from "react";

interface BoardColumn {
  id: string;
  statuses: CaseStatus[];
  vi: string;
  en: string;
}

const columns: BoardColumn[] = [
  { id: "intake", statuses: ["new", "triaged"], vi: "Tiếp nhận", en: "Intake" },
  { id: "progress", statuses: ["in_progress"], vi: "Đang xử lý", en: "In progress" },
  { id: "waiting", statuses: ["waiting"], vi: "Chờ phản hồi", en: "Waiting" },
  { id: "completed", statuses: ["resolved", "closed"], vi: "Hoàn tất", en: "Completed" }
];

export function CaseKanbanBoard({ cases, counts, onChanged }: { cases: CaseRecord[]; counts?: Record<string, number>; onChanged?: () => void }) {
  const { text } = useLocale();
  const { user } = useAuth();
  const confirm = useConfirmation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function take(record: CaseRecord) {
    if (busy || !await confirm({ title: text("Nhận hồ sơ?", "Take this case?"), message: record.code })) return;
    setBusy(true); setError("");
    try { await api(`/cases/${record._id}`, { method: "PATCH", body: JSON.stringify({ assigneeId: user!.id }) }); onChanged?.(); }
    catch (error) { setError(error instanceof Error ? error.message : text("Không thể nhận hồ sơ.", "Unable to take case.")); }
    finally { setBusy(false); }
  }

  return (
    <section className="case-board-scroll" aria-label={text("Bảng điều phối hồ sơ", "Case coordination board")}>
      {error ? <p role="alert">{error}</p> : null}
      <div className="case-board">
        {columns.map((column) => {
          const items = cases.filter((item) => column.statuses.includes(item.status as CaseStatus));
          return (
            <div className="case-board-column" key={column.id}>
              <header>
                <h2>{text(column.vi, column.en)}</h2>
                <span>{items.length}{counts ? ` / ${column.statuses.reduce((sum, status) => sum + (counts[status] || 0), 0)}` : ""}</span>
              </header>
              <div className="case-board-cards">
                {items.map((item) => (
                  <article className="case-board-card" key={item._id}>
                    <div className="case-board-card-meta">
                      <PriorityBadge priority={item.priority} />
                      <span className="case-board-code">{item.code}</span>
                    </div>
                    <Link to={`/cases/${item._id}`}><strong>{item.title}</strong></Link>
                    <StatusBadge status={item.status as CaseStatus} />
                    <footer>
                      <span><UserRound size={13} /> {item.assigneeName || item.requesterName}</span>
                      <span><CalendarClock size={13} /> {formatRelative(item.dueAt)}</span>
                    </footer>
                    {user?.role === "agent" && !item.assigneeId && !["closed", "resolved"].includes(item.status) ? <button type="button" className="text-link" disabled={busy} onClick={() => void take(item)}>{text("Nhận hồ sơ", "Take case")}</button> : null}
                  </article>
                ))}
                {!items.length ? <div className="case-board-empty">{text("Không có hồ sơ", "No cases")}</div> : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
