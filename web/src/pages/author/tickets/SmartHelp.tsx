import type { BookDto, MyBooksResponse } from "@bookleaf/shared";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Card, CardHeader, HelpTip, ProgressBar, Skeleton } from "../../../components/ui";
import { formatDate, formatINR } from "../../../lib/format";
import { PRODUCTION_STAGES, type StageProgress } from "../../../lib/productionStage";

/** Shared frame: an answer from the author's own data, with "answered" / "still need help" choices. */
function HelpCard({
  title,
  subtitle,
  answeredTo,
  onNeedHelp,
  children,
}: {
  title: string;
  subtitle: string;
  answeredTo: string;
  onNeedHelp: () => void;
  children: ReactNode;
}) {
  return (
    <Card as="section" className="nq-help" aria-label={title}>
      <CardHeader title={title} subtitle={subtitle} as="h3" />
      {children}
      <div className="nq-help__actions">
        <p className="nq-help__question">Does this answer your question?</p>
        <Link to={answeredTo} className="btn">
          That answers my question
        </Link>
        <button type="button" className="btn btn--primary" onClick={onNeedHelp}>
          I still need help
        </button>
      </div>
    </Card>
  );
}

function Stat({ label, value, help }: { label: string; value: ReactNode; help?: ReactNode }) {
  return (
    <div className="nq-stat">
      <dt className="nq-stat__label">
        {label}
        {help}
      </dt>
      <dd className="nq-stat__value">{value}</dd>
    </div>
  );
}

const latestPayout = (books: BookDto[]) =>
  books.reduce<string | null>(
    (latest, b) => (b.lastRoyaltyPayoutDate && (!latest || b.lastRoyaltyPayoutDate > latest) ? b.lastRoyaltyPayoutDate : latest),
    null,
  );

/** Royalty topic: pending amount, last payout, next due date and the payout policy, from the author's data. */
export function RoyaltyHelp({ data, onNeedHelp }: { data: MyBooksResponse | undefined; onNeedHelp: () => void }) {
  const subtitle = "Many royalty questions are answered by these numbers.";
  if (!data) {
    return (
      <HelpCard title="Your royalty at a glance" subtitle={subtitle} answeredTo="/author/overview" onNeedHelp={onNeedHelp}>
        <div className="nq-stats nq-stats--loading" role="status">
          <span className="ui-sr-only">Loading your royalty details…</span>
          {[0, 1, 2].map((i) => (
            <div className="nq-stat" key={i} aria-hidden="true">
              <Skeleton width="60%" height={12} radius={0} />
              <Skeleton width="80%" height={22} radius={0} />
            </div>
          ))}
        </div>
      </HelpCard>
    );
  }
  const { royalty, books } = data;
  const last = latestPayout(books);
  const minimum = formatINR(royalty.payoutThreshold);
  let standing: string;
  if (royalty.totalPending <= 0) {
    standing = "Nothing is pending right now: every royalty earned so far has been paid.";
  } else if (royalty.meetsThreshold) {
    standing = `Your pending ${formatINR(royalty.totalPending)} is above the ${minimum} minimum, so it's due to be paid by ${formatDate(royalty.nextPayoutDueBy)}.`;
  } else {
    standing = `Your pending ${formatINR(royalty.totalPending)} is below the ${minimum} minimum, so it rolls over and is added to the next quarter's amount.`;
  }

  return (
    <HelpCard title="Your royalty at a glance" subtitle={subtitle} answeredTo="/author/overview" onNeedHelp={onNeedHelp}>
      <dl className="nq-stats">
        <Stat label="Pending" value={formatINR(royalty.totalPending)} />
        <Stat label="Last payout" value={last ? formatDate(last) : "No payouts yet"} />
        <Stat
          label="Next payout due by"
          value={formatDate(royalty.nextPayoutDueBy)}
          help={
            <HelpTip label="How is the payout date worked out?">
              Royalties are added up at the end of each quarter (the current one closes on{" "}
              {formatDate(royalty.currentQuarterEnd)}) and paid within 45 days of that date.
            </HelpTip>
          }
        />
      </dl>
      <p className="nq-help__standing">{standing}</p>
      <p className="nq-help__policy">
        Royalties are calculated quarterly and paid within 45 days of the quarter's end. A payout is made once at least{" "}
        {minimum} is pending; smaller amounts roll over to the next quarter.{" "}
        <HelpTip label="What is the payout minimum?">
          If your pending royalty is under {minimum} when a quarter closes, nothing is lost: it is carried forward and
          paid with a later quarter once the total reaches {minimum}.
        </HelpTip>
      </p>
    </HelpCard>
  );
}

/** Book-progress topic with a book in production: where it is in the pipeline. */
export function ProgressHelp({
  book,
  progress,
  onNeedHelp,
}: {
  book: BookDto;
  progress: StageProgress;
  onNeedHelp: () => void;
}) {
  const next = PRODUCTION_STAGES[progress.step];
  return (
    <HelpCard
      title={`Where “${book.title}” is now`}
      subtitle="This is the latest stage recorded for your book."
      answeredTo="/author/books"
      onNeedHelp={onNeedHelp}
    >
      <ProgressBar
        label="Production progress"
        value={progress.step}
        max={progress.total}
        valueText={`Stage ${progress.step} of ${progress.total}`}
      />
      <dl className="nq-stats">
        <Stat label="Current stage" value={progress.stage} />
        <Stat label="Next stage" value={next ?? "None: this is the last stage"} />
      </dl>
      <p className="nq-help__policy">
        Each book moves through {progress.total} stages, from manuscript received to published and live. You can
        follow every stage on My Books.
      </p>
    </HelpCard>
  );
}
