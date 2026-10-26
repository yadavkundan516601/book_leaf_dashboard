import { Link, useParams } from "react-router";
import { useAdminTicket } from "../../api/hooks";
import { AttachmentList } from "../../components/Attachments";
import { CategoryChip, PriorityBadge, StatusBadge } from "../../components/Badge";
import { ErrorState } from "../../components/EmptyState";
import { Spinner } from "../../components/Spinner";
import { Thread } from "../../components/Thread";
import { formatAge, formatDateTime } from "../../lib/format";
import { ContextCard } from "./ContextCard";
import { ActivityCard, NotesCard } from "./NotesAndActivity";
import { ReplyComposer } from "./ReplyComposer";
import { ClassificationCard, WorkflowCard } from "./TicketControls";

export function AdminTicketPage() {
  const { id = "" } = useParams();
  const { data: ticket, isPending, error, refetch } = useAdminTicket(id);

  if (isPending) return <Spinner label="Loading ticket…" />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <div className="stack">
      <Link to="/admin/tickets" className="back-link">
        ← Ticket queue
      </Link>
      <div className="detail-layout">
        <div className="detail-main stack">
          <header className="stack-sm">
            <div className="row">
              <span className="ref">{ticket.reference}</span>
              <StatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.classification.priority} />
              <CategoryChip classification={ticket.classification} />
              {ticket.slaBreached && <span className="sla-flag">SLA breached</span>}
            </div>
            <h1>{ticket.subject}</h1>
            <p className="small muted">
              {ticket.author.name}
              {ticket.book && <> · {ticket.book.title}</>} · opened {formatDateTime(ticket.createdAt)}
              {ticket.ageHours !== null && <> ({formatAge(ticket.ageHours)} ago)</>}
              {" · "}
              {ticket.assignee ? `Assigned to ${ticket.assignee.name}` : "Unassigned"}
            </p>
          </header>

          <section className="card stack-sm" aria-label="Original query">
            <h2 className="card__title">Original query</h2>
            <p className="prewrap">{ticket.description}</p>
            <AttachmentList attachments={ticket.attachments} />
          </section>

          <section className="card stack" aria-labelledby="thread-heading">
            <h2 id="thread-heading" className="card__title">
              Conversation
            </h2>
            <Thread messages={ticket.messages} viewer="admin" emptyText="No replies yet. The author is waiting for a first response." />
            <ReplyComposer key={ticket.id} ticket={ticket} />
          </section>
        </div>

        <aside className="detail-side stack" aria-label="Ticket details">
          <ClassificationCard ticket={ticket} />
          <WorkflowCard ticket={ticket} />
          <ContextCard context={ticket.context} />
          <NotesCard ticket={ticket} />
          <ActivityCard events={ticket.events} />
        </aside>
      </div>
    </div>
  );
}
