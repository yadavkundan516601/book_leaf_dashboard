import type { MyBooksResponse } from "@bookleaf/shared";
import { useEffect } from "react";
import { useAuthorTickets, useMyBooks } from "../../api/hooks";
import { useAuth } from "../../auth/AuthProvider";
import { Card, CardHeader } from "../../components/ui";
import { formatINR } from "../../lib/format";
import "../../styles/author-home.css";
import { BooksSnapshot } from "./overview/BooksSnapshot";
import { NeedHelpCard } from "./overview/NeedHelpCard";
import { nextAction } from "./overview/nextAction";
import { NextActionStrip } from "./overview/NextActionStrip";
import { RecentQueries } from "./overview/RecentQueries";
import { firstNameOf, hasNewReply } from "./overview/royalty";
import { RoyaltyByBook } from "./overview/RoyaltyByBook";
import { RoyaltyKpis } from "./overview/RoyaltyKpis";
import { ChartSkeleton, KpiSkeletons, ListSkeleton } from "./overview/Skeletons";
import { WelcomeBanner } from "./overview/WelcomeBanner";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function statusSummary(data: MyBooksResponse | undefined, isPending: boolean): string {
  if (isPending) return "Getting your latest numbers…";
  if (!data || data.books.length === 0) return "Your books, royalties and queries, all in one place.";
  const live = data.books.filter((b) => b.isPublished).length;
  const inProduction = data.books.length - live;
  const parts = [live > 0 && `${live} live`, inProduction > 0 && `${inProduction} in production`].filter(Boolean).join(" and ");
  const books = `You have ${plural(data.books.length, "book", "books")} (${parts})`;
  return data.royalty.totalPending > 0
    ? `${books} and ${formatINR(data.royalty.totalPending)} in pending royalty.`
    : `${books} and no royalty waiting to be paid.`;
}

/** Author home: greeting, next step, royalty figures, books and recent queries. */
export function OverviewPage() {
  const { user } = useAuth();
  const books = useMyBooks();
  const recent = useAuthorTickets({ pageSize: 4, sort: "updated" });
  // Same query as the sidebar badge, so the "new replies" count comes from the cache instead of a second request.
  const allTickets = useAuthorTickets({ pageSize: 100, sort: "updated" });

  useEffect(() => {
    const previous = document.title;
    document.title = "Dashboard | BookLeaf Author Support";
    return () => {
      document.title = previous;
    };
  }, []);

  const newReplies = allTickets.data?.data.filter(hasNewReply).length ?? 0;
  // Wait for the ticket list too, so the strip does not flip from "all caught up" to "new replies".
  const ticketsSettled = !allTickets.isPending || allTickets.isError;
  const action = books.data && ticketsSettled ? nextAction(books.data.royalty, newReplies) : null;

  return (
    <div className="ah-page">
      <WelcomeBanner firstName={firstNameOf(user?.name)} summary={statusSummary(books.data, books.isPending)} />

      {!books.isError && <NextActionStrip action={action} />}

      {books.isPending ? (
        <>
          <KpiSkeletons />
          <div className="ah-grid">
            <Card as="section" className="ah-area-royalty" aria-labelledby="ah-royalty-loading">
              <CardHeader titleId="ah-royalty-loading" title="Royalty by book" />
              <ChartSkeleton label="Loading royalty by book…" />
            </Card>
            <Card as="section" className="ah-area-books" aria-labelledby="ah-books-loading">
              <CardHeader titleId="ah-books-loading" title="Your books" />
              <ListSkeleton rows={4} label="Loading your books…" />
            </Card>
          </div>
        </>
      ) : books.isError ? (
        <Card as="section" aria-labelledby="ah-error-title">
          <div className="ah-empty" role="alert">
            <h2 id="ah-error-title" className="ah-empty__title">
              We couldn't load your books and royalties
            </h2>
            <p className="ah-empty__body">
              {books.error instanceof Error ? books.error.message : "Something went wrong."} Please try again.
            </p>
            <button type="button" className="btn btn--sm" onClick={() => void books.refetch()}>
              Try again
            </button>
          </div>
        </Card>
      ) : (
        <>
          <RoyaltyKpis royalty={books.data.royalty} books={books.data.books} />
          <div className="ah-grid">
            <RoyaltyByBook books={books.data.books} royalty={books.data.royalty} />
            <BooksSnapshot books={books.data.books} />
          </div>
        </>
      )}

      <div className="ah-grid">
        <RecentQueries
          tickets={recent.data?.data}
          isPending={recent.isPending}
          error={recent.error}
          onRetry={() => void recent.refetch()}
        />
        <NeedHelpCard />
      </div>
    </div>
  );
}
