import { createMessageSchema, type AuthorTicketDto } from "@bookleaf/shared";
import { useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "react-router";
import { ApiError, errorMessage } from "../../api/client";
import { useAuthorTicket, useSendMessage } from "../../api/hooks";
import { AttachmentList } from "../../components/Attachments";
import { StatusBadge } from "../../components/Badge";
import { ErrorState } from "../../components/EmptyState";
import { Spinner } from "../../components/Spinner";
import { Thread } from "../../components/Thread";
import { useToast } from "../../components/Toast";
import { formatDateTime } from "../../lib/format";

function ReplyBox({ ticket }: { ticket: AuthorTicketDto }) {
  const send = useSendMessage(ticket.id);
  const toast = useToast();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (ticket.status === "closed") {
    return (
      <div className="alert alert--info">
        This ticket is closed, so replies are turned off. Need more help?{" "}
        <Link to={`/author/tickets/new${ticket.book ? `?bookId=${encodeURIComponent(ticket.book.id)}` : ""}`}>
          Raise a new query
        </Link>
        .
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = createMessageSchema.safeParse({ body });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Write a message first");
      return;
    }
    setError(null);
    try {
      await send.mutateAsync({ body: parsed.data.body });
      setBody("");
      toast.success(ticket.status === "resolved" ? "Reply sent. Your ticket has been reopened." : "Reply sent.");
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "TICKET_CLOSED"
          ? "This ticket was just closed, so your reply wasn't sent. Please raise a new query."
          : errorMessage(err),
      );
    }
  }

  return (
    <form className="stack" onSubmit={(e) => void onSubmit(e)} noValidate>
      <label htmlFor="reply" className="label">
        Reply
      </label>
      {ticket.status === "resolved" && (
        <p className="small muted">This ticket is marked resolved. Replying will reopen it for our team.</p>
      )}
      <textarea
        id="reply"
        rows={4}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "reply-error" : undefined}
        placeholder="Add more details or reply to the BookLeaf team…"
      />
      {error && (
        <div id="reply-error" className="field__error" role="alert">
          {error}
        </div>
      )}
      <div className="actions">
        <button type="submit" className="btn btn--primary" disabled={send.isPending || !body.trim()}>
          {send.isPending ? "Sending…" : ticket.status === "resolved" ? "Send & reopen" : "Send reply"}
        </button>
      </div>
    </form>
  );
}

export function AuthorTicketPage() {
  const { id = "" } = useParams();
  const location = useLocation();
  const createdRef = (location.state as { created?: string } | null)?.created;
  const { data: ticket, isPending, error, refetch } = useAuthorTicket(id);

  if (isPending) return <Spinner label="Loading ticket…" />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <div className="narrow stack-lg">
      <Link to="/author/tickets" className="back-link">
        ← My Tickets
      </Link>
      {createdRef && (
        <div className="alert alert--success" role="status">
          We've received your query — reference <strong>{createdRef}</strong>. Our team will reply here, and you'll see
          the answer without refreshing.
        </div>
      )}
      <header className="stack-sm">
        <div className="row">
          <span className="ref">{ticket.reference}</span>
          <StatusBadge status={ticket.status} />
        </div>
        <h1>{ticket.subject}</h1>
        <p className="small muted">
          {ticket.book ? ticket.book.title : "General / Account Level"} · opened {formatDateTime(ticket.createdAt)}
        </p>
      </header>

      <section className="card stack-sm" aria-label="Your original query">
        <h2 className="card__title">Your query</h2>
        <p className="prewrap">{ticket.description}</p>
        <AttachmentList attachments={ticket.attachments} />
      </section>

      <section className="card stack" aria-labelledby="conversation-heading">
        <h2 id="conversation-heading" className="card__title">
          Conversation
        </h2>
        <Thread
          messages={ticket.messages}
          viewer="author"
          emptyText="No replies yet. Our support team will respond here; you'll see it as soon as they do."
        />
        <ReplyBox ticket={ticket} />
      </section>
    </div>
  );
}
