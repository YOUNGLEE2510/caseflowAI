import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale } from "../../i18n";

export function PageHeader({
  title,
  description,
  actions
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  limit,
  onPageChange
}: {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
}) {
  const { text } = useLocale();
  const from = total ? Math.min((page - 1) * limit + 1, total) : 0;
  const to = Math.min(page * limit, total);

  return (
    <div className="pagination">
      <span className="pagination-info">
        {from}-{to} {text("trong", "of")} {total}
      </span>
      <div className="pagination-controls">
        <button
          className="icon-button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label={text("Trang trước", "Previous page")}
        >
          <ChevronLeft size={18} />
        </button>
        <span className="pagination-current">{page}</span>
        <button
          className="icon-button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label={text("Trang sau", "Next page")}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
