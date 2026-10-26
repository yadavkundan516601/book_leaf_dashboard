import { FIRST_RESPONSE_SLA_HOURS, TICKET_STATUS_LABELS, type AdminTicketSummaryDto } from "@bookleaf/shared";
import { Link } from "react-router";
import { useAuth } from "../../../auth/AuthProvider";
import { CategoryChip, PriorityBadge, StatusBadge } from "../../../components/Badge";
import { Avatar, HelpTip } from "../../../components/ui";
import { formatAge, formatDateTime, formatRelative } from "../../../lib/format";
import { useUndoableTicketUpdate } from "../hooks";

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** Plain-language SLA explanation, with the target for this priority when it is known. */
export function slaHelp(priority: AdminTicketSummaryDto["classification"]["priority"]) {
  const target = priority ? ` For ${priority} tickets the target is ${FIRST_RESPONSE_SLA_HOURS[priority]}h.` : "";
  return `SLA: no admin reply within the first-response target.${target}`;
}

function AssignToMe({ ticket }: { ticket: AdminTicketSummaryDto }) {
  const { user } = useAuth();
  const { apply, isPending } = useUndoableTicketUpdate(ticket.id);
  if (!user || ticket.assignee?.id === user.id || ticket.status === "closed") return null;
  return (
    <button
      type="button"
      className="btn btn--sm"
      aria-busy={isPending}
      disabled={isPending}
      onClick={() =>
        void apply({
          input: { assigneeId: user.id },
          revert: { assigneeId: ticket.assignee?.id ?? null },
          success: `${ticket.reference} assigned to you.`,
        })
      }
    >
      <span>
        Assign to me<span className="ui-sr-only"> ({ticket.reference})</span>
      </span>
    </button>
  );
}

function Age({ ticket }: { ticket: AdminTicketSummaryDto }) {
  if (ticket.ageHours === null) {
    return <span className="aq-age aq-age--done">{TICKET_STATUS_LABELS[ticket.status]}</span>;
  }
  if (ticket.slaBreached) {
    return (
      <span className="aq-age aq-age--breached">
        <span className="aq-age__value">{formatAge(ticket.ageHours)}</span>
        <span className="aq-age__flag">
          SLA breached <HelpTip label="What does SLA breached mean?">{slaHelp(ticket.classification.priority)}</HelpTip>
        </span>
      </span>
    );
  }
  return (
    <span className="aq-age">
      <span className="aq-age__value">{formatAge(ticket.ageHours)}</span>
      <span className="aq-age__flag">{ticket.firstRespondedAt ? "team replied" : "awaiting reply"}</span>
    </span>
  );
}

/** One dense queue row: everything an agent scans for, plus the two actions they take most. */
export function QueueRow({ ticket }: { ticket: AdminTicketSummaryDto }) {
  const href = `/admin/tickets/${ticket.id}`;
  const { classification } = ticket;
  const priority = classification.priority;
  const edge = priority === "critical" || priority === "high" ? ` aq-row--${priority}` : "";
  return (
    <li className={`aq-row${edge}`}>
      <span className="aq-row__avatar">
        <Avatar name={ticket.author.name} size="sm" decorative />
      </span>
      <div className="aq-row__main">
        <Link to={href} className="aq-row__subject" title={ticket.subject}>
          {ticket.subject}
        </Link>
        <div className="aq-row__meta">
          <span className="aq-row__ref">{ticket.reference}</span>
          <span>{ticket.author.name}</span>
          {ticket.book && <span className="aq-row__book">{ticket.book.title}</span>}
        </div>
      </div>
      <div className="aq-row__tags">
        <CategoryChip classification={classification} />
        {classification.state === "pending" && !priority ? (
          <span className="small muted">Prioritising…</span>
        ) : (
          <PriorityBadge priority={priority} />
        )}
        <StatusBadge status={ticket.status} />
      </div>
      <div className="aq-row__assignee">
        {ticket.assignee ? (
          <>
            <Avatar name={ticket.assignee.name} size="sm" decorative />
            <span title={ticket.assignee.name}>
              <span className="ui-sr-only">Assigned to </span>
              {firstName(ticket.assignee.name)}
            </span>
          </>
        ) : (
          <span className="muted">Unassigned</span>
        )}
      </div>
      <div className="aq-row__age">
        <Age ticket={ticket} />
        <time className="aq-row__updated" dateTime={ticket.updatedAt} title={formatDateTime(ticket.updatedAt)}>
          updated {formatRelative(ticket.updatedAt)}
        </time>
      </div>
      <div className="aq-row__actions">
        <AssignToMe ticket={ticket} />
        <Link to={href} className="btn btn--sm btn--primary" aria-label={`Open ${ticket.reference}`}>
          Open
        </Link>
      </div>
    </li>
  );
}
