import {
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  type AdminTicketDto,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
  type UpdateTicketInput,
} from "@bookleaf/shared";
import { errorMessage } from "../../../api/client";
import { useUpdateTicket } from "../../../api/hooks";
import { useToast } from "../../../components/Toast";
import { useConfirm, type ConfirmOptions } from "../../../components/ui";
import { useUndoableTicketUpdate } from "../hooks";
import { statusLabel } from "./format";

/** Confirmation copy for the two statuses that end the conversation (the author is told about both). */
export function finishConfirm(reference: string, status: "resolved" | "closed"): ConfirmOptions {
  return status === "resolved"
    ? {
        title: `Mark ${reference} as resolved?`,
        message: "The author will see the new status and can reply to reopen it.",
        confirmLabel: "Mark resolved",
        cancelLabel: "Not yet",
      }
    : {
        title: `Close ${reference}?`,
        message:
          "The author will see it as closed and can no longer reply; they would need to raise a new ticket. You can reopen it from here later.",
        confirmLabel: "Close ticket",
        cancelLabel: "Keep it open",
      };
}

/** The status a closed ticket goes back to: in progress once the team has replied, otherwise open. */
export const reopenStatusFor = (ticket: AdminTicketDto): TicketStatus =>
  ticket.firstRespondedAt || ticket.messages.some((m) => m.sender === "admin") ? "in_progress" : "open";

/** Status changes: asks before resolving or closing, then applies with an Undo toast. */
export function useStatusChange(ticket: AdminTicketDto) {
  const confirm = useConfirm();
  const { apply, isPending } = useUndoableTicketUpdate(ticket.id);

  const change = async (status: TicketStatus, success?: string): Promise<boolean> => {
    if (status === ticket.status) return false;
    if ((status === "resolved" || status === "closed") && !(await confirm(finishConfirm(ticket.reference, status)))) {
      return false;
    }
    return apply({
      input: { status },
      revert: { status: ticket.status },
      success: success ?? `${ticket.reference} marked ${statusLabel(status).toLowerCase()}.`,
    });
  };

  return { change, isPending };
}

/** Assignee changes with an Undo toast. */
export function useAssigneeChange(ticket: AdminTicketDto) {
  const { apply, isPending } = useUndoableTicketUpdate(ticket.id);
  const change = (assigneeId: string | null, success: string) =>
    apply({ input: { assigneeId }, revert: { assigneeId: ticket.assignee?.id ?? null }, success });
  return { change, isPending };
}

/**
 * Category and priority overrides with an Undo toast. When the field had no value before (classification
 * still pending or failed) there is nothing to restore, so the change is saved with a plain confirmation.
 */
export function useClassificationChange(ticket: AdminTicketDto) {
  const { apply, isPending: undoPending } = useUndoableTicketUpdate(ticket.id);
  const update = useUpdateTicket(ticket.id);
  const toast = useToast();
  const c = ticket.classification;

  const plain = async (input: UpdateTicketInput, success: string) => {
    try {
      await update.mutateAsync(input);
      toast.success(success);
    } catch (err) {
      toast.error(`Couldn't save: ${errorMessage(err)}`, { action: { label: "Retry", onClick: () => void plain(input, success) } });
    }
  };

  const setCategory = (category: TicketCategory) => {
    const success = `${ticket.reference} category set to ${TICKET_CATEGORY_LABELS[category]}.`;
    if (!c.category) void plain({ category }, success);
    else void apply({ input: { category }, revert: { category: c.category }, success });
  };
  const setPriority = (priority: TicketPriority) => {
    const success = `${ticket.reference} priority set to ${TICKET_PRIORITY_LABELS[priority]}.`;
    if (!c.priority) void plain({ priority }, success);
    else void apply({ input: { priority }, revert: { priority: c.priority }, success });
  };

  return { setCategory, setPriority, isPending: undoPending || update.isPending };
}
