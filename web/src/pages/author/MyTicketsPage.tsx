import { TICKET_STATUSES, TICKET_STATUS_LABELS, type AuthorTicketSummaryDto, type TicketStatus } from "@bookleaf/shared";
import { Link, useSearchParams } from "react-router";
import { useAuthorTickets } from "../../api/hooks";
import { StatusBadge } from "../../components/Badge";
import { EmptyState, ErrorState } from "../../components/EmptyState";
import { BookIcon, ClipIcon } from "../../components/icons";
import { CardBody, CardFacts, CardFigure, CardFoot, CardHead, CardStat, CardStats, CardTitle, Chip, Fact, ListCard } from "../../components/ListCard";
import { Pagination } from "../../components/Pagination";
import { Spinner } from "../../components/Spinner";
import { formatDate, formatDateTime, formatRelative } from "../../lib/format";

const PAGE_SIZE = 20;
const TABS: { value: TicketStatus | null; label: string }[] = [
  { value: null, label: "All" },
  ...TICKET_STATUSES.map((s) => ({ value: s, label: TICKET_STATUS_LABELS[s] })),
];

/** The one-line answer to "what is happening with this query?". */
function StateFigure({ ticket }: { ticket: AuthorTicketSummaryDto }) {
  if (ticket.awaitingAuthor && (ticket.status === "open" || ticket.status === "in_progress")) {
    return <CardFigure value="New reply" tone="primary" caption="BookLeaf has responded" />;
  }
  switch (ticket.status) {
    case "open":
      return <CardFigure value="Received" caption="We'll reply soon" />;
    case "in_progress":
      return <CardFigure value="With our team" caption="Being looked into" />;
    case "resolved":
      return <CardFigure value="Resolved" tone="success" caption="Reply to reopen" />;
    case "closed":
      return <CardFigure value="Closed" tone="muted" caption="No further replies" />;
  }
}

function TicketCard({ ticket }: { ticket: AuthorTicketSummaryDto }) {
  const href = `/author/tickets/${ticket.id}`;
  const needsAttention = ticket.awaitingAuthor && (ticket.status === "open" || ticket.status === "in_progress");
  return (
    <ListCard accent={needsAttention ? "new" : undefined}>
      <CardHead
        aside={
          <time className="muted" dateTime={ticket.updatedAt} title={formatDateTime(ticket.updatedAt)}>
            Updated {formatRelative(ticket.updatedAt)}
          </time>
        }
      >
        <span className="ref">{ticket.reference}</span>
        <StatusBadge status={ticket.status} />
      </CardHead>
      <CardBody>
        <CardTitle
          title={
            <Link to={href} className="lcard__link">
              {ticket.subject}
            </Link>
          }
          sub={ticket.book ? undefined : "General / Account level"}
        />
        <CardStats>
          <CardStat label="Opened" value={formatDate(ticket.createdAt)} />
          <CardStat label="Messages" value={ticket.messageCount} />
        </CardStats>
        <StateFigure ticket={ticket} />
      </CardBody>
      {(ticket.book || ticket.attachments.length > 0) && (
        <CardFacts>
          {ticket.book && (
            <Fact icon={<BookIcon />} label="About">
              <Chip>{ticket.book.title}</Chip>
            </Fact>
          )}
          {ticket.attachments.length > 0 && (
            <Fact icon={<ClipIcon />} label="Attachments">
              {ticket.attachments.map((a) => (
                <Chip key={a.name}>{a.name}</Chip>
              ))}
            </Fact>
          )}
        </CardFacts>
      )}
      <CardFoot
        links={
          <Link to={href} className="link-action">
            View conversation
          </Link>
        }
        action={
          <Link to={href} className={needsAttention ? "btn btn--primary btn--sm" : "btn btn--sm"}>
            {needsAttention ? "Read reply" : "Open ticket"}
          </Link>
        }
      />
    </ListCard>
  );
}

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
          <div className="card-list">
            {data.data.map((t) => (
              <TicketCard key={t.id} ticket={t} />
            ))}
          </div>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={(p) => setFilter({ page: p })} />
        </>
      )}
    </div>
  );
}
