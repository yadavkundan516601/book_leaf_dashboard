import type { AdminTicketSummaryDto } from "@bookleaf/shared";
import { Link } from "react-router";
import { useAdminTickets, type TicketListParams } from "../../../api/hooks";
import { CategoryChip, PriorityBadge, StatusBadge } from "../../../components/Badge";
import { Avatar, HelpTip, Pill, SkeletonRows } from "../../../components/ui";
import { formatDate, formatRelative } from "../../../lib/format";
import { CardError, DashCard } from "./DashCard";

const ACTIVE_QUERY: TicketListParams = { status: ["open", "in_progress"], sort: "urgency", pageSize: 6 };

function TicketRow({ ticket }: { ticket: AdminTicketSummaryDto }) {
  return (
    <li className="ad-ticket">
      <div className="ad-ticket__main">
        <Avatar name={ticket.author.name} size="sm" decorative />
        <div className="ad-ticket__text">
          {/* The subject link stretches over the whole row (see .ad-ticket__link::after). */}
          <Link to={`/admin/tickets/${ticket.id}`} className="ad-ticket__link" title={ticket.subject}>
            {ticket.subject}
          </Link>
          <span className="ad-ticket__sub">
            {ticket.reference} · {ticket.author.name} · opened {formatRelative(ticket.createdAt)}
          </span>
        </div>
      </div>
      <div className="ad-ticket__cell ad-ticket__status">
        <span className="ui-sr-only">Status: </span>
        <StatusBadge status={ticket.status} />
        {ticket.slaBreached && (
          <span className="ad-ticket__sla">
            <Pill tone="danger" title="Service level agreement breached">
              SLA
            </Pill>
            <HelpTip label="What does the SLA flag mean?">
              No admin reply within the first-response target for this priority.
            </HelpTip>
          </span>
        )}
      </div>
      <div className="ad-ticket__cell ad-ticket__assignee">
        <span className="ui-sr-only">Assignee: </span>
        {ticket.assignee ? (
          <>
            <Avatar name={ticket.assignee.name} size="sm" decorative />
            <span className="ad-ticket__name">{ticket.assignee.name}</span>
          </>
        ) : (
          <span className="ad-muted">Not assigned yet</span>
        )}
      </div>
      <div className="ad-ticket__cell ad-ticket__category">
        <span className="ui-sr-only">Category: </span>
        <CategoryChip classification={ticket.classification} />
      </div>
      <div className="ad-ticket__cell ad-ticket__priority">
        <span className="ui-sr-only">Priority: </span>
        <PriorityBadge priority={ticket.classification.priority} />
      </div>
      <div className="ad-ticket__cell ad-ticket__date ad-muted">
        <span className="ui-sr-only">Created: </span>
        <time dateTime={ticket.createdAt}>{formatDate(ticket.createdAt)}</time>
      </div>
    </li>
  );
}

/** The six most urgent unresolved tickets, each linking to its detail page. */
export function ActiveTickets() {
  const { data, isPending, isError, refetch } = useAdminTickets(ACTIVE_QUERY);

  let body;
  if (isPending) {
    body = <SkeletonRows rows={6} label="Loading active tickets…" />;
  } else if (isError || !data) {
    body = <CardError what="the active tickets" onRetry={() => void refetch()} />;
  } else if (data.data.length === 0) {
    body = (
      <div className="ad-empty">
        <p className="ad-empty__title">The queue is clear</p>
        <p className="ad-muted">There are no open or in-progress tickets right now. New questions from authors will show up here.</p>
        <Link to="/admin/tickets?status=all" className="btn btn--sm">
          Browse all tickets
        </Link>
      </div>
    );
  } else {
    body = (
      <div className="ad-tickets">
        <div className="ad-tickets__head" aria-hidden="true">
          <span>Ticket</span>
          <span>Status</span>
          <span>Assignee</span>
          <span>Category</span>
          <span>Priority</span>
          <span>Created</span>
        </div>
        <ul className="ad-tickets__list">
          {data.data.map((t) => (
            <TicketRow key={t.id} ticket={t} />
          ))}
        </ul>
      </div>
    );
  }

  return (
    <DashCard
      title="All active tickets"
      subtitle={
        data && data.total > 0
          ? `Most urgent first · showing ${Math.min(data.data.length, data.total)} of ${data.total.toLocaleString("en-IN")}`
          : "Most urgent unresolved tickets first"
      }
      span="ad-span-8"
      actions={
        <Link to="/admin/tickets" className="btn btn--sm">
          View all
        </Link>
      }
    >
      {body}
    </DashCard>
  );
}
