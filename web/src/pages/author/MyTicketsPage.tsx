import { TICKET_STATUSES, TICKET_STATUS_LABELS, type TicketStatus } from "@bookleaf/shared";
import { Link, useSearchParams } from "react-router";
import { useAuthorTickets } from "../../api/hooks";
import { StatusBadge } from "../../components/Badge";
import { EmptyState, ErrorState } from "../../components/EmptyState";
import { Pagination } from "../../components/Pagination";
import { Spinner } from "../../components/Spinner";
import { formatDateTime, formatRelative } from "../../lib/format";

const PAGE_SIZE = 20;
const TABS: { value: TicketStatus | null; label: string }[] = [
  { value: null, label: "All" },
  ...TICKET_STATUSES.map((s) => ({ value: s, label: TICKET_STATUS_LABELS[s] })),
];

const isStatus = (v: string | null): v is TicketStatus => TICKET_STATUSES.some((s) => s === v);

export function MyTicketsPage() {
  const [params, setParams] = useSearchParams();
  const rawStatus = params.get("status");
  const status = isStatus(rawStatus) ? rawStatus : null;
  const page = Math.max(1, Number(params.get("page")) || 1);

  const { data, isPending, error, refetch } = useAuthorTickets({
    status: status ?? undefined,
    sort: "updated",
    page,
    pageSize: PAGE_SIZE,
  });

  const setFilter = (next: { status?: TicketStatus | null; page?: number }) => {
    const p = new URLSearchParams();
    const s = next.status === undefined ? status : next.status;
    if (s) p.set("status", s);
    if (next.page && next.page > 1) p.set("page", String(next.page));
    setParams(p);
  };

  return (
    <div className="stack-lg">
      <div className="page-header">
        <h1>My Tickets</h1>
        <Link className="btn btn--primary" to="/author/tickets/new">
          New query
        </Link>
      </div>

      <div className="tabs" role="group" aria-label="Filter by status">
        {TABS.map((t) => (
          <button
            key={t.label}
            type="button"
            className="tab"
            aria-pressed={status === t.value}
            onClick={() => setFilter({ status: t.value, page: 1 })}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isPending ? (
        <Spinner label="Loading your tickets…" />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.data.length === 0 ? (
        status ? (
          <EmptyState title={`No ${TICKET_STATUS_LABELS[status].toLowerCase()} tickets`}>
            Try another tab to see the rest of your queries.
          </EmptyState>
        ) : (
          <EmptyState
            title="No queries yet"
            action={
              <Link className="btn btn--primary" to="/author/tickets/new">
                Ask a question
              </Link>
            }
          >
            Questions about royalties, ISBNs, printing or your book's progress? Send us a query and track the answer here.
          </EmptyState>
        )
      ) : (
        <>
          <ul className="ticket-list">
            {data.data.map((t) => (
              <li key={t.id}>
                <Link to={`/author/tickets/${t.id}`} className={`ticket-card card ${t.awaitingAuthor ? "ticket-card--new" : ""}`}>
                  <div className="ticket-card__top">
                    <span className="ref">{t.reference}</span>
                    <StatusBadge status={t.status} />
                    {t.awaitingAuthor && <span className="new-reply">New reply</span>}
                  </div>
                  <div className="ticket-card__subject">{t.subject}</div>
                  <div className="small muted">
                    {t.book ? t.book.title : "General / Account"} · {t.messageCount}{" "}
                    {t.messageCount === 1 ? "message" : "messages"} · updated{" "}
                    <time dateTime={t.updatedAt} title={formatDateTime(t.updatedAt)}>
                      {formatRelative(t.updatedAt)}
                    </time>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={(p) => setFilter({ page: p })} />
        </>
      )}
    </div>
  );
}
