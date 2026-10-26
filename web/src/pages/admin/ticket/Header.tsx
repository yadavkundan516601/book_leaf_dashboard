import { TICKET_STATUSES, type AdminTicketDto, type TicketStatus } from "@bookleaf/shared";
import { useAuth } from "../../../auth/AuthProvider";
import { CategoryChip, PriorityBadge, StatusBadge } from "../../../components/Badge";
import { HelpTip, PageHeader } from "../../../components/ui";
import { formatAge, formatDateTime } from "../../../lib/format";
import { slaHelp } from "../queue/QueueRow";
import { statusLabel } from "./format";
import { useAssigneeChange, useStatusChange } from "./hooks";

/** Read-only progress through the four statuses; the select in the header changes it. */
function StatusStepper({ status }: { status: TicketStatus }) {
  const current = TICKET_STATUSES.indexOf(status);
  return (
    <ol className="aw-stepper" aria-label="Ticket progress">
      {TICKET_STATUSES.map((s, i) => {
        const state = i < current ? "done" : i === current ? "current" : "upcoming";
        return (
          <li key={s} className={`aw-stepper__step aw-stepper__step--${state}`} aria-current={state === "current" ? "step" : undefined}>
            <span className="aw-stepper__marker" aria-hidden="true">
              {state === "done" ? "✓" : i + 1}
            </span>
            <span className="aw-stepper__label">
              {statusLabel(s)}
              {state === "done" && <span className="ui-sr-only"> (done)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function WorkspaceHeader({ ticket }: { ticket: AdminTicketDto }) {
  const { user } = useAuth();
  const status = useStatusChange(ticket);
  const assignee = useAssigneeChange(ticket);
  const mine = Boolean(user && ticket.assignee?.id === user.id);

  return (
    <div className="aw-header">
      <PageHeader
        title={ticket.subject}
        breadcrumbs={[
          { label: "Dashboard", to: "/admin/dashboard" },
          { label: "Ticket queue", to: "/admin/tickets" },
          { label: ticket.reference },
        ]}
        subtitle={
          <span className="aw-header__meta">
            <span className="aw-ref">{ticket.reference}</span>
            <StatusBadge status={ticket.status} />
            {ticket.classification.state === "pending" && !ticket.classification.priority ? (
              <span className="small muted">Prioritising…</span>
            ) : (
              <PriorityBadge priority={ticket.classification.priority} />
            )}
            <CategoryChip classification={ticket.classification} />
            {ticket.slaBreached && (
              <span className="aw-sla">
                SLA breached
                {ticket.ageHours !== null && <> · {formatAge(ticket.ageHours)} waiting</>}
                <HelpTip label="What does SLA breached mean?">{slaHelp(ticket.classification.priority)}</HelpTip>
              </span>
            )}
            <span className="aw-header__opened">
              {ticket.author.name} · opened {formatDateTime(ticket.createdAt)}
            </span>
          </span>
        }
        actions={
          <div className="aw-header__actions">
            {user && !mine && (
              <button
                type="button"
                className="btn"
                aria-busy={assignee.isPending}
                disabled={assignee.isPending}
                onClick={() => void assignee.change(user.id, `${ticket.reference} assigned to you.`)}
              >
                <span>Assign to me</span>
              </button>
            )}
            <div className="aw-header__status">
              <label htmlFor="aw-status">Status</label>
              <select
                id="aw-status"
                value={ticket.status}
                disabled={status.isPending}
                aria-busy={status.isPending}
                onChange={(e) => void status.change(e.target.value as TicketStatus)}
              >
                {TICKET_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        }
      />
      <StatusStepper status={ticket.status} />
    </div>
  );
}
