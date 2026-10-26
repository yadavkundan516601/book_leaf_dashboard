import type { AdminTicketDto, BookDto } from "@bookleaf/shared";
import type { ReactNode } from "react";
import { BookStatusBadge } from "../../components/Badge";
import { formatCount, formatDate, formatINR } from "../../lib/format";

function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="facts">
      {items.map(([term, value]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function BookFacts({ book }: { book: BookDto }) {
  const base: [string, ReactNode][] = [
    ["Status", <BookStatusBadge key="s" status={book.status} isPublished={book.isPublished} />],
    ["ISBN", book.isbn],
    ["Published", book.publicationDate ? formatDate(book.publicationDate) : null],
    ["MRP", book.mrp !== null ? formatINR(book.mrp) : null],
  ];
  if (!book.isPublished) {
    return (
      <>
        <Facts items={base} />
        <p className="small muted">In production: no sales or royalties yet.</p>
      </>
    );
  }
  return (
    <Facts
      items={[
        ...base,
        ["Copies sold", formatCount(book.totalCopiesSold)],
        ["Royalty / copy", book.royaltyPerCopy !== null ? formatINR(book.royaltyPerCopy) : null],
        ["Earned", formatINR(book.totalRoyaltyEarned)],
        ["Paid", formatINR(book.royaltyPaid)],
        ["Pending", formatINR(book.royaltyPending)],
        ["Last payout", book.lastRoyaltyPayoutDate ? formatDate(book.lastRoyaltyPayoutDate) : "Never"],
        ["Print partner", book.printPartner],
        ["Available on", book.availableOn.length ? book.availableOn.join(", ") : "Not listed yet"],
      ]}
    />
  );
}

/** Everything an agent needs to answer without leaving the ticket. */
export function ContextCard({ context }: { context: AdminTicketDto["context"] }) {
  const { author, book, royalty } = context;
  return (
    <section className="card stack-sm" aria-labelledby="context-heading">
      <h2 id="context-heading" className="card__title">
        Author &amp; book
      </h2>
      <h3 className="subhead">{author.name}</h3>
      <Facts
        items={[
          ["Email", <a key="e" href={`mailto:${author.email}`}>{author.email}</a>],
          ["Phone", author.phone],
          ["City", author.city],
          ["Author since", author.joinedDate ? formatDate(author.joinedDate) : null],
        ]}
      />

      <h3 className="subhead">{book ? book.title : "No specific book"}</h3>
      {book ? <BookFacts book={book} /> : <p className="small muted">The author raised this as a general / account query.</p>}

      <h3 className="subhead">Royalties (all books)</h3>
      <Facts
        items={[
          ["Earned", formatINR(royalty.totalEarned)],
          ["Paid", formatINR(royalty.totalPaid)],
          ["Pending", formatINR(royalty.totalPending)],
          ["Next payout due", formatDate(royalty.nextPayoutDueBy)],
        ]}
      />
      {royalty.totalPending > 0 && !royalty.meetsThreshold && (
        <p className="small text-warning">
          Pending is below the {formatINR(royalty.payoutThreshold)} threshold, so it rolls over to next quarter.
        </p>
      )}
    </section>
  );
}
