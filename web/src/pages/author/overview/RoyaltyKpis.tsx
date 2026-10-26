import type { BookDto, RoyaltySummaryDto } from "@bookleaf/shared";
import { AlarmIcon, BooksIcon, CheckCircleIcon, RefreshIcon } from "../../../components/icons";
import { KpiCard } from "../../../components/ui";
import { formatDate, formatINR } from "../../../lib/format";
import { isBelowThreshold, lastPayoutDate } from "./royalty";

/** The four royalty figures shown on the dashboard and on My Books. */
export function RoyaltyKpis({ royalty, books }: { royalty: RoyaltySummaryDto; books: readonly BookDto[] }) {
  const threshold = formatINR(royalty.payoutThreshold);
  const below = isBelowThreshold(royalty);
  const live = books.filter((b) => b.isPublished).length;
  const lastPaid = lastPayoutDate(books);

  return (
    <div className="ah-kpis">
      <KpiCard
        label="Total royalty earned"
        value={formatINR(royalty.totalEarned)}
        icon={<BooksIcon size={18} />}
        footnote={live === 1 ? "From your 1 live book" : `From your ${live} live books`}
      />
      <KpiCard
        label="Paid to you"
        value={formatINR(royalty.totalPaid)}
        tone="success"
        icon={<CheckCircleIcon size={18} />}
        footnote={lastPaid ? `Last payout ${formatDate(lastPaid)}` : "No payouts yet"}
      />
      <KpiCard
        label="Pending"
        value={formatINR(royalty.totalPending)}
        tone={below ? "warning" : "info"}
        icon={<AlarmIcon size={18} />}
        help={`Royalty you have earned that has not been paid yet. Balances under ${threshold} roll over to the next quarter.`}
        footnote={
          royalty.totalPending === 0
            ? "Nothing waiting to be paid"
            : below
              ? `Below the ${threshold} minimum, so it rolls over`
              : "Included in the next payout"
        }
      />
      <KpiCard
        label="Next payout due"
        value={formatDate(royalty.nextPayoutDueBy)}
        tone="info"
        icon={<RefreshIcon size={18} />}
        help={`Royalties are calculated quarterly and paid within 45 days of the quarter ending. Balances under ${threshold} roll over.`}
        footnote={`This quarter ends ${formatDate(royalty.currentQuarterEnd)}`}
      />
    </div>
  );
}
