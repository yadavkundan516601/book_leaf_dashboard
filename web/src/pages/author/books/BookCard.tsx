import type { BookDto } from "@bookleaf/shared";
import { Link } from "react-router";
import { GlobeIcon, PrinterIcon } from "../../../components/icons";
import { CardBody, CardFacts, CardFigure, CardFoot, CardHead, CardStat, CardStats, CardTitle, Chip, Fact, ListCard } from "../../../components/ListCard";
import { Pill, ProgressBar } from "../../../components/ui";
import { formatCount, formatDate, formatINR } from "../../../lib/format";
import { stageProgress } from "../../../lib/productionStage";

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
function ProductionProgress({ book }: { book: BookDto }) {
  const progress = stageProgress(book.status);
  if (!progress) return <p className="hb-muted">Sales and royalties appear once your book is live.</p>;
  return (
    <ProgressBar
      label={`Production stage: ${progress.stage}`}
      value={progress.step}
      max={progress.total}
      valueText={`Step ${progress.step} of ${progress.total}`}
    />
  );
}

function PendingFigure({ book }: { book: BookDto }) {
  if (!book.isPublished) return <CardFigure value="In production" tone="muted" caption="Royalties start once it's live" />;
  if (book.totalRoyaltyEarned > 0 && book.royaltyPending === 0) return <CardFigure value="All paid" tone="success" caption="No royalty pending" />;
  if (book.royaltyPending === 0) return <CardFigure value={formatINR(0)} tone="muted" caption="Royalty pending" />;
  return <CardFigure value={formatINR(book.royaltyPending)} tone="primary" caption="Royalty pending" />;
}

/** One book: status, ISBN, sales and royalty (or production progress), listings and a way to ask about it. */
export function BookCard({ book }: { book: BookDto }) {
  const queryUrl = `/author/tickets/new?bookId=${encodeURIComponent(book.id)}`;
  return (
    <ListCard accent={book.isPublished ? undefined : "warning"}>
      <CardHead
        aside={
          book.mrp !== null ? (
            <span>
              <span className="hb-muted">MRP</span> <strong>{formatINR(book.mrp)}</strong>
            </span>
          ) : null
        }
      >
        <h3 className="lcard__headline hb-book__title">{book.title}</h3>
        {book.genre && <span className="hb-muted">{book.genre}</span>}
      </CardHead>
      <CardBody>
        <CardTitle
          title={<Pill tone={book.isPublished ? "success" : "warning"}>{book.status}</Pill>}
          sub={
            <>
              <span className="mono">{book.isbn ?? "ISBN pending"}</span>
              <br />
              {book.publicationDate ? `Published ${formatDate(book.publicationDate)}` : "Not published yet"}
            </>
          }
        />
        {book.isPublished ? <RoyaltyStats book={book} /> : <ProductionProgress book={book} />}
        <PendingFigure book={book} />
      </CardBody>
      <CardFacts>
        <Fact icon={<GlobeIcon />} label="Available on">
          {book.availableOn.length ? (
            book.availableOn.map((p) => <Chip key={p}>{p}</Chip>)
          ) : (
            <span className="hb-muted">Not listed yet</span>
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
            Ask about royalties<span className="ui-sr-only"> for {book.title}</span>
          </Link>
        }
        action={
          <Link className="btn btn--primary btn--sm" to={queryUrl}>
            Ask about this book<span className="ui-sr-only">: {book.title}</span>
          </Link>
        }
      />
    </ListCard>
  );
}
