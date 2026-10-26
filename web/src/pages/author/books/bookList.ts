import type { BookDto } from "@bookleaf/shared";

export type BookTab = "all" | "live" | "production";
export type BookSort = "title" | "pending" | "sold";

export const SORT_LABELS: Record<BookSort, string> = {
  title: "Title (A–Z)",
  pending: "Pending royalty (highest first)",
  sold: "Copies sold (most first)",
};

const compact = (s: string) => s.toLowerCase().replace(/[\s-]/g, "");

/** Title contains the query, or the ISBN does once spaces and hyphens are ignored. */
export function matchesQuery(book: BookDto, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (book.title.toLowerCase().includes(q)) return true;
  const isbnQuery = compact(q);
  return isbnQuery !== "" && book.isbn !== null && compact(book.isbn).includes(isbnQuery);
}

export const inTab = (book: BookDto, tab: BookTab) =>
  tab === "all" || (tab === "live" ? book.isPublished : !book.isPublished);

const byTitle = (a: BookDto, b: BookDto) => a.title.localeCompare(b.title, "en", { sensitivity: "base" });

export function sortBooks(books: readonly BookDto[], sort: BookSort): BookDto[] {
  const copy = [...books];
  if (sort === "title") return copy.sort(byTitle);
  const key = sort === "pending" ? (b: BookDto) => b.royaltyPending : (b: BookDto) => b.totalCopiesSold;
  return copy.sort((a, b) => key(b) - key(a) || byTitle(a, b));
}
