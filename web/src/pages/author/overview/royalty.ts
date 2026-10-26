import type { AuthorTicketSummaryDto, BookDto, RoyaltySummaryDto } from "@bookleaf/shared";

/** Something is pending but it is under the payout minimum, so it rolls over to the next quarter. */
export const isBelowThreshold = (royalty: RoyaltySummaryDto) => royalty.totalPending > 0 && !royalty.meetsThreshold;

/** A team reply the author has not answered yet, on a query that is still active (same rule as My Tickets). */
export const hasNewReply = (ticket: AuthorTicketSummaryDto) =>
  ticket.awaitingAuthor && (ticket.status === "open" || ticket.status === "in_progress");

/** Most recent payout date across all books, or null when nothing has been paid yet. */
export function lastPayoutDate(books: readonly BookDto[]): string | null {
  let latest: string | null = null;
  for (const book of books) {
    const date = book.lastRoyaltyPayoutDate;
    if (date && (!latest || new Date(date).getTime() > new Date(latest).getTime())) latest = date;
  }
  return latest;
}

/** First word of the account name, for a friendly greeting. */
export const firstNameOf = (name: string | undefined) => name?.trim().split(/\s+/)[0] ?? "";
