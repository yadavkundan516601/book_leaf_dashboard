import type { BookDto, RoyaltySummaryDto } from "@bookleaf/shared";
import { Link } from "react-router";
import { HelpTip } from "../../../components/ui";
import { formatDate, formatINR } from "../../../lib/format";
import { isBelowThreshold } from "../overview/royalty";
import { RoyaltyKpis } from "../overview/RoyaltyKpis";

/** What the author's pending balance means for the next payout, in plain words. */
function PendingStatus({ royalty }: { royalty: RoyaltySummaryDto }) {
  const pending = formatINR(royalty.totalPending);
  if (royalty.totalPending === 0) {
    return royalty.totalEarned === 0 ? (
      <>You haven't earned any royalty yet. Royalties start once a book is live and selling.</>
    ) : (
      <>Nothing is pending right now: every royalty you have earned so far has been paid.</>
    );
  }
  if (isBelowThreshold(royalty)) {
    return (
      <>
        Your pending <strong>{pending}</strong> is below the minimum, so it rolls over to the next quarter and is paid once
        your balance reaches {formatINR(royalty.payoutThreshold)}.
      </>
    );
  }
  return (
    <>
      Your pending <strong>{pending}</strong> will be included in the next payout, due by{" "}
      <strong>{formatDate(royalty.nextPayoutDueBy)}</strong>.
    </>
  );
}

/** Royalty KPIs shared with the dashboard, plus a callout explaining the payout rules. */
export function RoyaltySummary({ royalty, books }: { royalty: RoyaltySummaryDto; books: readonly BookDto[] }) {
  const threshold = formatINR(royalty.payoutThreshold);
  const below = isBelowThreshold(royalty);
  const allPaid = royalty.totalPending === 0 && royalty.totalEarned > 0;
  const tone = below ? "warning" : allPaid ? "success" : "info";

  return (
    <section className="hb-royalty" aria-labelledby="hb-royalty-title">
      <h2 id="hb-royalty-title" className="ui-sr-only">
        Royalty summary
      </h2>
      <RoyaltyKpis royalty={royalty} books={books} />
      <div className={`hb-callout hb-callout--${tone}`}>
        <div className="hb-callout__text">
          <h3 className="hb-callout__title">How payouts work</h3>
          <p>
            Royalties are calculated quarterly{" "}
            <HelpTip label="What does quarterly mean?">
              Royalties are worked out for each quarter of the year. The payout for a quarter is sent within 45 days of
              that quarter ending.
            </HelpTip>{" "}
            and paid by bank transfer within 45 days of the quarter ending. This quarter ends on{" "}
            {formatDate(royalty.currentQuarterEnd)}.
          </p>
          <p>
            The minimum payout is {threshold}; smaller balances roll over to the next quarter.{" "}
            <HelpTip label={`What happens below ${threshold}?`}>
              If your pending balance is under {threshold} when a quarter ends, it rolls over and is added to the next
              quarter, and it is paid once your balance reaches {threshold}.
            </HelpTip>{" "}
            <PendingStatus royalty={royalty} />
          </p>
        </div>
        <Link className="hb-link" to="/author/help">
          Read the royalty FAQ <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}
