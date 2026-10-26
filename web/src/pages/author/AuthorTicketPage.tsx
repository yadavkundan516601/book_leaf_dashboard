import { createMessageSchema, type AuthorTicketDto } from "@bookleaf/shared";
import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { ApiError, errorMessage } from "../../api/client";
import { useAuthorTicket, useSendMessage } from "../../api/hooks";
import { AttachmentList } from "../../components/Attachments";
import { StatusBadge } from "../../components/Badge";
import { FormField } from "../../components/FormField";
import { BookIcon } from "../../components/icons";
import { Thread } from "../../components/Thread";
import { useToast } from "../../components/Toast";
import { Card, CardHeader, PageHeader, Skeleton } from "../../components/ui";
import { formatDateTime } from "../../lib/format";
import "../../styles/author-tickets.css";
import { useDocumentTitle, useLeaveGuard } from "./tickets/hooks";
import { LoadError } from "./tickets/LoadError";
import { NEXT_STEPS } from "./tickets/status";
import { StatusCard } from "./tickets/TicketProgress";

const REPLY_MAX = 10_000;
const MY_TICKETS = "/author/tickets";
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
const SEND_KEYS = isMac ? "⌘+Enter" : "Ctrl+Enter";

const newQueryHref = (t: AuthorTicketDto) =>
  `/author/tickets/new${t.book ? `?bookId=${encodeURIComponent(t.book.id)}` : ""}`;

function ReplyBox({ ticket }: { ticket: AuthorTicketDto }) {
  const send = useSendMessage(ticket.id);
  const toast = useToast();
  const hintId = useId();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const closed = ticket.status === "closed";
  useLeaveGuard(!closed && body.trim().length > 0, {
    message: "Your reply hasn't been sent. If you leave now, your text will be lost.",
  });

  if (closed) {
    return (
      <div className="tc-closed" role="note">
        <p className="tc-closed__title">This conversation is closed, so replies are turned off.</p>
        <p>
          Our team has finished with this query. If you need anything else, even on the same topic, start a new query
          and we'll pick it up from there.
        </p>
        <Link to={newQueryHref(ticket)} className="btn btn--primary">
          Start a new query
        </Link>
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (send.isPending) return;
    const parsed = createMessageSchema.safeParse({ body });
    if (!parsed.success) {
      setError(body.trim() ? (parsed.error.issues[0]?.message ?? "Check your message.") : "Write a message before sending.");
      boxRef.current?.focus();
      return;
    }
    setError(null);
    const wasResolved = ticket.status === "resolved";
    try {
      await send.mutateAsync({ body: parsed.data.body });
      setBody("");
      toast.success(wasResolved ? "Reply sent. Your ticket has been reopened." : "Reply sent.");
      boxRef.current?.focus();
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "TICKET_CLOSED"
          ? "This query was just closed, so your reply wasn't sent. Copy your text and start a new query."
          : errorMessage(err),
      );
      boxRef.current?.focus();
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  const resolved = ticket.status === "resolved";
  return (
    <form ref={formRef} className="tc-reply" onSubmit={(e) => void onSubmit(e)} noValidate aria-label="Reply">
      {resolved && (
        <p className="tc-reply__notice">
          This query is marked resolved. Sending a reply reopens it for our team.
        </p>
      )}
      <FormField
        label="Your reply"
        error={error ?? undefined}
        counter={`${body.length.toLocaleString("en-IN")}/${REPLY_MAX.toLocaleString("en-IN")}`}
        hint={`Add details or answer a question from our team. Press ${SEND_KEYS} to send.`}
      >
        {(p) => (
          <textarea
            {...p}
            ref={boxRef}
            rows={4}
            value={body}
            maxLength={REPLY_MAX}
            onChange={(e) => {
              setBody(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={onKeyDown}
          />
        )}
      </FormField>
      <div className="tc-reply__actions">
        <button
          type="submit"
          className="btn btn--primary"
          disabled={send.isPending}
          aria-busy={send.isPending}
          aria-describedby={hintId}
        >
          <span>{resolved ? "Send and reopen" : "Send reply"}</span>
        </button>
        <span id={hintId} className="field__hint" role="status">
          {send.isPending ? "Sending your reply. The button is paused so it can't be sent twice." : ""}
        </span>
      </div>
    </form>
  );
}

function TicketSkeleton() {
  return (
    <div className="tc-layout" role="status">
      <span className="ui-sr-only">Loading your query…</span>
      <div className="tc-side" aria-hidden="true">
        <Card>
          <Skeleton width="50%" height={16} radius={0} />
          <div className="tc-skeleton-steps">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} width="100%" height={36} radius={0} />
            ))}
          </div>
        </Card>
      </div>
      <div className="tc-main" aria-hidden="true">
        <Card>
          <Skeleton width="40%" height={16} radius={0} />
          <div className="tc-skeleton-lines">
            <Skeleton width="100%" height={12} radius={0} />
            <Skeleton width="100%" height={12} radius={0} />
            <Skeleton width="60%" height={12} radius={0} />
          </div>
        </Card>
        <Card>
          <Skeleton width="30%" height={16} radius={0} />
          {[0, 1].map((i) => (
            <div key={i} className={`tc-skeleton-msg${i % 2 ? " tc-skeleton-msg--mine" : ""}`}>
              <Skeleton width={32} height={32} radius={0} />
              <Skeleton width="70%" height={56} radius={0} />
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

function CreatedBanner({ reference, ticket, onDismiss }: { reference: string; ticket: AuthorTicketDto; onDismiss: () => void }) {
  return (
    <div className="at-banner at-banner--success" role="status">
      <div className="at-banner__text">
        <p className="at-banner__title">We've received your query — reference {reference}</p>
        <p>What happens next:</p>
        <ul>
          {NEXT_STEPS[ticket.status].points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
      <div className="at-banner__actions">
        <button type="button" className="btn btn--sm" onClick={onDismiss}>
          Got it
        </button>
      </div>
    </div>
  );
}

export function AuthorTicketPage() {
  const { id = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const createdRef = (location.state as { created?: string } | null)?.created;
  const { data: ticket, isPending, error, refetch, isRefetching } = useAuthorTicket(id);
  useDocumentTitle(ticket ? `${ticket.reference}: ${ticket.subject}` : "Query");

  const crumbs = (last: string) => [
    { label: "Dashboard", to: "/author/overview" },
    { label: "My tickets", to: MY_TICKETS },
    { label: last },
  ];

  if (isPending) {
    return (
      <div className="at-page">
        <PageHeader
          breadcrumbs={crumbs("Query")}
          title={
            <>
              <span className="ui-sr-only">Loading your query</span>
              <Skeleton width="min(480px, 80%)" height={28} radius={0} />
            </>
          }
        />
        <TicketSkeleton />
      </div>
    );
  }

  if (error) {
    const notFound = error instanceof ApiError && (error.status === 404 || error.status === 403);
    return (
      <div className="at-page">
        <PageHeader breadcrumbs={crumbs("Query")} title={notFound ? "Query not found" : "Query"} />
        <LoadError
          title={notFound ? "We couldn't find this query" : "We couldn't load this query"}
          error={error}
          onRetry={() => void refetch()}
          retrying={isRefetching}
        >
          <Link to={MY_TICKETS} className="btn">
            Back to My tickets
          </Link>
        </LoadError>
      </div>
    );
  }

  const showCreated = Boolean(createdRef);
  const dismissCreated = () => void navigate(location.pathname, { replace: true, state: null });

  return (
    <div className="at-page">
      <PageHeader
        breadcrumbs={crumbs(ticket.reference)}
        title={ticket.subject}
        subtitle={
          <span className="tc-meta">
            <StatusBadge status={ticket.status} />
            <span className="ref">{ticket.reference}</span>
            <span>Opened {formatDateTime(ticket.createdAt)}</span>
          </span>
        }
      />

      {showCreated && createdRef && <CreatedBanner reference={createdRef} ticket={ticket} onDismiss={dismissCreated} />}

      <div className="tc-layout">
        <div className="tc-side">
          <StatusCard status={ticket.status} newQueryHref={newQueryHref(ticket)} showNextSteps={!showCreated} />
        </div>

        <div className="tc-main">
          <Card as="section" aria-labelledby="tc-original-title">
            <CardHeader
              title="Your original query"
              titleId="tc-original-title"
              subtitle={`Sent ${formatDateTime(ticket.createdAt)}`}
            />
            <div className="tc-facts">
              <span className="tc-chip" title="Which book this query is about">
                <span className="tc-chip__icon" aria-hidden="true">
                  <BookIcon />
                </span>
                <span className="ui-sr-only">About: </span>
                {ticket.book ? ticket.book.title : "General / Account level"}
              </span>
            </div>
            <p className="prewrap tc-original">{ticket.description}</p>
            {ticket.attachments.length > 0 && (
              <div className="tc-attachments">
                <p className="tc-attachments__label">Attachments (file names only; files aren't uploaded in this demo)</p>
                <AttachmentList attachments={ticket.attachments} />
              </div>
            )}
          </Card>

          <Card as="section" aria-labelledby="tc-conversation-title" className="tc-conversation">
            <CardHeader
              title="Conversation"
              titleId="tc-conversation-title"
              subtitle={
                ticket.messages.length === 0
                  ? "Replies from BookLeaf Support appear here."
                  : `${ticket.messages.length} ${ticket.messages.length === 1 ? "message" : "messages"}. New replies appear without refreshing.`
              }
            />
            <Thread
              messages={ticket.messages}
              viewer="author"
              emptyText="No replies yet. Our support team will reply here, and you'll see it appear without refreshing."
            />
            <ReplyBox key={ticket.id} ticket={ticket} />
          </Card>
        </div>
      </div>
    </div>
  );
}
