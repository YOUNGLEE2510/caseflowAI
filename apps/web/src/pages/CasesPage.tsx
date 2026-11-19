import { useEffect, useMemo, useState } from "react";
import { Columns3, Filter, List, Plus, Search, X } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth";
import {
  EmptyState,
  ErrorState,
  formatDate,
  formatRelative,
  LoadingState,
  PageHeader,
  Pagination,
  PriorityBadge,
  StatusBadge
} from "../components/ui";
import { useApiData } from "../hooks/useApiData";
import { useLocale } from "../i18n";
import type { CaseRecord, CaseStatus } from "../types";
import { CaseKanbanBoard } from "../components/CaseKanbanBoard";
import { categoryLabels } from "../utils/labels";

const statusTabs: Array<{ value: string; vi: string; en: string }> = [
  { value: "all", vi: "Tất cả", en: "All" },
  { value: "open", vi: "Đang mở", en: "Open" },
  { value: "new", vi: "Mới", en: "New" },
  { value: "triaged", vi: "Đã phân loại", en: "Triaged" },
  { value: "in_progress", vi: "Đang xử lý", en: "In progress" },
  { value: "waiting", vi: "Đang chờ", en: "Waiting" },
  { value: "resolved", vi: "Đã giải quyết", en: "Resolved" },
  { value: "closed", vi: "Đã đóng", en: "Closed" }
];

const queueLabels: Record<string, { vi: string; en: string }> = {
  unassigned: { vi: "Chưa phân công", en: "Unassigned" },
  assigned: { vi: "Giao cho tôi", en: "Assigned to me" },
  overdue: { vi: "Quá hạn", en: "Overdue" },
  at_risk: { vi: "Nguy cơ trễ SLA", en: "At SLA risk" },
  due_soon: { vi: "Đến hạn trong 24 giờ", en: "Due within 24 hours" }
};

export function CasesPage() {
  const { user } = useAuth();
  const { locale, text } = useLocale();
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get("status") || "all";
  const priority = user?.role === "requester" ? "all" : searchParams.get("priority") || "all";
  const search = searchParams.get("search") || "";
  const page = searchParams.get("page") || "1";
  const queue = user?.role === "requester" ? "all" : searchParams.get("queue") || "all";
  const propertyCode = searchParams.get("propertyCode") || "";
  const unitCode = propertyCode ? searchParams.get("unitCode") || "" : "";
  const canUseBoard = user?.role !== "requester";
  const [viewMode, setViewMode] = useState<"table" | "board">("table");
  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => setSearchInput(search), [search]);
  const path = useMemo(() => {
    const params = new URLSearchParams();
    params.set("status", status);
    params.set("priority", priority);
    params.set("page", page);
    params.set("queue", queue);
    params.set("limit", viewMode === "board" ? "50" : "8");
    if (viewMode === "board") params.set("includeCounts", "true");
    if (search) params.set("search", search);
    if (propertyCode) params.set("propertyCode", propertyCode);
    if (unitCode) params.set("unitCode", unitCode);
    if (user?.role === "requester") params.set("mine", "true");
    return `/cases?${params.toString()}`;
  }, [status, priority, search, page, queue, propertyCode, unitCode, user?.role, viewMode]);

  function setCaseView(nextMode: "table" | "board") {
    setViewMode(nextMode);
    const next = new URLSearchParams(searchParams);
    next.delete("page");
    setSearchParams(next);
  }
  const { data, loading, error, reload } = useApiData<{ cases: CaseRecord[]; page: number; total: number; limit: number; totalPages: number; statusCounts?: Record<string, number> }>(path);

  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value && value !== "all") next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setSearchParams(next);
  }

  function clearFilters() {
    const next = new URLSearchParams(searchParams);
    ["status", "priority", "search", "queue", "page", "propertyCode", "unitCode"].forEach((key) => next.delete(key));
    setSearchInput("");
    setSearchParams(next);
  }

  const activeFilters = [
    status !== "all" ? { key: "status", label: statusTabs.find((item) => item.value === status)?.[locale === "vi" ? "vi" : "en"] || status } : null,
    priority !== "all" ? { key: "priority", label: text(`Ưu tiên: ${priority}`, `Priority: ${priority}`) } : null,
    search ? { key: "search", label: text(`Tìm: ${search}`, `Search: ${search}`) } : null,
    propertyCode ? { key: unitCode ? "unitCode" : "propertyCode", label: unitCode ? text(`Căn ${unitCode} · ${propertyCode}`, `Unit ${unitCode} · ${propertyCode}`) : text(`Cơ sở ${propertyCode}`, `Property ${propertyCode}`) } : null,
    queue !== "all" && queueLabels[queue] ? { key: "queue", label: text(queueLabels[queue].vi, queueLabels[queue].en) } : null
  ].filter((filter): filter is { key: string; label: string } => Boolean(filter));

  return (
    <div className="page-stack">
      <PageHeader
        title={user?.role === "requester" ? text("Yêu cầu của tôi", "My requests") : text("Hàng đợi hồ sơ", "Case queue")}
        description={
          user?.role === "requester"
            ? text("Theo dõi tiến độ và phản hồi từ đơn vị xử lý.", "Follow progress and responses from the service team.")
            : text("Tiếp nhận, ưu tiên và điều phối công việc theo SLA.", "Review, prioritize and route work against SLA commitments.")
        }
        actions={<div className="page-actions case-page-actions">
          {canUseBoard ? <div className="view-switcher" role="group" aria-label={text("Chế độ xem hồ sơ", "Case view mode")}>
            <button
              className={`icon-button ${viewMode === "table" ? "active" : ""}`}
              type="button"
              onClick={() => setCaseView("table")}
              title={text("Dạng bảng", "Table view")}
              aria-label={text("Dạng bảng", "Table view")}
              aria-pressed={viewMode === "table"}
            ><List size={17} /></button>
            <button
              className={`icon-button ${viewMode === "board" ? "active" : ""}`}
              type="button"
              onClick={() => setCaseView("board")}
              title={text("Dạng Kanban", "Kanban view")}
              aria-label={text("Dạng Kanban", "Kanban view")}
              aria-pressed={viewMode === "board"}
            ><Columns3 size={17} /></button>
          </div> : null}
          <Link to="/cases/new" className="button button-primary">
            <Plus size={17} />
            {text("Tạo yêu cầu", "New request")}
          </Link>
        </div>}
      />

      <section className="filter-panel">
        <div className="filter-row">
          {user?.role !== "requester" ? <label className="compact-select">
            <select aria-label={text("Hàng đợi công việc", "Work queue")} value={queue} onChange={(event) => updateFilter("queue", event.target.value)}>
              <option value="all">{text("Tất cả công việc", "All work")}</option>
              <option value="unassigned">{text("Chưa phân công", "Unassigned")}</option>
              <option value="assigned">{text("Giao cho tôi", "Assigned to me")}</option>
              <option value="overdue">{text("Quá hạn", "Overdue")}</option>
              <option value="at_risk">{text("Nguy cơ trễ SLA", "At SLA risk")}</option>
              <option value="due_soon">{text("Đến hạn trong 24 giờ", "Due within 24 hours")}</option>
            </select>
          </label> : null}
          <form
            className="search-box"
            onSubmit={(event) => {
              event.preventDefault();
              updateFilter("search", searchInput.trim());
            }}
          >
            <Search size={17} />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={text("Tìm mã, nội dung hoặc người gửi", "Search ID, subject or requester")}
              aria-label={text("Tìm kiếm hồ sơ", "Search cases")}
            />
          </form>
          <label className="compact-select">
            <select aria-label={text("Lọc trạng thái", "Filter status")} value={status} onChange={event => updateFilter("status", event.target.value)}>
              {statusTabs.map(tab => <option key={tab.value} value={tab.value}>{text(tab.vi, tab.en)}</option>)}
            </select>
          </label>
          {canUseBoard ? <label className="compact-select">
            <Filter size={16} />
            <select aria-label={text("Lọc ưu tiên", "Filter priority")} value={priority} onChange={(event) => updateFilter("priority", event.target.value)}>
              <option value="all">{text("Mọi mức ưu tiên", "Any priority")}</option>
              <option value="urgent">{text("Khẩn cấp", "Urgent")}</option>
              <option value="high">{text("Cao", "High")}</option>
              <option value="normal">{text("Bình thường", "Normal")}</option>
              <option value="low">{text("Thấp", "Low")}</option>
            </select>
          </label> : null}
          {unitCode ? <span className="location-filter-chip">{text(`Căn ${unitCode} · ${propertyCode}`, `Unit ${unitCode} · ${propertyCode}`)}
            <button type="button" aria-label={text("Bỏ lọc theo căn", "Remove unit filter")} onClick={() => { const next = new URLSearchParams(searchParams); ["propertyCode", "unitCode", "page"].forEach(key => next.delete(key)); setSearchParams(next); }}><X size={14} /></button></span> : null}
          {activeFilters.length ? <button type="button" className="clear-filter-button" onClick={clearFilters}>{text("Xóa bộ lọc", "Clear filters")}</button> : null}
        </div>
      </section>

      {loading ? <LoadingState label={text("Đang tải hàng đợi hồ sơ", "Loading case queue")} /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {!loading && !error && data && viewMode === "board" ? (
        data.cases.length ? <CaseKanbanBoard cases={data.cases} counts={data.statusCounts} onChanged={reload} /> : (
          <EmptyState title={text("Không có hồ sơ phù hợp", "No matching cases")} detail={text("Thay đổi bộ lọc để xem hàng đợi khác.", "Adjust the filters to view another queue.")} />
        )
      ) : null}
      {!loading && !error && data && viewMode === "board" ? <Pagination page={data.page} totalPages={data.totalPages} total={data.total} limit={data.limit} onPageChange={next => updateFilter("page", String(next))} /> : null}
      {!loading && !error && data && viewMode === "table" ? (
        <section className="panel table-panel">
          <div className="table-summary">
            <strong>{text(`${data.total} hồ sơ`, `${data.total} cases`)}</strong>
            <span>{queue === "all" ? text("Cập nhật gần nhất", "Latest update") : text("Hạn xử lý gần nhất", "Earliest deadline")}</span>
          </div>
          {data.cases.length ? (
            <div className="table-scroll">
              <table className="data-table cases-table">
                <thead>
                  <tr>
                    <th>{text("Mã hồ sơ", "Case ID")}</th>
                    <th>{text("Tiêu đề", "Subject")}</th>
                    {canUseBoard ? <th>{text("Người yêu cầu", "Requester")}</th> : null}
                    <th>{text("Trạng thái", "Status")}</th>
                    <th className={canUseBoard ? "" : "cell-mobile-only"}>{text("Ưu tiên · Hạn", "Priority · Due")}</th>
                    <th>{text("Cập nhật", "Updated")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cases.map((item) => (
                    <tr key={item._id}>
                      <td className="cell-code">
                        <Link to={`/cases/${item._id}`} className="case-link">{item.code}</Link>
                      </td>
                      <td className="cell-title">
                        <Link to={`/cases/${item._id}`} className="case-title-cell">
                          <strong title={item.title}>{item.title}</strong>
                          {["manager", "org_admin", "platform_admin"].includes(user?.role || "") && item.ai.sharedIncidentCandidate && !["closed", "resolved"].includes(item.status) ?
                            <span>{text("Có phản ánh liên quan — kiểm tra sự cố chung", "Related requests — review shared incident")}</span> : null}
                          {canUseBoard && item.intakeVerification?.status === "pending" ?
                            <span className="intake-flag">{text("Gửi qua QR — chờ xác minh", "QR submission — needs verification")}</span> : null}
                          <small>{categoryLabels[item.category]?.[locale] || item.category}</small>
                        </Link>
                      </td>
                      {canUseBoard ? <td className="cell-requester">{item.requesterName}</td> : null}
                      <td className="cell-status">
                        <StatusBadge status={item.status as CaseStatus} />
                      </td>
                      <td className={`cell-priority ${canUseBoard ? "" : "cell-mobile-only"}`}>
                        <PriorityBadge priority={item.priority} />
                        {item.dueAt && !["resolved", "closed"].includes(item.status) ? <span className={`case-due ${new Date(item.dueAt).getTime() < Date.now() ? "case-due-overdue" : ""}`}>
                          {text("Hạn", "Due")} {formatDate(item.dueAt)}</span> : null}
                      </td>
                      <td className="cell-updated">{formatRelative(item.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title={text("Không có hồ sơ phù hợp", "No matching cases")} detail={text("Thay đổi bộ lọc hoặc tạo một yêu cầu mới.", "Adjust the filters or create a new request.")} />
          )}
          <Pagination page={data.page} totalPages={data.totalPages} total={data.total} limit={data.limit} onPageChange={(next) => updateFilter("page", String(next))} />
        </section>
      ) : null}
    </div>
  );
}
