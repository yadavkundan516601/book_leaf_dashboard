import type { AdminTicketSummaryDto, Paginated } from "@bookleaf/shared";
import { errorMessage } from "../../../api/client";
import { Pagination } from "../../../components/Pagination";
import { Card, Skeleton } from "../../../components/ui";
import { QueueRow } from "./QueueRow";

/** Visual column labels for wide screens; rows carry their own labels for screen readers. */
function ColumnHeads() {
  return (
    <div className="aq-heads" aria-hidden="true">
      <span />
      <span>Ticket</span>
      <span>Category · priority · status</span>
      <span>Assignee</span>
      <span>Age</span>
      <span className="aq-heads__actions">Actions</span>
    </div>
  );
}

function SkeletonQueue() {
  return (
    <div role="status" className="aq-list">
      <span className="ui-sr-only">Loading tickets…</span>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="aq-row aq-row--skeleton" aria-hidden="true">
          <span className="aq-row__avatar">
            <Skeleton width={32} height={32} radius={0} />
          </span>
          <div className="aq-row__main">
            <Skeleton width={`${78 - (i % 3) * 14}%`} height={13} radius={0} />
            <Skeleton width={`${48 - (i % 2) * 12}%`} height={10} radius={0} />
          </div>
          <div className="aq-row__tags">
            <Skeleton width={96} height={20} radius={0} />
            <Skeleton width={56} height={20} radius={0} />
          </div>
          <div className="aq-row__assignee">
            <Skeleton width={72} height={12} radius={0} />
          </div>
          <div className="aq-row__age">
            <Skeleton width={44} height={16} radius={0} />
          </div>
          <div className="aq-row__actions">
            <Skeleton width={64} height={32} radius={0} />
          </div>
        </div>
      ))}
    </div>
  );
}

interface QueueListProps {
  data: Paginated<AdminTicketSummaryDto> | undefined;
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
  /** Whether filters or search narrow the queue (changes the empty-state advice). */
  filtered: boolean;
  onClearFilters: () => void;
  onShowResolved: () => void;
  onPage: (page: number) => void;
}

export function QueueList({ data, isPending, error, onRetry, filtered, onClearFilters, onShowResolved, onPage }: QueueListProps) {
  let body;
  if (isPending) {
    body = <SkeletonQueue />;
  } else if (error || !data) {
    body = (
      <div className="aq-state" role="alert">
        <h2 className="aq-state__title">Couldn't load the queue</h2>
        <p className="aq-state__text">{errorMessage(error)} Your filters are kept; try again in a moment.</p>
        <button type="button" className="btn btn--primary" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  } else if (data.data.length === 0) {
    body = filtered ? (
      <div className="aq-state">
        <h2 className="aq-state__title">No tickets match these filters</h2>
        <p className="aq-state__text">
          Nothing in the queue fits every filter and the search at once. Remove a chip above, or clear them all to see the
          whole active queue.
        </p>
        <button type="button" className="btn btn--primary" onClick={onClearFilters}>
          Clear filters
        </button>
      </div>
    ) : (
      <div className="aq-state">
        <h2 className="aq-state__title">The queue is clear</h2>
        <p className="aq-state__text">
          No open or in-progress tickets right now. New queries from authors appear here automatically.
        </p>
        <button type="button" className="btn" onClick={onShowResolved}>
          Review resolved tickets
        </button>
      </div>
    );
  } else {
    body = (
      <>
        <ColumnHeads />
        <ul className="aq-list" aria-label="Tickets">
          {data.data.map((t) => (
            <QueueRow key={t.id} ticket={t} />
          ))}
        </ul>
      </>
    );
  }

  return (
    <div className="aq-results">
      <Card flush className="aq-card">
        {body}
      </Card>
      {data && data.data.length > 0 && !isPending && (
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={onPage} />
      )}
    </div>
  );
}
