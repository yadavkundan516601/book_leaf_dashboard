import { TICKET_STATUSES, TICKET_STATUS_LABELS, type AuthorTicketSummaryDto, type TicketStatus } from "@bookleaf/shared";
import { useId, useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { useAuthorTickets } from "../../api/hooks";
import { SearchIcon } from "../../components/icons";
import { PageHeader, TabPanel, Tabs, type TabItem } from "../../components/ui";
import "../../styles/author-tickets.css";
import { useDocumentTitle } from "./tickets/hooks";
import { EmptyCard, LoadError } from "./tickets/LoadError";
import { hasNewReply, STATUS_MEANING } from "./tickets/status";
import { TicketCard, TicketCardSkeletons } from "./tickets/TicketCard";

/** Authors have few tickets, so the list is fetched once and filtered/sorted in the browser. */
const FETCH_LIMIT = 100;
const TABS_ID = "my-tickets-status";

type TabId = "all" | TicketStatus;
type SortId = "updated" | "oldest";

const isTab = (v: string | null): v is TabId => v === "all" || TICKET_STATUSES.some((s) => s === v);
const NEW_QUERY = "/author/tickets/new";

function matches(t: AuthorTicketSummaryDto, needle: string) {
  if (!needle) return true;
  return [t.subject, t.reference, t.book?.title ?? "General / Account level"].some((v) => v.toLowerCase().includes(needle));
}

export function MyTicketsPage() {
  useDocumentTitle("My tickets");
  const searchId = useId();
  const sortId = useId();
  const [params, setParams] = useSearchParams();
  const rawTab = params.get("status");
  const tab: TabId = isTab(rawTab) ? rawTab : "all";
  const query = params.get("q") ?? "";
  const sort: SortId = params.get("sort") === "oldest" ? "oldest" : "updated";

  const { data, isPending, error, refetch, isRefetching } = useAuthorTickets({ pageSize: FETCH_LIMIT, sort: "updated" });

  const update = (next: Partial<{ status: TabId; q: string; sort: SortId }>) => {
    const p = new URLSearchParams(params);
    const set = (key: string, value: string | undefined, fallback: string) => {
      if (value === undefined) return;
      if (value && value !== fallback) p.set(key, value);
      else p.delete(key);
    };
    set("status", next.status, "all");
    set("q", next.q, "");
    set("sort", next.sort, "updated");
    setParams(p, { replace: true });
  };

  const tickets = useMemo(() => data?.data ?? [], [data]);
  const counts = useMemo(() => {
    const c: Record<TabId, number> = { all: tickets.length, open: 0, in_progress: 0, resolved: 0, closed: 0 };
    for (const t of tickets) c[t.status] += 1;
    return c;
  }, [tickets]);

  const needle = query.trim().toLowerCase();
  const visible = useMemo(() => {
    const list = tickets.filter((t) => (tab === "all" || t.status === tab) && matches(t, needle));
    if (sort === "oldest") return [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [tickets, tab, needle, sort]);

  const newReplies = tickets.filter(hasNewReply).length;
  const tabs: TabItem<TabId>[] = [
    { id: "all", label: "All", badge: data ? counts.all : undefined },
    ...TICKET_STATUSES.map((s) => ({ id: s, label: TICKET_STATUS_LABELS[s], badge: data ? counts[s] : undefined })),
  ];

  const newQueryButton = (label = "New query") => (
    <Link className="btn btn--primary" to={NEW_QUERY}>
      {label}
    </Link>
  );

  let body;
  if (isPending) {
    body = <TicketCardSkeletons />;
  } else if (error) {
    body = (
      <LoadError title="We couldn't load your queries" error={error} onRetry={() => void refetch()} retrying={isRefetching} />
    );
  } else if (tickets.length === 0) {
    body = (
      <EmptyCard title="No queries yet" actions={newQueryButton("Ask your first question")}>
        Questions about royalties, ISBNs, printing or your book's progress? Send us a query and follow the answer here.
      </EmptyCard>
    );
  } else if (visible.length === 0 && needle) {
    body = (
      <EmptyCard
        title={`Nothing matches “${query.trim()}”`}
        actions={
          <>
            <button type="button" className="btn" onClick={() => update({ q: "" })}>
              Clear search
            </button>
            {newQueryButton()}
          </>
        }
      >
        We searched subjects, references (like BL-12) and book titles
        {tab === "all" ? "" : ` in ${TICKET_STATUS_LABELS[tab].toLowerCase()} queries`}.
      </EmptyCard>
    );
  } else if (visible.length === 0 && tab !== "all") {
    body = (
      <EmptyCard
        title={`No ${TICKET_STATUS_LABELS[tab].toLowerCase()} queries`}
        actions={
          <>
            <button type="button" className="btn" onClick={() => update({ status: "all" })}>
              Show all queries
            </button>
            {newQueryButton()}
          </>
        }
      >
        {STATUS_MEANING[tab].long}
      </EmptyCard>
    );
  } else {
    body = (
      <div className="card-list">
        {visible.map((t) => (
          <TicketCard key={t.id} ticket={t} />
        ))}
      </div>
    );
  }

  return (
    <div className="at-page">
      <PageHeader
        breadcrumbs={[{ label: "Dashboard", to: "/author/overview" }, { label: "My tickets" }]}
        title="My tickets"
        subtitle={
          newReplies > 0
            ? `${newReplies} ${newReplies === 1 ? "query has" : "queries have"} a new reply from BookLeaf Support.`
            : "Every question you've sent us, and where each one stands."
        }
        actions={newQueryButton()}
      />

      <div className="at-toolbar">
        <Tabs id={TABS_ID} label="Filter by status" tabs={tabs} value={tab} onChange={(status) => update({ status })} />
        <div className="at-toolbar__controls">
          <div className="at-search">
            <label htmlFor={searchId} className="ui-sr-only">
              Search your queries
            </label>
            <span className="at-search__icon" aria-hidden="true">
              <SearchIcon />
            </span>
            <input
              id={searchId}
              type="search"
              value={query}
              placeholder="Search subject, BL-number or book"
              onChange={(e) => update({ q: e.target.value })}
            />
          </div>
          <div className="at-sort">
            <label htmlFor={sortId}>Sort</label>
            <select id={sortId} value={sort} onChange={(e) => update({ sort: e.target.value === "oldest" ? "oldest" : "updated" })}>
              <option value="updated">Recently updated</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>
        </div>
      </div>

      {data && data.total > FETCH_LIMIT && (
        <p className="at-note" role="note">
          Showing your {FETCH_LIMIT} most recent queries.
        </p>
      )}

      <TabPanel tabsId={TABS_ID} value={tab}>
        {needle && visible.length > 0 && (
          <p className="at-results" aria-live="polite">
            {visible.length} {visible.length === 1 ? "query matches" : "queries match"} “{query.trim()}”
          </p>
        )}
        {body}
      </TabPanel>
    </div>
  );
}
