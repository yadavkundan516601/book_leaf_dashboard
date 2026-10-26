import type { BookDto, RoyaltySummaryDto } from "@bookleaf/shared";
import { Link } from "react-router";
import { useMyBooks } from "../../api/hooks";
import { BookStatusBadge } from "../../components/Badge";
import { EmptyState, ErrorState } from "../../components/EmptyState";
import { GlobeIcon, PrinterIcon } from "../../components/icons";
import { CardBody, CardFacts, CardFigure, CardFoot, CardHead, CardStat, CardStats, CardTitle, Chip, Fact, ListCard } from "../../components/ListCard";
import { Spinner } from "../../components/Spinner";
import { formatCount, formatDate, formatINR } from "../../lib/format";
import { stageProgress } from "../../lib/productionStage";

function RoyaltySummary({ royalty }: { royalty: RoyaltySummaryDto }) {
  const { totalEarned, totalPaid, totalPending, payoutThreshold, meetsThreshold } = royalty;
  return (
    <section aria-label="Royalty summary" className="stack">
      <div className="stat-grid">
        <div className="stat card">
          <span className="stat__label">Total earned</span>
          <span className="stat__value">{formatINR(totalEarned)}</span>
        </div>
        <div className="stat card">
          <span className="stat__label">Paid to you</span>
          <span className="stat__value">{formatINR(totalPaid)}</span>
        </div>
        <div className="stat card">
          <span className="stat__label">Pending</span>
          <span className="stat__value">{formatINR(totalPending)}</span>
        </div>
        <div className="stat card">
          <span className="stat__label">Next payout due by</span>
          <span className="stat__value">{formatDate(royalty.nextPayoutDueBy)}</span>
        </div>
      </div>
      <div className={meetsThreshold || totalPending === 0 ? "alert alert--info" : "alert alert--warning"}>
        <p>
          Royalties are calculated every quarter and paid within 45 days of the quarter closing. The current quarter
          closes on {formatDate(royalty.currentQuarterEnd)}.
        </p>
        {totalPending === 0 ? (
          <p>You have nothing pending right now: every royalty earned so far has been paid.</p>
        ) : meetsThreshold ? (
          <p>
            Your pending {formatINR(totalPending)} will be included in the next payout, due by{" "}
            {formatDate(royalty.nextPayoutDueBy)}.
          </p>
        ) : (
          <p>
            Your pending {formatINR(totalPending)} is below the {formatINR(payoutThreshold)} payout minimum, so it rolls
            over to the next quarter and is paid once your balance reaches {formatINR(payoutThreshold)}.
          </p>
        )}
      </div>
    </section>
  );
}

/** Published books: sales and royalty numbers. */
function RoyaltyStats({ book }: { book: BookDto }) {
  const neverPaid = book.totalRoyaltyEarned > 0 && !book.lastRoyaltyPayoutDate;
  return (
    <CardStats>
      <CardStat label="Copies sold" value={formatCount(book.totalCopiesSold)} />
      <CardStat label="Royalty earned" value={formatINR(book.totalRoyaltyEarned)} />
      <CardStat
        label="Paid out"
        value={neverPaid ? "Nothing yet" : formatINR(book.royaltyPaid)}
        tone={neverPaid ? "muted" : undefined}
        sub={book.lastRoyaltyPayoutDate ? `Last paid ${formatDate(book.lastRoyaltyPayoutDate)}` : undefined}
      />
    </CardStats>
  );
}

/** Books still in production: where they are in the pipeline instead of empty royalty columns. */
function ProductionProgress({ status }: { status: string }) {
  const progress = stageProgress(status);
  if (!progress) return <p className="muted">Sales and royalties appear once your book is live.</p>;
  return (
    <div className="progress">
      <div className="progress__label">
        <strong>{progress.stage}</strong>
        <span className="muted">
          Step {progress.step} of {progress.total}
        </span>
      </div>
      <div
        className="progress__track"
        role="progressbar"
        aria-label="Production progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
      >
        <div className="progress__bar" style={{ width: `${progress.percent}%` }} />
      </div>
    </div>
  );
}

function PendingFigure({ book }: { book: BookDto }) {
  if (!book.isPublished) return <CardFigure value="In production" tone="muted" caption="Royalties start once it's live" />;
  if (book.totalRoyaltyEarned > 0 && book.royaltyPending === 0) return <CardFigure value="All paid" tone="success" caption="No royalty pending" />;
  if (book.royaltyPending === 0) return <CardFigure value={formatINR(0)} tone="muted" caption="Royalty pending" />;
  return <CardFigure value={formatINR(book.royaltyPending)} tone="primary" caption="Royalty pending" />;
}

function BookCard({ book }: { book: BookDto }) {
  const queryUrl = `/author/tickets/new?bookId=${encodeURIComponent(book.id)}`;
  return (
    <ListCard accent={book.isPublished ? undefined : "warning"}>
      <CardHead
        aside={
          book.mrp !== null ? (
            <span>
              <span className="muted">MRP</span> <strong>{formatINR(book.mrp)}</strong>
            </span>
          ) : null
        }
      >
        <strong className="lcard__headline">{book.title}</strong>
        {book.genre && <span className="muted">{book.genre}</span>}
      </CardHead>
      <CardBody>
        <CardTitle
          title={<BookStatusBadge status={book.status} isPublished={book.isPublished} />}
          sub={
            <>
              <span className="mono">{book.isbn ?? "ISBN pending"}</span>
              <br />
              {book.publicationDate ? `Published ${formatDate(book.publicationDate)}` : "Not published yet"}
            </>
          }
        />
        {book.isPublished ? <RoyaltyStats book={book} /> : <ProductionProgress status={book.status} />}
        <PendingFigure book={book} />
      </CardBody>
      <CardFacts>
        <Fact icon={<GlobeIcon />} label="Available on">
          {book.availableOn.length ? (
            book.availableOn.map((p) => <Chip key={p}>{p}</Chip>)
          ) : (
            <span className="muted">Not listed yet</span>
          )}
        </Fact>
        {book.printPartner && (
          <Fact icon={<PrinterIcon />} label="Printed by">
            <Chip>{book.printPartner}</Chip>
          </Fact>
        )}
      </CardFacts>
      <CardFoot
        links={
          <Link to={queryUrl} className="link-action">
            Ask about royalties
          </Link>
        }
        action={
          <Link className="btn btn--primary btn--sm" to={queryUrl}>
            Ask about this book
          </Link>
        }
      />
    </ListCard>
  );
}

export function MyBooksPage() {
  const { data, isPending, error, refetch } = useMyBooks();

  return (
    <div className="stack-lg">
      <div className="page-header">
        <h1>My Books</h1>
        <Link className="btn btn--primary" to="/author/tickets/new">
          New query
        </Link>
      </div>
      {isPending ? (
        <Spinner label="Loading your books…" />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <>
          <RoyaltySummary royalty={data.royalty} />
          <section aria-labelledby="books-heading" className="stack">
            <h2 id="books-heading" className="section-title">
              Your books ({data.books.length})
            </h2>
            {data.books.length === 0 ? (
              <EmptyState
                title="No books yet"
                action={
                  <Link className="btn" to="/author/tickets/new">
                    Contact support
                  </Link>
                }
              >
                Once your book is registered with BookLeaf it will appear here with its status, sales and royalties.
              </EmptyState>
            ) : (
              <div className="card-list">
                {data.books.map((book) => (
                  <BookCard key={book.id} book={book} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
