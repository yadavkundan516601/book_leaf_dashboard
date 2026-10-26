import { createNoteSchema, type AdminTicketDto } from "@bookleaf/shared";
import { useState, type FormEvent } from "react";
import { errorMessage } from "../../api/client";
import { useAddNote } from "../../api/hooks";
import { useToast } from "../../components/Toast";
import { formatDateTime, formatRelative, humanizeEventType, labelForValue } from "../../lib/format";

export function NotesCard({ ticket }: { ticket: AdminTicketDto }) {
  const addNote = useAddNote(ticket.id);
  const toast = useToast();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = createNoteSchema.safeParse({ body });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Write a note first");
      return;
    }
    setError(null);
    try {
      await addNote.mutateAsync(parsed.data);
      setBody("");
      toast.success("Internal note added.");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section className="card card--internal stack-sm" aria-labelledby="notes-heading">
      <h2 id="notes-heading" className="card__title">
        Internal notes
      </h2>
      <p className="small internal-label">Internal — not visible to the author</p>
      {ticket.notes.length === 0 ? (
        <p className="small muted">No notes yet.</p>
      ) : (
        <ol className="notes">
          {ticket.notes.map((n) => (
            <li key={n.id} className="note">
              <div className="small muted">
                <strong>{n.author.name}</strong> ·{" "}
                <time dateTime={n.createdAt} title={formatDateTime(n.createdAt)}>
                  {formatRelative(n.createdAt)}
                </time>
              </div>
              <div className="prewrap">{n.body}</div>
            </li>
          ))}
        </ol>
      )}
      <form onSubmit={(e) => void onSubmit(e)} className="stack-sm" noValidate>
        <label htmlFor="note-body" className="sr-only">
          New internal note
        </label>
        <textarea
          id="note-body"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add context for the team…"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "note-error" : undefined}
        />
        {error && (
          <div id="note-error" className="field__error" role="alert">
            {error}
          </div>
        )}
        <div className="actions">
          <button type="submit" className="btn btn--sm" disabled={addNote.isPending || !body.trim()}>
            {addNote.isPending ? "Saving…" : "Add note"}
          </button>
        </div>
      </form>
    </section>
  );
}

export function ActivityCard({ events }: { events: AdminTicketDto["events"] }) {
  return (
    <section className="card stack-sm" aria-labelledby="activity-heading">
      <h2 id="activity-heading" className="card__title">
        Activity
      </h2>
      {events.length === 0 ? (
        <p className="small muted">No activity yet.</p>
      ) : (
        <ol className="timeline">
          {events.map((ev) => (
            <li key={ev.id}>
              <div className="small">
                <strong>{ev.actorName ?? "System"}</strong> · {humanizeEventType(ev.type)}
                {(ev.from || ev.to) && (
                  <>
                    : {ev.from ? labelForValue(ev.from) : "—"} → {ev.to ? labelForValue(ev.to) : "—"}
                  </>
                )}
              </div>
              <time className="small muted" dateTime={ev.createdAt} title={formatDateTime(ev.createdAt)}>
                {formatRelative(ev.createdAt)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
