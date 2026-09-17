import { useEffect, useMemo, useState } from "react";
import { Filter, Plus, Search } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth";
import {
  EmptyState,
  ErrorState,
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

const statusTabs: Array<{ value: string; vi: string; en: string }> = [
  { value: "all", vi: "Tất cả", en: "All" },
  { value: "new", vi: "Mới", en: "New" },
  { value: "triaged", vi: "Đã phân loại", en: "Triaged" },
  { value: "in_progress", vi: "Đang xử lý", en: "In progress" },
  { value: "waiting", vi: "Đang chờ", en: "Waiting" },
  { value: "resolved", vi: "Đã giải quyết", en: "Resolved" },
  { value: "closed", vi: "Đã đóng", en: "Closed" }
];

export function CasesPage() {
  const { user } = useAuth();
  const { text } = useLocale();
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get("status") || "all";
  const priority = searchParams.get("priority") || "all";
  const search = searchParams.get("search") || "";
  const page = searchParams.get("page") || "1";
  const queue = user?.role === "requester" ? "all" : searchParams.get("queue") || "all";
  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => setSearchInput(search), [search]);
  const path = useMemo(() => {
    const params = new URLSearchParams();
    params.set("status", status);
    params.set("priority", priority);
    params.set("page", page);
    params.set("queue", queue);
    if (search) params.set("search", search);
    if (user?.role === "requester") params.set("mine", "true");
    return `/cases?${params.toString()}`;
  }, [status, priority, search, page, queue, user?.role]);
  const { data, loading, error, reload } = useApiData<{ cases: CaseRecord[]; page: number; total: number; limit: number; totalPages: number }>(path);

  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value && value !== "all") next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setSearchParams(next);
  }

  return (
    <div className="page-stack">
      <PageHeader
        title={user?.role === "requester" ? text("Yêu cầu của tôi", "My requests") : text("Hàng đợi hồ sơ", "Case queue")}
        description={
          user?.role === "requester"
            ? text("Theo dõi tiến độ và phản hồi từ đơn vị xử lý.", "Follow progress and responses from the service team.")
            : text("Tiếp nhận, ưu tiên và điều phối công việc theo SLA.", "Review, prioritize and route work against SLA commitments.")
        }
        actions={
          <Link to="/cases/new" className="button button-primary">
            <Plus size={17} />
            {text("Tạo yêu cầu", "New request")}
          </Link>
        }
      />

      <section className="filter-panel">
        <div className="filter-row">
          {user?.role !== "requester" ? <label className="compact-select">
            <select aria-label={text("Hàng đợi công việc", "Work queue")} value={queue} onChange={(event) => updateFilter("queue", event.target.value)}>
              <option value="all">{text("Tất cả công việc", "All work")}</option>
              <option value="unassigned">{text("Chưa phân công", "Unassigned")}</option>
              <option value="assigned">{text("Giao cho tôi", "Assigned to me")}</option>
              <option value="overdue">{text("Quá hạn", "Overdue")}</option>
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
            <Filter size={16} />
            <select aria-label={text("Lọc ưu tiên", "Filter priority")} value={priority} onChange={(event) => updateFilter("priority", event.target.value)}>
              <option value="all">{text("Mọi mức ưu tiên", "Any priority")}</option>
              <option value="urgent">{text("Khẩn cấp", "Urgent")}</option>
              <option value="high">{text("Cao", "High")}</option>
              <option value="normal">{text("Bình thường", "Normal")}</option>
              <option value="low">{text("Thấp", "Low")}</option>
            </select>
          </label>
        </div>
        <div className="status-tabs" role="tablist" aria-label={text("Lọc theo trạng thái", "Filter by status")}>
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              className={status === tab.value ? "active" : ""}
              onClick={() => updateFilter("status", tab.value)}
              role="tab"
              aria-selected={status === tab.value}
            >
              {text(tab.vi, tab.en)}
            </button>
          ))}
        </div>
      </section>

      {loading ? <LoadingState label={text("Đang tải hàng đợi hồ sơ", "Loading case queue")} /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {!loading && !error && data ? (
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
                    <th>{text("Người yêu cầu", "Requester")}</th>
                    <th>{text("Trạng thái", "Status")}</th>
                    <th>{text("Ưu tiên", "Priority")}</th>
                    <th>{text("Cập nhật", "Updated")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cases.map((item) => (
                    <tr key={item._id}>
                      <td>
                        <Link to={`/cases/${item._id}`} className="case-link">{item.code}</Link>
                      </td>
                      <td>
                        <Link to={`/cases/${item._id}`} className="case-title-cell">
                          <strong>{item.title}</strong>
                          <small>{item.category}</small>
                        </Link>
                      </td>
                      <td>{item.requesterName}</td>
                      <td>
                        <StatusBadge status={item.status as CaseStatus} />
                      </td>
                      <td>
                        <PriorityBadge priority={item.priority} />
                      </td>
                      <td>{formatRelative(item.updatedAt)}</td>
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
