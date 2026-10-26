import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ApiError, errorMessage } from "../../api/client";
import { useAdminTicket } from "../../api/hooks";
import { Card, PageHeader, Skeleton } from "../../components/ui";
import "../../styles/admin-workspace.css";
import { Conversation, OriginalQuery } from "./ticket/Conversation";
import { WorkspaceHeader } from "./ticket/Header";
import { ReplyComposer } from "./ticket/ReplyComposer";
import { ActivityCard, ClassificationCard, ContextCard, NotesCard, OwnerCard } from "./ticket/SidePanel";
import { useLeaveGuard } from "./ticket/useLeaveGuard";

const QUEUE_CRUMBS = [
  { label: "Dashboard", to: "/admin/dashboard" },
  { label: "Ticket queue", to: "/admin/tickets" },
];

function WorkspaceSkeleton() {
  const block = (lines: number) => (
    <Card className="aw-card aw-skeleton-card">
      <Skeleton width="40%" height={14} radius={0} />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? "60%" : "100%"} height={12} radius={0} />
      ))}
    </Card>
  );
  return (
    <div className="aw-page" role="status" aria-busy="true">
      <span className="ui-sr-only">Loading ticket…</span>
      <div className="aw-skeleton-head">
        <Skeleton width={220} height={12} radius={0} />
        <Skeleton width="55%" height={28} radius={0} />
        <Skeleton width="35%" height={16} radius={0} />
      </div>
      <div className="aw-layout">
        <div className="aw-main">
          {block(4)}
          {block(3)}
          {block(6)}
        </div>
        <div className="aw-side">
          {block(4)}
          {block(3)}
          {block(5)}
        </div>
      </div>
    </div>
  );
}

function WorkspaceState({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <div className="aw-page">
      <PageHeader title={title} breadcrumbs={[...QUEUE_CRUMBS, { label: "Ticket" }]} />
      <Card className="aw-card aw-state" role="alert">
        <p className="aw-state__text">{text}</p>
        <div className="aw-state__actions">{children}</div>
      </Card>
    </div>
  );
}

export function AdminTicketPage() {
  const { id = "" } = useParams();
  const { data: ticket, isPending, error, refetch, isRefetching } = useAdminTicket(id);
  const notFound = error instanceof ApiError && error.status === 404;
  const [unsentReply, setUnsentReply] = useState(false);
  const [unsentNote, setUnsentNote] = useState(false);
  const onReplyUnsent = useCallback((v: boolean) => setUnsentReply(v), []);
  const onNoteUnsent = useCallback((v: boolean) => setUnsentNote(v), []);

  useLeaveGuard(Boolean(ticket) && (unsentReply || unsentNote));

  useEffect(() => {
    document.title = ticket
      ? `${ticket.reference} · BookLeaf Support`
      : notFound
        ? "Ticket not found · BookLeaf Support"
        : "Ticket · BookLeaf Support";
  }, [ticket, notFound]);

  if (isPending) return <WorkspaceSkeleton />;
  if (notFound) {
    return (
      <WorkspaceState title="Ticket not found" text="This ticket doesn't exist or was removed. Check the link, or find it in the queue.">
        <Link to="/admin/tickets" className="btn btn--primary">
          Back to the ticket queue
        </Link>
      </WorkspaceState>
    );
  }
  if (!ticket) {
    return (
      <WorkspaceState title="Couldn't load this ticket" text={`${errorMessage(error)} Your connection may have dropped; try again.`}>
        <button type="button" className="btn btn--primary" aria-busy={isRefetching} disabled={isRefetching} onClick={() => void refetch()}>
          <span>Retry</span>
        </button>
        <Link to="/admin/tickets" className="btn">
          Back to the ticket queue
        </Link>
      </WorkspaceState>
    );
  }

  return (
    <div className="aw-page">
      <WorkspaceHeader ticket={ticket} />
      {error && (
        <div className="aw-inline-error" role="alert">
          <span>Couldn't refresh this ticket: {errorMessage(error)} What you see may be out of date.</span>
          <button type="button" className="btn btn--sm" disabled={isRefetching} onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      )}
      <div className="aw-layout">
        <div className="aw-main">
          <OriginalQuery ticket={ticket} />
          <Conversation ticket={ticket} />
          <ReplyComposer key={ticket.id} ticket={ticket} onUnsentChange={onReplyUnsent} />
        </div>
        <aside className="aw-side" aria-label="Ticket details">
          <ClassificationCard ticket={ticket} />
          <OwnerCard ticket={ticket} />
          <ContextCard ticket={ticket} />
          <NotesCard key={ticket.id} ticket={ticket} onUnsentChange={onNoteUnsent} />
          <ActivityCard events={ticket.events} />
        </aside>
      </div>
    </div>
  );
}
