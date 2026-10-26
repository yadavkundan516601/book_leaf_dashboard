import type { UpdateTicketInput } from "@bookleaf/shared";
import { errorMessage } from "../../api/client";
import { useUpdateTicket } from "../../api/hooks";
import { useToast } from "../../components/Toast";

const UNDO_MS = 8000;

export interface UndoableChange {
  /** The change to apply. */
  input: UpdateTicketInput;
  /** The previous values, PATCHed back if the agent presses Undo. */
  revert: UpdateTicketInput;
  /** Success toast text, e.g. "BL-6 assigned to you." */
  success: string;
}

/**
 * PATCH a ticket, then show a success toast with an 8-second Undo that restores the previous values.
 * Uses mutateAsync rather than per-call callbacks so the toast and the Undo still work when the calling
 * component unmounts mid-flight (e.g. a queue row that drops out of the "Unassigned" view once assigned).
 */
export function useUndoableTicketUpdate(ticketId: string) {
  const update = useUpdateTicket(ticketId);
  const toast = useToast();

  const apply = async (change: UndoableChange): Promise<boolean> => {
    try {
      await update.mutateAsync(change.input);
    } catch (err) {
      toast.error(`Couldn't save: ${errorMessage(err)}`, { action: { label: "Retry", onClick: () => void apply(change) } });
      return false;
    }
    toast.success(change.success, {
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          update.mutateAsync(change.revert).then(
            () => toast.success("Change undone."),
            (err: unknown) => toast.error(`Couldn't undo: ${errorMessage(err)}`),
          );
        },
      },
    });
    return true;
  };

  return { apply, isPending: update.isPending };
}
