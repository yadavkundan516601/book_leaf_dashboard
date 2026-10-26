import type { AuthorTicketSummaryDto } from "@bookleaf/shared";
import { Link } from "react-router";
import { StatusBadge } from "../../../components/Badge";
import { BookIcon, ClipIcon } from "../../../components/icons";
import {
  CardBody,
  CardFacts,
  CardFigure,
  CardFoot,
  CardHead,
  CardStat,
  CardStats,
  CardTitle,
  Chip,
  Fact,
  ListCard,
} from "../../../components/ListCard";
import { Skeleton } from "../../../components/ui";
import { formatDate, formatDateTime, formatRelative } from "../../../lib/format";
import { hasNewReply } from "./status";

/** The one-line answer to "what is happening with this query?". */
function StateFigure({ ticket }: { ticket: AuthorTicketSummaryDto }) {
  if (hasNewReply(ticket)) return <CardFigure value="New reply" tone="primary" caption="BookLeaf Support replied" />;
  switch (ticket.status) {
    case "open":
      return <CardFigure value="Received" caption="Waiting for our team" />;
    case "in_progress":
      return <CardFigure value="With our team" caption="Being worked on" />;
    case "resolved":
      return <CardFigure value="Answered" tone="success" caption="Reply to reopen" />;
    case "closed":
      return <CardFigure value="Closed" tone="muted" caption="Conversation finished" />;
  }
}

export function TicketCard({ ticket }: { ticket: AuthorTicketSummaryDto }) {
  const href = `/author/tickets/${ticket.id}`;
  const promoted = hasNewReply(ticket);
  return (
    <ListCard accent={promoted ? "new" : undefined}>
      <CardHead
        aside={
          <time className="muted" dateTime={ticket.updatedAt} title={formatDateTime(ticket.updatedAt)}>
            Updated {formatRelative(ticket.updatedAt)}
          </time>
        }
      >
        <span className="ref">{ticket.reference}</span>
        <StatusBadge status={ticket.status} />
        {promoted && <span className="at-new-flag">New reply</span>}
      </CardHead>
      <CardBody>
        <CardTitle
          title={
            <Link to={href} className="lcard__link">
              {ticket.subject}
            </Link>
          }
          sub={ticket.book ? undefined : "General / Account level"}
        />
        <CardStats>
          <CardStat label="Opened" value={formatDate(ticket.createdAt)} />
          <CardStat label="Messages" value={ticket.messageCount} />
        </CardStats>
        <StateFigure ticket={ticket} />
      </CardBody>
      {(ticket.book || ticket.attachments.length > 0) && (
        <CardFacts>
          {ticket.book && (
            <Fact icon={<BookIcon />} label="About">
              <Chip>{ticket.book.title}</Chip>
            </Fact>
          )}
          {ticket.attachments.length > 0 && (
            <Fact icon={<ClipIcon />} label="Attachments">
              {ticket.attachments.map((a) => (
                <Chip key={a.name}>{a.name}</Chip>
              ))}
            </Fact>
          )}
        </CardFacts>
      )}
      <CardFoot
        action={
          <Link
            to={href}
            className={promoted ? "btn btn--primary btn--sm" : "btn btn--sm"}
            aria-label={`${promoted ? "Read reply" : "Open conversation"}: ${ticket.reference} ${ticket.subject}`}
          >
            {promoted ? "Read reply" : "Open conversation"}
          </Link>
        }
      />
    </ListCard>
  );
}

/** Placeholder shaped like a ticket card while the list loads. */
export function TicketCardSkeletons({ count = 3 }: { count?: number }) {
  return (
    <div className="card-list" role="status">
      <span className="ui-sr-only">Loading your queries…</span>
      {Array.from({ length: count }, (_, i) => (
        <div className="lcard at-skeleton-card" key={i} aria-hidden="true">
          <div className="lcard__head">
            <Skeleton width={160} height={14} radius={0} />
            <Skeleton width={110} height={12} radius={0} />
          </div>
          <div className="lcard__body">
            <Skeleton width={`${80 - i * 10}%`} height={18} radius={0} />
            <Skeleton width="70%" height={14} radius={0} />
            <Skeleton width={120} height={22} radius={0} />
          </div>
          <div className="lcard__foot">
            <span />
            <Skeleton width={120} height={32} radius={0} />
          </div>
        </div>
      ))}
    </div>
  );
}
