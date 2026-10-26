import {
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  type AdminTicketDto,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
  type UpdateTicketInput,
} from "@bookleaf/shared";
import { errorMessage } from "../../api/client";
import { useReclassify, useTeam, useUpdateTicket } from "../../api/hooks";
import { useAuth } from "../../auth/AuthProvider";
import { SourceChip } from "../../components/Badge";
import { useToast } from "../../components/Toast";
import { formatPercent } from "../../lib/format";

/** PATCH wrapper with toasts; every control in the panel goes through it. */
function useTicketPatch(ticketId: string) {
  const update = useUpdateTicket(ticketId);
  const toast = useToast();
  const patch = (input: UpdateTicketInput, success: string) =>
    update.mutate(input, {
      onSuccess: () => toast.success(success),
      onError: (e) => toast.error(errorMessage(e)),
    });
  return { patch, isPending: update.isPending };
}

export function ClassificationCard({ ticket }: { ticket: AdminTicketDto }) {
  const c = ticket.classification;
  const { patch, isPending } = useTicketPatch(ticket.id);
  const reclassify = useReclassify(ticket.id);
  const toast = useToast();
  const pending = c.state === "pending";
  const overridden =
    (c.suggestedCategory && c.suggestedCategory !== c.category) ||
    (c.suggestedPriority && c.suggestedPriority !== c.priority);

  return (
    <section className="card stack-sm" aria-labelledby="classification-heading">
      <h2 id="classification-heading" className="card__title">
        Classification
      </h2>
      {pending && (
        <p className="small muted" role="status">
          Classifying… the AI is reading this ticket.
        </p>
      )}
      <div className="field">
        <label htmlFor="category-select">
          Category <SourceChip source={c.categorySource} />
        </label>
        <select
          id="category-select"
          value={c.category ?? ""}
          disabled={isPending}
          onChange={(e) => {
            const category = e.target.value as TicketCategory;
            patch({ category }, `Category set to ${TICKET_CATEGORY_LABELS[category]}`);
          }}
        >
          {!c.category && <option value="">Not set</option>}
          {TICKET_CATEGORIES.map((v) => (
            <option key={v} value={v}>
              {TICKET_CATEGORY_LABELS[v]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="priority-select">
          Priority <SourceChip source={c.prioritySource} />
        </label>
        <select
          id="priority-select"
          value={c.priority ?? ""}
          disabled={isPending}
          onChange={(e) => {
            const priority = e.target.value as TicketPriority;
            patch({ priority }, `Priority set to ${TICKET_PRIORITY_LABELS[priority]}`);
          }}
        >
          {!c.priority && <option value="">Not set</option>}
          {TICKET_PRIORITIES.map((v) => (
            <option key={v} value={v}>
              {TICKET_PRIORITY_LABELS[v]}
            </option>
          ))}
        </select>
      </div>

      {(c.suggestedCategory || c.rationale) && (
        <div className="suggestion small">
          <div>
            <strong>Classifier suggested:</strong>{" "}
            {[
              c.suggestedCategory && TICKET_CATEGORY_LABELS[c.suggestedCategory],
              c.suggestedPriority && TICKET_PRIORITY_LABELS[c.suggestedPriority],
            ]
              .filter(Boolean)
              .join(" · ")}
            {c.confidence !== null && <> · {formatPercent(c.confidence)} confident</>}
            {overridden && <span className="muted"> (overridden)</span>}
          </div>
          {c.rationale && <p className="muted">{c.rationale}</p>}
        </div>
      )}

      <button
        type="button"
        className="btn btn--sm"
        disabled={reclassify.isPending || pending}
        onClick={() =>
          reclassify.mutate(undefined, {
            onSuccess: () => toast.success("Re-classification requested."),
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      >
        {reclassify.isPending ? "Re-running…" : "Re-run AI"}
      </button>
    </section>
  );
}

export function WorkflowCard({ ticket }: { ticket: AdminTicketDto }) {
  const { user } = useAuth();
  const team = useTeam();
  const { patch, isPending } = useTicketPatch(ticket.id);
  const assignedToMe = ticket.assignee?.id === user?.id;

  return (
    <section className="card stack-sm" aria-labelledby="workflow-heading">
      <h2 id="workflow-heading" className="card__title">
        Status &amp; owner
      </h2>
      <div className="field">
        <label htmlFor="status-select">Status</label>
        <select
          id="status-select"
          value={ticket.status}
          disabled={isPending}
          onChange={(e) => {
            const status = e.target.value as TicketStatus;
            patch({ status }, `Status set to ${TICKET_STATUS_LABELS[status]}`);
          }}
        >
          {TICKET_STATUSES.map((s) => (
            <option key={s} value={s}>
              {TICKET_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="assignee-select">Assignee</label>
        <select
          id="assignee-select"
          value={ticket.assignee?.id ?? ""}
          disabled={isPending || team.isPending}
          onChange={(e) => {
            const assigneeId = e.target.value || null;
            const name = team.data?.find((m) => m.id === assigneeId)?.name;
            patch({ assigneeId }, name ? `Assigned to ${name}` : "Ticket unassigned");
          }}
        >
          <option value="">Unassigned</option>
          {/* Keep the current assignee selectable even if the team list hasn't loaded. */}
          {ticket.assignee && !team.data?.some((m) => m.id === ticket.assignee?.id) && (
            <option value={ticket.assignee.id}>{ticket.assignee.name}</option>
          )}
          {team.data?.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id === user?.id ? `${m.name} (me)` : m.name}
            </option>
          ))}
        </select>
      </div>
      {!assignedToMe && user && (
        <button
          type="button"
          className="btn btn--sm"
          disabled={isPending}
          onClick={() => patch({ assigneeId: user.id }, "Assigned to you")}
        >
          Assign to me
        </button>
      )}
    </section>
  );
}
