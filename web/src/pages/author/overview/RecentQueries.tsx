import type { AuthorTicketSummaryDto } from "@bookleaf/shared";
import { Link } from "react-router";
import { StatusBadge } from "../../../components/Badge";
import { Card, CardHeader, Pill } from "../../../components/ui";
import { formatDateTime, formatRelative } from "../../../lib/format";
import { hasNewReply } from "./royalty";
import { ListSkeleton } from "./Skeletons";

interface RecentQueriesProps {
  tickets: readonly AuthorTicketSummaryDto[] | undefined;
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
}

function Body({ tickets, isPending, error, onRetry }: RecentQueriesProps) {
  if (isPending) return <ListSkeleton rows={4} label="Loading your recent queries…" />;
  if (error || !tickets) {
    return (
      <div className="ah-empty" role="alert">
        <p className="ah-empty__title">We couldn't load your queries</p>
        <p className="ah-empty__body">{error instanceof Error ? error.message : "Something went wrong."}</p>
        <button type="button" className="btn btn--sm" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }
  if (tickets.length === 0) {
    return (
      <div className="ah-empty">
        <p className="ah-empty__title">No questions yet</p>
        <p className="ah-empty__body">Ask about royalties, printing, listings or anything else. Our team replies right in the query.</p>
        <Link className="btn btn--primary btn--sm" to="/author/tickets/new">
          Ask a question
        </Link>
      </div>
    );
  }
  return (
    <ul className="ah-list">
      {tickets.map((t) => (
        <li className="ah-query" key={t.id}>
          <div className="ah-query__main">
            <span className="ah-query__ref">{t.reference}</span>
            <Link className="ah-query__subject" to={`/author/tickets/${t.id}`}>
              {t.subject}
            </Link>
          </div>
          <div className="ah-query__meta">
            {hasNewReply(t) && <Pill tone="primary">New reply</Pill>}
            <StatusBadge status={t.status} />
            <time className="ah-muted ah-small" dateTime={t.updatedAt} title={formatDateTime(t.updatedAt)}>
              {formatRelative(t.updatedAt)}
            </time>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The author's four most recently updated queries. */
export function RecentQueries(props: RecentQueriesProps) {
  return (
    <Card as="section" className="ah-area-queries" aria-labelledby="ah-queries-title">
      <CardHeader
        titleId="ah-queries-title"
        title="Recent queries"
        actions={
          <Link className="ah-link" to="/author/tickets">
            View all<span className="ui-sr-only"> queries</span>
          </Link>
        }
      />
      <Body {...props} />
    </Card>
  );
}
