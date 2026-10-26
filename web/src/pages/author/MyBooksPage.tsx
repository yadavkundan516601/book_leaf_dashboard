import type { BookDto, RoyaltySummaryDto } from "@bookleaf/shared";
import { Link } from "react-router";
import { useMyBooks } from "../../api/hooks";
import { BookStatusBadge } from "../../components/Badge";
import { EmptyState, ErrorState } from "../../components/EmptyState";
import { Spinner } from "../../components/Spinner";
import { formatCount, formatDate, formatINR } from "../../lib/format";

const DASH = "—";

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

function PaidCell({ book }: { book: BookDto }) {
  if (book.totalRoyaltyEarned > 0 && !book.lastRoyaltyPayoutDate) return <span className="muted">No payouts yet</span>;
  return (
    <>
      {formatINR(book.royaltyPaid)}
      {book.lastRoyaltyPayoutDate && (
        <div className="small muted">Last paid {formatDate(book.lastRoyaltyPayoutDate)}</div>
      )}
    </>
  );
}

function PendingCell({ book }: { book: BookDto }) {
  if (book.royaltyPending === 0 && book.totalRoyaltyEarned > 0) return <span className="text-success">All paid</span>;
  return <>{formatINR(book.royaltyPending)}</>;
}

function BookRow({ book }: { book: BookDto }) {
  return (
    <tr>
      <td data-label="Book" className="rt-title">
        <strong>{book.title}</strong>
        {book.genre && <div className="small muted">{book.genre}</div>}
      </td>
      <td data-label="Status">
        <BookStatusBadge status={book.status} isPublished={book.isPublished} />
      </td>
      <td data-label="ISBN" className="nowrap">
        {book.isbn ?? DASH}
      </td>
      <td data-label="Published" className="nowrap">
        {book.publicationDate ? formatDate(book.publicationDate) : DASH}
      </td>
      <td data-label="MRP" className="num">
        {book.mrp !== null ? formatINR(book.mrp) : DASH}
      </td>
      {book.isPublished ? (
        <>
          <td data-label="Copies sold" className="num">
            {formatCount(book.totalCopiesSold)}
          </td>
          <td data-label="Royalty earned" className="num">
            {formatINR(book.totalRoyaltyEarned)}
          </td>
          <td data-label="Paid" className="num">
            <PaidCell book={book} />
          </td>
          <td data-label="Pending" className="num">
            <PendingCell book={book} />
          </td>
        </>
      ) : (
        <td colSpan={4} data-label="Sales & royalties" className="muted">
          {DASH} Sales &amp; royalties appear once your book is live.
        </td>
      )}
      <td data-label="Available on">
        {book.availableOn.length ? book.availableOn.join(", ") : <span className="muted">{DASH}</span>}
      </td>
      <td className="rt-actions">
        <Link className="btn btn--sm" to={`/author/tickets/new?bookId=${encodeURIComponent(book.id)}`}>
          Ask about this book
        </Link>
      </td>
    </tr>
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
          <section className="card card--flush" aria-labelledby="books-heading">
            <h2 id="books-heading" className="card__title">
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
              <div className="table-scroll">
                <table className="table table--responsive">
                  <thead>
                    <tr>
                      <th scope="col">Book</th>
                      <th scope="col">Status</th>
                      <th scope="col">ISBN</th>
                      <th scope="col">Published</th>
                      <th scope="col" className="num">MRP</th>
                      <th scope="col" className="num">Copies sold</th>
                      <th scope="col" className="num">Royalty earned</th>
                      <th scope="col" className="num">Paid</th>
                      <th scope="col" className="num">Pending</th>
                      <th scope="col">Available on</th>
                      <th scope="col">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.books.map((book) => (
                      <BookRow key={book.id} book={book} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
