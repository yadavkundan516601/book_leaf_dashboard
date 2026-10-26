import type { BookDto } from "@bookleaf/shared";
import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router";
import { useMyBooks } from "../../api/hooks";
import { SearchIcon } from "../../components/icons";
import { Card, PageHeader, TabPanel, Tabs, type TabItem } from "../../components/ui";
import "../../styles/author-home.css";
import "../../styles/author-help-books.css";
import { BookCard } from "./books/BookCard";
import { inTab, matchesQuery, SORT_LABELS, sortBooks, type BookSort, type BookTab } from "./books/bookList";
import { BookCardSkeletons } from "./books/BookSkeletons";
import { RoyaltySummary } from "./books/RoyaltySummary";
import { KpiSkeletons } from "./overview/Skeletons";

const TABS_ID = "hb-book-status";
const TAB_LABELS: Record<BookTab, string> = { all: "All", live: "Live", production: "In production" };
const SORTS = Object.keys(SORT_LABELS) as BookSort[];
const isSort = (v: string): v is BookSort => v in SORT_LABELS;

/** Search, status tabs and sort over the author's books, with an empty state for "nothing matches". */
function BookList({ books }: { books: readonly BookDto[] }) {
  const searchId = useId();
  const sortId = useId();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<BookTab>("all");
  const [sort, setSort] = useState<BookSort>("title");

  const matching = useMemo(() => books.filter((b) => matchesQuery(b, query)), [books, query]);
  const visible = useMemo(() => sortBooks(matching.filter((b) => inTab(b, tab)), sort), [matching, tab, sort]);

  const tabs: TabItem<BookTab>[] = (Object.keys(TAB_LABELS) as BookTab[]).map((id) => ({
    id,
    label: TAB_LABELS[id],
    badge: matching.filter((b) => inTab(b, id)).length,
  }));

  const trimmed = query.trim();
  const otherTabMatches = tab !== "all" && matching.length > 0;

  return (
    <section className="hb-books" aria-labelledby="hb-books-title">
      <h2 id="hb-books-title" className="hb-section-title">
        Your books <span className="hb-muted">({books.length})</span>
      </h2>
      <div className="hb-toolbar">
        <div className="hb-search">
          <label htmlFor={searchId} className="ui-sr-only">
            Search your books by title or ISBN
          </label>
          <span className="hb-search__icon" aria-hidden="true">
            <SearchIcon size={16} />
          </span>
          <input
            id={searchId}
            type="search"
            placeholder="Search by title or ISBN"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Tabs id={TABS_ID} label="Filter books by status" tabs={tabs} value={tab} onChange={setTab} />
        <div className="hb-sort">
          <label htmlFor={sortId}>Sort by</label>
          <select id={sortId} value={sort} onChange={(e) => isSort(e.target.value) && setSort(e.target.value)}>
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="ui-sr-only" role="status">
        {`Showing ${visible.length} of ${books.length} ${books.length === 1 ? "book" : "books"}`}
      </p>
      <TabPanel tabsId={TABS_ID} value={tab}>
        {visible.length > 0 ? (
          <div className="card-list">
            {visible.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        ) : (
          <Card>
            <div className="hb-empty">
              <h3 className="hb-empty__title">
                {trimmed
                  ? `No books match "${trimmed}"${tab === "all" ? "" : ` under ${TAB_LABELS[tab]}`}`
                  : tab === "live"
                    ? "None of your books are live yet"
                    : "None of your books are in production right now"}
              </h3>
              <p className="hb-empty__body">
                {trimmed
                  ? otherTabMatches
                    ? "Some of your books match under a different status."
                    : "Check the spelling, or search by ISBN instead of the title."
                  : tab === "live"
                    ? "Books appear here once they are published and live. Your other books show their production stage."
                    : "All of your books are published. You'll find them under Live."}
              </p>
              <div className="hb-empty__actions">
                {tab !== "all" && (
                  <button type="button" className="btn btn--sm" onClick={() => setTab("all")}>
                    Show all books
                  </button>
                )}
                {trimmed && (
                  <button type="button" className="btn btn--sm" onClick={() => setQuery("")}>
                    Clear search
                  </button>
                )}
              </div>
            </div>
          </Card>
        )}
      </TabPanel>
    </section>
  );
}

/** The author's books with sales, royalties and production progress. */
export function MyBooksPage() {
  const { data, isPending, error, refetch } = useMyBooks();

  useEffect(() => {
    const previous = document.title;
    document.title = "My books | BookLeaf Author Support";
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="hb-page">
      <PageHeader
        breadcrumbs={[{ label: "Dashboard", to: "/author/overview" }, { label: "My books" }]}
        title="My books"
        subtitle="Sales, royalties and production progress for every book you publish with BookLeaf."
        actions={
          <Link className="btn btn--primary" to="/author/tickets/new">
            New query
          </Link>
        }
      />
      {isPending ? (
        <>
          <KpiSkeletons />
          <BookCardSkeletons />
        </>
      ) : error ? (
        <Card as="section" aria-labelledby="hb-error-title">
          <div className="hb-empty" role="alert">
            <h2 id="hb-error-title" className="hb-empty__title">
              We couldn't load your books
            </h2>
            <p className="hb-empty__body">
              {error instanceof Error ? error.message : "Something went wrong."} Please try again.
            </p>
            <div className="hb-empty__actions">
              <button type="button" className="btn btn--sm" onClick={() => void refetch()}>
                Retry
              </button>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <RoyaltySummary royalty={data.royalty} books={data.books} />
          {data.books.length === 0 ? (
            <Card as="section" aria-labelledby="hb-nobooks-title">
              <div className="hb-empty">
                <h2 id="hb-nobooks-title" className="hb-empty__title">
                  No books yet
                </h2>
                <p className="hb-empty__body">
                  Once your book is registered with BookLeaf it will appear here with its status, sales and royalties. If you
                  expected to see a book, let our team know.
                </p>
                <div className="hb-empty__actions">
                  <Link className="btn btn--primary btn--sm" to="/author/tickets/new">
                    Contact support
                  </Link>
                </div>
              </div>
            </Card>
          ) : (
            <BookList books={data.books} />
          )}
        </>
      )}
    </div>
  );
}
