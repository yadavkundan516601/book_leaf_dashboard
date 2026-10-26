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
import { Link, useSearchParams } from "react-router";
import { useAdminTickets, useTeam, useUpdateTicket } from "../../api/hooks";
import { useAuth } from "../../auth/AuthProvider";
import { CategoryChip, PriorityBadge, StatusBadge } from "../../components/Badge";
import { EmptyState, ErrorState } from "../../components/EmptyState";
import { BookIcon, SparkIcon, TagIcon } from "../../components/icons";
import { CardBody, CardFacts, CardFigure, CardFoot, CardHead, CardStat, CardStats, CardTitle, Chip, Fact, ListCard } from "../../components/ListCard";
import { Pagination } from "../../components/Pagination";
import { Spinner } from "../../components/Spinner";
import { useToast } from "../../components/Toast";
import { errorMessage } from "../../api/client";
import { formatAge, formatDate, formatDateTime, formatRelative } from "../../lib/format";
import { hasCustomFilters, readFilters, toListQuery, writeFilters, type QueueFilters } from "./queueFilters";
import { StatsStrip } from "./StatsStrip";

const SORT_LABELS: Record<TicketSort, string> = {
  urgency: "Most urgent first",
  newest: "Newest first",
  oldest: "Oldest first",
  updated: "Recently updated",
};

const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

/** How long the ticket has waited: the number an ops lead scans for. */
function AgeFigure({ ticket }: { ticket: AdminTicketSummaryDto }) {
  if (ticket.ageHours === null) {
    return <CardFigure value={TICKET_STATUS_LABELS[ticket.status]} tone="muted" caption="No action needed" />;
  }
  const priority = ticket.classification.priority;
  const target = priority ? FIRST_RESPONSE_SLA_HOURS[priority] : null;
  if (ticket.slaBreached) {
    return <CardFigure value={formatAge(ticket.ageHours)} tone="danger" caption={`SLA breached${target ? ` · target ${target}h` : ""}`} />;
  }
  return <CardFigure value={formatAge(ticket.ageHours)} caption={ticket.firstRespondedAt ? "Open, team replied" : "Waiting for a reply"} />;
}

function AssignToMe({ ticket }: { ticket: AdminTicketSummaryDto }) {
  const { user } = useAuth();
  const toast = useToast();
  const update = useUpdateTicket(ticket.id);
  if (!user || ticket.assignee?.id === user.id || ticket.status === "closed") return null;
  return (
    <button
      type="button"
      className="link-action"
      disabled={update.isPending}
      onClick={() =>
        update.mutate(
          { assigneeId: user.id },
          { onSuccess: () => toast.success(`${ticket.reference} assigned to you.`), onError: (e) => toast.error(errorMessage(e)) },
        )
      }
    >
      {update.isPending ? "Assigning…" : "Assign to me"}
    </button>
  );
}

function QueueCard({ ticket }: { ticket: AdminTicketSummaryDto }) {
  const href = `/admin/tickets/${ticket.id}`;
  const { classification } = ticket;
  const priority = classification.priority;
  const accent = priority === "critical" ? "critical" : priority === "high" ? "high" : undefined;
  return (
    <ListCard accent={accent}>
      <CardHead
        aside={
          <time className="muted" dateTime={ticket.updatedAt} title={formatDateTime(ticket.updatedAt)}>
            Updated {formatRelative(ticket.updatedAt)}
          </time>
        }
      >
        <Link to={href} className="ref">
          {ticket.reference}
        </Link>
        {classification.state === "pending" && !priority ? <span className="muted small">Prioritising…</span> : <PriorityBadge priority={priority} />}
        <StatusBadge status={ticket.status} />
        {ticket.slaBreached && <span className="sla-flag">SLA</span>}
      </CardHead>
      <CardBody>
        <CardTitle
          title={
            <Link to={href} className="lcard__link">
              {ticket.subject}
            </Link>
          }
          sub={ticket.author.name}
        />
        <CardStats>
          <CardStat label="Assignee" value={ticket.assignee ? ticket.assignee.name : "Unassigned"} tone={ticket.assignee ? undefined : "muted"} />
          <CardStat label="Messages" value={ticket.messageCount} />
          <CardStat label="Opened" value={formatDate(ticket.createdAt)} />
        </CardStats>
        <AgeFigure ticket={ticket} />
      </CardBody>
      <CardFacts>
        <Fact icon={<TagIcon />} label="Category">
          <CategoryChip classification={classification} />
        </Fact>
        {ticket.book && (
          <Fact icon={<BookIcon />} label="Book">
            <Chip>{ticket.book.title}</Chip>
          </Fact>
        )}
        {classification.confidence !== null && classification.categorySource !== "admin" && (
          <Fact icon={<SparkIcon />} label="Confidence">
            <Chip>{Math.round(classification.confidence * 100)}%</Chip>
          </Fact>
        )}
      </CardFacts>
      <CardFoot
        links={<AssignToMe ticket={ticket} />}
        action={
          <Link to={href} className="btn btn--primary btn--sm">
            Open ticket
          </Link>
        }
      />
    </ListCard>
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
        <section className="stack" aria-label="Tickets">
          <div className="card-list">
            {data.data.map((t) => (
              <QueueCard key={t.id} ticket={t} />
            ))}
          </div>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={(page) => update({ page })} />
        </section>
      )}
    </div>
  );
}
