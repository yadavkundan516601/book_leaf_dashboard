import type { AdminTicketDto } from "@bookleaf/shared";
import { Avatar, Card, CardHeader } from "../../../components/ui";
import { formatAge, formatBytes, formatDateTime, formatRelative } from "../../../lib/format";

function Stamp({ at }: { at: string }) {
  return (
    <time className="aw-msg__time" dateTime={at} title={formatDateTime(at)}>
      {formatRelative(at)}
    </time>
  );
}

/** The author's first message, with attachments and the book it is about. */
export function OriginalQuery({ ticket }: { ticket: AdminTicketDto }) {
  return (
    <Card as="section" className="aw-card aw-query" aria-labelledby="aw-query-title">
      <CardHeader titleId="aw-query-title" title="Original query" />
      <div className="aw-msg__head">
        <Avatar name={ticket.author.name} decorative />
        <div className="aw-msg__who">
          <strong>{ticket.author.name}</strong>
          <span className="aw-msg__role">Author</span>
        </div>
        <span className="aw-msg__when">
          <Stamp at={ticket.createdAt} />
          {ticket.ageHours !== null && <span className="muted"> · open {formatAge(ticket.ageHours)}</span>}
        </span>
      </div>
      <p className="aw-msg__body">{ticket.description}</p>
      {(ticket.book || ticket.attachments.length > 0) && (
        <ul className="aw-chips" aria-label="About this query">
          {ticket.book && (
            <li className="aw-chip aw-chip--book">
              <span className="aw-chip__kind">Book</span> {ticket.book.title}
            </li>
          )}
          {ticket.attachments.map((a) => (
            <li key={a.name} className="aw-chip">
              <span className="aw-chip__kind">File</span> {a.name} <span className="muted">({formatBytes(a.size)})</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Replies after the original query: the author on the left, the BookLeaf team tinted and indented. */
export function Conversation({ ticket }: { ticket: AdminTicketDto }) {
  const count = ticket.messages.length;
  return (
    <section className="aw-thread-wrap" aria-labelledby="aw-thread-title">
      <h2 id="aw-thread-title" className="aw-section-title">
        Conversation <span className="muted">· {count === 0 ? "no replies yet" : `${count} ${count === 1 ? "message" : "messages"}`}</span>
      </h2>
      {count === 0 ? (
        <p className="aw-thread-empty">No replies yet. The author is waiting for a first response: write it below.</p>
      ) : (
        <ol className="aw-thread">
          {ticket.messages.map((m) => {
            const team = m.sender === "admin";
            return (
              <li key={m.id} className={`aw-msg aw-msg--${team ? "team" : "author"}`}>
                <div className="aw-msg__head">
                  <Avatar name={m.senderName} size="sm" decorative />
                  <div className="aw-msg__who">
                    <strong>{m.senderName}</strong>
                    <span className="aw-msg__role">{team ? "BookLeaf team" : "Author"}</span>
                  </div>
                  <Stamp at={m.createdAt} />
                </div>
                <p className="aw-msg__body">{m.body}</p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
