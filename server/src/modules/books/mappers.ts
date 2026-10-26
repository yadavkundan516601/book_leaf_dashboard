import type { AuthorDto, BookDto, RoyaltySummaryDto } from "@bookleaf/shared";
import type { authors, books } from "../../db/schema.js";
import { ROYALTY_PAYOUT_THRESHOLD_INR, royaltyCycle } from "../../lib/dates.js";

type BookRow = typeof books.$inferSelect;
type AuthorRow = typeof authors.$inferSelect;

export const PUBLISHED_STATUS = "Published & Live";

export function toBookDto(b: BookRow): BookDto {
  return {
    id: b.id,
    authorId: b.authorId,
    title: b.title,
    isbn: b.isbn,
    genre: b.genre,
    publicationDate: b.publicationDate,
    status: b.status,
    isPublished: b.status === PUBLISHED_STATUS,
    mrp: b.mrp,
    royaltyPerCopy: b.royaltyPerCopy,
    totalCopiesSold: b.totalCopiesSold,
    totalRoyaltyEarned: b.totalRoyaltyEarned,
    royaltyPaid: b.royaltyPaid,
    royaltyPending: b.royaltyPending,
    lastRoyaltyPayoutDate: b.lastRoyaltyPayoutDate,
    printPartner: b.printPartner,
    availableOn: b.availableOn,
  };
}

export function toAuthorDto(a: AuthorRow): AuthorDto {
  return { id: a.id, name: a.name, email: a.email, phone: a.phone, city: a.city, joinedDate: a.joinedDate };
}

/** Author-level royalty position under the quarterly payout policy. */
export function summarizeRoyalty(rows: Pick<BookRow, "totalRoyaltyEarned" | "royaltyPaid" | "royaltyPending">[], today: Date): RoyaltySummaryDto {
  const sum = (f: (b: (typeof rows)[number]) => number) => rows.reduce((n, b) => n + f(b), 0);
  const totalPending = sum((b) => b.royaltyPending);
  const cycle = royaltyCycle(today);
  return {
    totalEarned: sum((b) => b.totalRoyaltyEarned),
    totalPaid: sum((b) => b.royaltyPaid),
    totalPending,
    payoutThreshold: ROYALTY_PAYOUT_THRESHOLD_INR,
    meetsThreshold: totalPending >= ROYALTY_PAYOUT_THRESHOLD_INR,
    currentQuarterEnd: cycle.currentQuarterEnd,
    nextPayoutDueBy: cycle.nextPayoutDueBy,
  };
}
