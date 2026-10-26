import {
  createNoteSchema,
  FIRST_RESPONSE_SLA_HOURS,
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  type AdminTicketDto,
  type BookDto,
  type ClassificationSource,
  type TicketCategory,
  type TicketPriority,
} from "@bookleaf/shared";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { errorMessage } from "../../../api/client";
import { useAddNote, useReclassify, useTeam } from "../../../api/hooks";
import { useAuth } from "../../../auth/AuthProvider";
import { BookStatusBadge, StatusBadge } from "../../../components/Badge";
import { useToast } from "../../../components/Toast";
import { Avatar, Card, CardHeader, HelpTip, ProgressBar } from "../../../components/ui";
import { formatAge, formatCount, formatDate, formatDateTime, formatINR, formatPercent, formatRelative } from "../../../lib/format";
import { slaHelp } from "../queue/QueueRow";
import { describeEvent, SOURCE_HELP, SOURCE_LABELS } from "./format";
import { useAssigneeChange, useClassificationChange } from "./hooks";

function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="aw-facts">
      {items.map(([term, value]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{value ?? "Not recorded"}</dd>
        </div>
      ))}
    </dl>
  );
}

function SourceTag({ source }: { source: ClassificationSource | null }) {
  if (!source) return null;
  return <span className={`aw-source aw-source--${source}`}>{SOURCE_LABELS[source]}</span>;
}

// ---------------------------------------------------------------------------

export function ClassificationCard({ ticket }: { ticket: AdminTicketDto }) {
  const c = ticket.classification;
  const { setCategory, setPriority, isPending } = useClassificationChange(ticket);
  const reclassify = useReclassify(ticket.id);
  const toast = useToast();
  const pending = c.state === "pending";
  const overridden =
    (c.suggestedCategory && c.suggestedCategory !== c.category) || (c.suggestedPriority && c.suggestedPriority !== c.priority);

  return (
    <Card as="section" className="aw-card" aria-labelledby="aw-class-title">
      <CardHeader
        titleId="aw-class-title"
        title={
          <>
            Classification <HelpTip label="What do AI, Rules and Admin mean?">{SOURCE_HELP}</HelpTip>
          </>
        }
      />
      {pending && (
        <p className="aw-note-line" role="status">
          Classifying: the AI is reading this ticket. The fields update on their own.
        </p>
      )}
      <div className="aw-fields">
        <div className="field">
          <label htmlFor="aw-category">
            Category <SourceTag source={c.categorySource} />
          </label>
          <select
            id="aw-category"
            value={c.category ?? ""}
            disabled={isPending}
            onChange={(e) => setCategory(e.target.value as TicketCategory)}
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
          <label htmlFor="aw-priority">
            Priority <SourceTag source={c.prioritySource} />
          </label>
          <select
            id="aw-priority"
            value={c.priority ?? ""}
            disabled={isPending}
            onChange={(e) => setPriority(e.target.value as TicketPriority)}
          >
            {!c.priority && <option value="">Not set</option>}
            {TICKET_PRIORITIES.map((v) => (
              <option key={v} value={v}>
                {TICKET_PRIORITY_LABELS[v]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {(c.suggestedCategory || c.confidence !== null || c.rationale) && (
        <div className="aw-suggestion">
          <p>
            <strong>AI suggested:</strong>{" "}
            {[c.suggestedCategory && TICKET_CATEGORY_LABELS[c.suggestedCategory], c.suggestedPriority && TICKET_PRIORITY_LABELS[c.suggestedPriority]]
              .filter(Boolean)
              .join(" · ") || "no suggestion"}
            {overridden && <span className="muted"> (overridden by the team)</span>}
          </p>
          {c.confidence !== null && (
            <div className="aw-confidence">
              <ProgressBar
                label="AI confidence"
                value={Math.round(c.confidence * 100)}
                valueText={formatPercent(c.confidence)}
                tone={c.confidence >= 0.75 ? "success" : c.confidence >= 0.5 ? "warning" : "danger"}
              />
              <HelpTip label="What is AI confidence?">
                How sure the AI was about its suggestion, from 0 to 100%. Below about 50%, double-check the category and
                priority yourself.
              </HelpTip>
            </div>
          )}
          {c.rationale && <p className="aw-suggestion__why">{c.rationale}</p>}
        </div>
      )}

      <div className="aw-card__foot">
        <button
          type="button"
          className="btn btn--sm"
          aria-busy={reclassify.isPending}
          disabled={reclassify.isPending || pending}
          onClick={() =>
            reclassify.mutate(undefined, {
              onSuccess: () => toast.success("Re-classification requested. Values you set by hand are kept."),
              onError: (e) =>
                toast.error(`Couldn't re-run the AI: ${errorMessage(e)}`, {
                  action: { label: "Retry", onClick: () => reclassify.mutate() },
                }),
            })
          }
        >
          <span>Re-run AI</span>
        </button>
        {pending && <span className="field__hint">Available once the current run finishes.</span>}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

export function OwnerCard({ ticket }: { ticket: AdminTicketDto }) {
  const { user } = useAuth();
  const team = useTeam();
  const { change, isPending } = useAssigneeChange(ticket);
  const priority = ticket.classification.priority;

  return (
    <Card as="section" className="aw-card" aria-labelledby="aw-owner-title">
      <CardHeader titleId="aw-owner-title" title="Status & owner" />
      <div className="field">
        <label htmlFor="aw-assignee">Assignee</label>
        <select
          id="aw-assignee"
          value={ticket.assignee?.id ?? ""}
          disabled={isPending || team.isPending}
          aria-busy={isPending}
          onChange={(e) => {
            const id = e.target.value || null;
            const name = id === user?.id ? "you" : team.data?.find((m) => m.id === id)?.name;
            void change(id, id ? `${ticket.reference} assigned to ${name ?? "a teammate"}.` : `${ticket.reference} unassigned.`);
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
        {team.error && <span className="field__error">Couldn't load the team list; refresh to try again.</span>}
      </div>
      <Facts
        items={[
          ["Status", <StatusBadge key="s" status={ticket.status} />],
          ["Opened", formatDateTime(ticket.createdAt)],
          ["First reply", ticket.firstRespondedAt ? formatDateTime(ticket.firstRespondedAt) : "Not yet"],
          [
            "Reply target",
            <span key="sla" className="aw-inline">
              {priority ? `${FIRST_RESPONSE_SLA_HOURS[priority]}h` : "Set a priority"}
              <HelpTip label="What is the SLA reply target?">{slaHelp(priority)}</HelpTip>
            </span>,
          ],
          [
            "Waiting",
            ticket.ageHours === null ? (
              "Finished"
            ) : (
              <span key="age" className={ticket.slaBreached ? "aw-danger-text" : undefined}>
                {formatAge(ticket.ageHours)}
                {ticket.slaBreached && " · SLA breached"}
              </span>
            ),
          ],
          ["Last update", formatRelative(ticket.updatedAt)],
        ]}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------

function BookFacts({ book }: { book: BookDto }) {
  const base: [string, ReactNode][] = [
    ["Status", <BookStatusBadge key="s" status={book.status} isPublished={book.isPublished} />],
    ["ISBN", book.isbn],
    ["Published", book.publicationDate ? formatDate(book.publicationDate) : "Not yet"],
  ];
  if (!book.isPublished) {
    return (
      <>
        <Facts items={base} />
        <p className="aw-note-line">In production: no sales or royalties yet.</p>
      </>
    );
  }
  return (
    <Facts
      items={[
        ...base,
        ["Copies sold", formatCount(book.totalCopiesSold)],
        ["Royalty / copy", book.royaltyPerCopy !== null ? formatINR(book.royaltyPerCopy) : null],
        ["Earned", formatINR(book.totalRoyaltyEarned)],
        ["Pending", formatINR(book.royaltyPending)],
        ["Last payout", book.lastRoyaltyPayoutDate ? formatDate(book.lastRoyaltyPayoutDate) : "Never"],
        ["Available on", book.availableOn.length ? book.availableOn.join(", ") : "Not listed yet"],
      ]}
    />
  );
}

/** Everything an agent needs to answer without leaving the ticket. */
export function ContextCard({ ticket }: { ticket: AdminTicketDto }) {
  const { author, book, royalty } = ticket.context;
  return (
    <Card as="section" className="aw-card" aria-labelledby="aw-context-title">
      <CardHeader titleId="aw-context-title" title="Author & book" />
      <div className="aw-person">
        <Avatar name={author.name} decorative />
        <div className="aw-person__text">
          <strong>{author.name}</strong>
          <a href={`mailto:${author.email}`}>{author.email}</a>
        </div>
      </div>
      <Facts
        items={[
          ["Phone", author.phone],
          ["City", author.city],
          ["Author since", author.joinedDate ? formatDate(author.joinedDate) : null],
        ]}
      />

      <h3 className="aw-subhead">{book ? book.title : "No specific book"}</h3>
      {book ? <BookFacts book={book} /> : <p className="aw-note-line">The author raised this as a general or account query.</p>}

      <h3 className="aw-subhead">
        Royalties, all books{" "}
        <HelpTip label="How do royalty payouts work?">
          Royalties are paid once a quarter. Pending royalties below the {formatINR(royalty.payoutThreshold)} threshold roll
          over to the next quarter.
        </HelpTip>
      </h3>
      <Facts
        items={[
          ["Earned", formatINR(royalty.totalEarned)],
          ["Paid", formatINR(royalty.totalPaid)],
          ["Pending", formatINR(royalty.totalPending)],
          ["Next payout", formatDate(royalty.nextPayoutDueBy)],
        ]}
      />
      {royalty.totalPending > 0 && !royalty.meetsThreshold && (
        <p className="aw-note-line aw-note-line--warning">
          Pending is below the {formatINR(royalty.payoutThreshold)} threshold, so it rolls over to next quarter.
        </p>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------

export function NotesCard({ ticket, onUnsentChange }: { ticket: AdminTicketDto; onUnsentChange: (unsent: boolean) => void }) {
  const addNote = useAddNote(ticket.id);
  const toast = useToast();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const unsent = body.trim() !== "";
  useEffect(() => onUnsentChange(unsent), [unsent, onUnsentChange]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (addNote.isPending) return;
    const parsed = createNoteSchema.safeParse({ body });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Write a note first");
      return;
    }
    setError(null);
    try {
      await addNote.mutateAsync(parsed.data);
      setBody("");
      toast.success("Internal note saved for the team. Notes can't be edited or undone.");
    } catch (err) {
      setError(`Note not saved: ${errorMessage(err)} Press “Add note” to retry.`);
    }
  }

  return (
    <Card as="section" className="aw-card aw-notes" aria-labelledby="aw-notes-title">
      <CardHeader
        titleId="aw-notes-title"
        title={
          <>
            Internal notes{" "}
            <HelpTip label="Who can see internal notes?">
              Notes are only visible to the BookLeaf team. Use them for context, hand-overs and decisions; the author never
              sees them.
            </HelpTip>
          </>
        }
        subtitle="Internal — not visible to the author"
      />
      {ticket.notes.length === 0 ? (
        <p className="aw-note-line">No notes yet. Leave one for whoever picks this up next.</p>
      ) : (
        <ol className="aw-notes__list">
          {ticket.notes.map((n) => (
            <li key={n.id} className="aw-notes__item">
              <div className="aw-notes__meta">
                <strong>{n.author.name}</strong>
                <time dateTime={n.createdAt} title={formatDateTime(n.createdAt)}>
                  {formatRelative(n.createdAt)}
                </time>
              </div>
              <p className="aw-msg__body">{n.body}</p>
            </li>
          ))}
        </ol>
      )}
      <form onSubmit={(e) => void onSubmit(e)} className="aw-notes__form" noValidate>
        <label htmlFor="aw-note" className="ui-sr-only">
          New internal note
        </label>
        <textarea
          id="aw-note"
          rows={3}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Add context for the team…"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "aw-note-error" : "aw-note-hint"}
        />
        {error ? (
          <span id="aw-note-error" className="field__error" role="alert">
            {error}
          </span>
        ) : (
          <span id="aw-note-hint" className="field__hint">
            {unsent ? "Only the team will see this." : "Write a note to enable “Add note”."}
          </span>
        )}
        <div>
          <button type="submit" className="btn btn--sm" aria-busy={addNote.isPending} disabled={addNote.isPending || !unsent}>
            <span>Add note</span>
          </button>
        </div>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------

export function ActivityCard({ events }: { events: AdminTicketDto["events"] }) {
  return (
    <Card as="section" className="aw-card" aria-labelledby="aw-activity-title">
      <CardHeader titleId="aw-activity-title" title="Activity" />
      {events.length === 0 ? (
        <p className="aw-note-line">Nothing has happened on this ticket yet.</p>
      ) : (
        <ol className="aw-timeline">
          {[...events].reverse().map((ev) => {
            const { actor, action, change } = describeEvent(ev);
            return (
              <li key={ev.id} className="aw-timeline__item">
                <p>
                  <strong>{actor}</strong> {action}
                  {change && <span className="aw-timeline__change">{change}</span>}
                </p>
                <time dateTime={ev.createdAt} title={formatDateTime(ev.createdAt)}>
                  {formatRelative(ev.createdAt)}
                </time>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
