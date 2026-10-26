import type { BookDto, RoyaltySummaryDto } from "@bookleaf/shared";
import { Link } from "react-router";
import { BarChart, Card, CardHeader, DonutChart } from "../../../components/ui";
import { formatINR } from "../../../lib/format";

/** Earned (donut) and pending (bars) royalty per live book. */
export function RoyaltyByBook({ books, royalty }: { books: readonly BookDto[]; royalty: RoyaltySummaryDto }) {
  const live = books.filter((b) => b.isPublished);
  const pending = live.filter((b) => b.royaltyPending > 0);

  return (
    <Card as="section" className="ah-area-royalty" aria-labelledby="ah-royalty-title">
      <CardHeader
        titleId="ah-royalty-title"
        title="Royalty by book"
        subtitle="What each live book has earned, and what is still waiting to be paid"
        actions={
          <Link className="ah-link" to="/author/books">
            View details
          </Link>
        }
      />
      {live.length === 0 ? (
        <div className="ah-empty">
          <p className="ah-empty__title">Your royalties appear here once a book is live</p>
          <p className="ah-empty__body">While a book is in production you can follow its progress on My Books.</p>
          <Link className="btn btn--sm" to="/author/books">
            Track my books
          </Link>
        </div>
      ) : (
        <div className="ah-royalty">
          <div className="ah-royalty__part">
            <h3 className="ah-subtitle">Earned so far (₹)</h3>
            <DonutChart
              label="Royalty earned by book, in rupees"
              segments={live.map((b) => ({ label: b.title, value: b.totalRoyaltyEarned }))}
              centerValue={formatINR(royalty.totalEarned)}
              centerLabel="Total earned"
              size={170}
              emptyMessage="No royalty earned yet. Earnings show here after the first sales are recorded."
            />
          </div>
          <div className="ah-royalty__part">
            <h3 className="ah-subtitle">Pending payout</h3>
            <BarChart
              label="Pending royalty by book"
              items={pending.map((b) => ({ label: b.title, value: b.royaltyPending }))}
              valueFormatter={formatINR}
              emptyMessage="Nothing pending: every royalty earned so far has been paid."
            />
          </div>
        </div>
      )}
    </Card>
  );
}
