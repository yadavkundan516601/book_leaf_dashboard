interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onChange }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="muted">
        {first}–{last} of {total}
      </span>
      {pages > 1 && (
        <span className="pagination__buttons">
          <button type="button" className="btn btn--sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
            Previous
          </button>
          <span className="muted">
            Page {page} of {pages}
          </span>
          <button type="button" className="btn btn--sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
            Next
          </button>
        </span>
      )}
    </nav>
  );
}
