import { CalendarClock, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import type { CaseRecord, CaseStatus } from "../types";
import { PriorityBadge, StatusBadge, formatRelative } from "./ui";
import { useLocale } from "../i18n";

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

export function CaseKanbanBoard({ cases }: { cases: CaseRecord[] }) {
  const { text } = useLocale();

  return (
    <section className="case-board-scroll" aria-label={text("Bảng điều phối hồ sơ", "Case coordination board")}>
      <div className="case-board">
        {columns.map((column) => {
          const items = cases.filter((item) => column.statuses.includes(item.status as CaseStatus));
          return (
            <div className="case-board-column" key={column.id}>
              <header>
                <h2>{text(column.vi, column.en)}</h2>
                <span aria-label={text(`${items.length} hồ sơ`, `${items.length} cases`)}>{items.length}</span>
              </header>
              <div className="case-board-cards">
                {items.map((item) => (
                  <Link className="case-board-card" to={`/cases/${item._id}`} key={item._id}>
                    <div className="case-board-card-meta">
                      <PriorityBadge priority={item.priority} />
                      <span className="case-board-code">{item.code}</span>
                    </div>
                    <strong>{item.title}</strong>
                    <StatusBadge status={item.status as CaseStatus} />
                    <footer>
                      <span><UserRound size={13} /> {item.assigneeName || item.requesterName}</span>
                      <span><CalendarClock size={13} /> {formatRelative(item.dueAt)}</span>
                    </footer>
                  </Link>
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
