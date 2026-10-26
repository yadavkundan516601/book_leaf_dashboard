import {
  FIRST_RESPONSE_SLA_HOURS,
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  type AdminTicketSummaryDto,
  type TicketCategory,
  type TicketSort,
} from "@bookleaf/shared";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useAdminTickets, useTeam } from "../../api/hooks";
import { useAuth } from "../../auth/AuthProvider";
import { CategoryChip, PriorityBadge, StatusBadge } from "../../components/Badge";
import { EmptyState, ErrorState } from "../../components/EmptyState";
import { Pagination } from "../../components/Pagination";
import { Spinner } from "../../components/Spinner";
import { formatAge, formatDateTime, formatRelative } from "../../lib/format";
import { hasCustomFilters, readFilters, toListQuery, writeFilters, type QueueFilters } from "./queueFilters";
import { StatsStrip } from "./StatsStrip";

const SORT_LABELS: Record<TicketSort, string> = {
  urgency: "Most urgent first",
  newest: "Newest first",
  oldest: "Oldest first",
  updated: "Recently updated",
};

const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

function AgeCell({ ticket }: { ticket: AdminTicketSummaryDto }) {
  if (ticket.ageHours === null) return <span className="muted">—</span>;
  const target = ticket.classification.priority ? FIRST_RESPONSE_SLA_HOURS[ticket.classification.priority] : null;
  return (
    <span
      className={ticket.slaBreached ? "age age--breached" : "age"}
      title={
        ticket.slaBreached
          ? `First-response SLA breached${target ? ` (target ${target}h)` : ""}`
          : `Opened ${formatDateTime(ticket.createdAt)}`
      }
    >
      {formatAge(ticket.ageHours)}
      {ticket.slaBreached && <span className="sla-flag">SLA</span>}
    </span>
  );
}

function TicketRow({ ticket }: { ticket: AdminTicketSummaryDto }) {
  const navigate = useNavigate();
  const href = `/admin/tickets/${ticket.id}`;
  const priority = ticket.classification.priority;
  return (
    <tr
      className={`clickable ${priority === "critical" ? "row--critical" : priority === "high" ? "row--high" : ""}`}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest("a")) void navigate(href);
      }}
    >
      <td className="nowrap">
        <Link to={href} className="ref">
          {ticket.reference}
        </Link>
      </td>
      <td className="cell-subject">
        <Link to={href} className="cell-subject__title">
          {ticket.subject}
        </Link>
        <div className="small muted">
          {ticket.author.name}
          {ticket.book && <> · {ticket.book.title}</>}
        </div>
      </td>
      <td>
        <CategoryChip classification={ticket.classification} />
      </td>
      <td>
        {ticket.classification.state === "pending" && !priority ? (
          <span className="muted small">…</span>
        ) : (
          <PriorityBadge priority={priority} />
        )}
      </td>
      <td>
        <StatusBadge status={ticket.status} />
      </td>
      <td className="nowrap">{ticket.assignee ? ticket.assignee.name : <span className="muted">Unassigned</span>}</td>
      <td className="nowrap">
        <AgeCell ticket={ticket} />
      </td>
      <td className="nowrap small muted">
        <time dateTime={ticket.updatedAt} title={formatDateTime(ticket.updatedAt)}>
          {formatRelative(ticket.updatedAt)}
        </time>
      </td>
    </tr>
  );
}

export function QueuePage() {
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const { user } = useAuth();
  const team = useTeam();
  const { data, isPending, isFetching, error, refetch } = useAdminTickets(toListQuery(filters));

  // Functional form so a delayed update (search debounce) never overwrites a newer filter change.
  const update = (patch: Partial<QueueFilters>, opts?: { replace?: boolean }) =>
    setParams((prev) => writeFilters({ ...readFilters(prev), page: 1, ...patch }), opts);

  // Search is typed locally and pushed to the URL after a pause; back/forward navigation syncs it back.
  const [search, setSearch] = useState(filters.q);
  useEffect(() => setSearch((s) => (s.trim() === filters.q ? s : filters.q)), [filters.q]);
  useEffect(() => {
    if (search.trim() === filters.q) return;
    const timer = setTimeout(() => update({ q: search }, { replace: true }), 350);
    return () => clearTimeout(timer);
  }, [search]); // only the typed text restarts the debounce

  return (
    <div className="stack-lg">
      <div className="page-header">
        <h1>Ticket Queue</h1>
        {isFetching && !isPending && <span className="small muted">Refreshing…</span>}
      </div>

      <StatsStrip
        onShowStatus={(s) => update({ statuses: [s] })}
        onShowUrgent={() => update({ priorities: ["critical", "high"] })}
        onShowUnassigned={() => update({ assignee: "unassigned" })}
      />

      <section className="card filters" aria-label="Filters">
        <div className="filters__row">
          <div className="field field--grow">
            <label htmlFor="q">Search</label>
            <input
              id="q"
              type="search"
              placeholder="Reference, subject, author or book"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="sort">Sort</label>
            <select id="sort" value={filters.sort} onChange={(e) => update({ sort: e.target.value as TicketSort })}>
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="filters__row">
          <fieldset className="toggle-group">
            <legend>Status</legend>
            {TICKET_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                className="toggle"
                aria-pressed={filters.statuses.includes(s)}
                onClick={() => update({ statuses: toggle(filters.statuses, s) })}
              >
                {TICKET_STATUS_LABELS[s]}
              </button>
            ))}
          </fieldset>
          <fieldset className="toggle-group">
            <legend>Priority</legend>
            {TICKET_PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                className={`toggle toggle--${p}`}
                aria-pressed={filters.priorities.includes(p)}
                onClick={() => update({ priorities: toggle(filters.priorities, p) })}
              >
                {TICKET_PRIORITY_LABELS[p]}
              </button>
            ))}
          </fieldset>
        </div>

        <div className="filters__row">
          <div className="field">
            <label htmlFor="category">Category</label>
            <select
              id="category"
              value={filters.category ?? ""}
              onChange={(e) => update({ category: (e.target.value || null) as TicketCategory | null })}
            >
              <option value="">All categories</option>
              {TICKET_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {TICKET_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="assignee">Assignee</label>
            <select id="assignee" value={filters.assignee ?? ""} onChange={(e) => update({ assignee: e.target.value || null })}>
              <option value="">Anyone</option>
              <option value="me">Assigned to me</option>
              <option value="unassigned">Unassigned</option>
              {team.data
                ?.filter((m) => m.id !== user?.id)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="from">Created from</label>
            <input id="from" type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => update({ from: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="to">Created to</label>
            <input id="to" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => update({ to: e.target.value })} />
          </div>
          {hasCustomFilters(params) && (
            <button type="button" className="btn btn--ghost btn--sm filters__reset" onClick={() => setParams({})}>
              Reset filters
            </button>
          )}
        </div>
      </section>

      {isPending ? (
        <Spinner label="Loading tickets…" />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.data.length === 0 ? (
        <EmptyState
          title={hasCustomFilters(params) || filters.q ? "No tickets match these filters" : "The queue is clear"}
          action={
            hasCustomFilters(params) ? (
              <button type="button" className="btn" onClick={() => setParams({})}>
                Reset filters
              </button>
            ) : undefined
          }
        >
          {hasCustomFilters(params) ? "Try widening the status or date range." : "No open or in-progress tickets right now."}
        </EmptyState>
      ) : (
        <section className="card card--flush">
          <div className="table-scroll">
            <table className="table queue-table">
              <thead>
                <tr>
                  <th scope="col">Ref</th>
                  <th scope="col">Subject</th>
                  <th scope="col">Category</th>
                  <th scope="col">Priority</th>
                  <th scope="col">Status</th>
                  <th scope="col">Assignee</th>
                  <th scope="col">Age</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((t) => (
                  <TicketRow key={t.id} ticket={t} />
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={(page) => update({ page })} />
        </section>
      )}
    </div>
  );
}
