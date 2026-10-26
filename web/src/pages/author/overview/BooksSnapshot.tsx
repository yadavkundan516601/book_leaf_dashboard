import type { BookDto } from "@bookleaf/shared";
import { Link } from "react-router";
import { BookStatusBadge } from "../../../components/Badge";
import { Card, CardHeader, ProgressBar } from "../../../components/ui";
import { formatINR } from "../../../lib/format";
import { stageProgress } from "../../../lib/productionStage";

const MAX_BOOKS = 5;

function BookLine({ book }: { book: BookDto }) {
  if (!book.isPublished) {
    const progress = stageProgress(book.status);
    return (
      <div className="ah-book__state">
        <span className="ah-book__figure ah-muted">{progress ? `In production · ${progress.stage}` : "In production"}</span>
        {progress && (
          <ProgressBar
            hideLabel
            label={`Production progress for ${book.title}`}
            value={progress.step}
            max={progress.total}
            valueText={`Step ${progress.step} of ${progress.total}`}
          />
        )}
      </div>
    );
  }
  if (book.royaltyPending > 0) {
    return (
      <div className="ah-book__state">
        <span className="ah-book__figure">{formatINR(book.royaltyPending)}</span>
        <span className="ah-book__caption">pending</span>
      </div>
    );
  }
  return (
    <div className="ah-book__state">
      <span className="ah-book__figure ah-muted">{book.totalRoyaltyEarned > 0 ? "All paid" : formatINR(0)}</span>
      <span className="ah-book__caption">{book.totalRoyaltyEarned > 0 ? "nothing pending" : "pending"}</span>
    </div>
  );
}

/** Up to five books with status and either pending royalty or production progress. */
export function BooksSnapshot({ books }: { books: readonly BookDto[] }) {
  return (
    <Card as="section" className="ah-area-books" aria-labelledby="ah-books-title">
      <CardHeader
        titleId="ah-books-title"
        title="Your books"
        subtitle={books.length > MAX_BOOKS ? `Showing ${MAX_BOOKS} of ${books.length}` : undefined}
        actions={
          <Link className="ah-link" to="/author/books">
            View all<span className="ui-sr-only"> books</span>
          </Link>
        }
      />
      {books.length === 0 ? (
        <div className="ah-empty">
          <p className="ah-empty__title">No books yet</p>
          <p className="ah-empty__body">Once your book is registered with BookLeaf it appears here with its status and royalties.</p>
          <Link className="btn btn--sm" to="/author/tickets/new">
            Ask our team
          </Link>
        </div>
      ) : (
        <ul className="ah-list">
          {books.slice(0, MAX_BOOKS).map((book) => (
            <li className="ah-book" key={book.id}>
              <div className="ah-book__main">
                <span className="ah-book__title">{book.title}</span>
                <BookStatusBadge status={book.isPublished ? book.status : "In production"} isPublished={book.isPublished} />
              </div>
              <BookLine book={book} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
