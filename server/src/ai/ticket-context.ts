/**
 * Loads a ticket with the author/book facts the AI needs, and derives the
 * royalty position under BookLeaf's quarterly policy. Facts are computed
 * here, deterministically, so prompts never ask the model to do date maths.
 */
import { desc, eq, sql } from "drizzle-orm";
import type { RoyaltySummaryDto } from "@bookleaf/shared";
import type { Db } from "../db/client.js";
import { authors, books, ticketMessages, tickets } from "../db/schema.js";
import { royaltyCycle, toIsoDate } from "../lib/dates.js";
import { PUBLISHED_STATUS, summarizeRoyalty } from "../modules/books/mappers.js";

export type TicketRow = typeof tickets.$inferSelect;
export type BookRow = typeof books.$inferSelect;
export type AuthorRow = typeof authors.$inferSelect;
export type MessageRow = typeof ticketMessages.$inferSelect;

export interface TicketContext {
  ticket: TicketRow;
  author: AuthorRow;
  book: BookRow | null;
  authorBooks: BookRow[];
  royalty: RoyaltySummaryDto;
  /** End of the quarter that most recently closed (its payout is due by royalty.nextPayoutDueBy while that window is open). */
  previousQuarterEnd: string;
  today: string;
}

export async function loadTicketContext(db: Db, ticketId: string, now: Date): Promise<TicketContext | null> {
  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId));
  if (!ticket) return null;
  const [author] = await db.select().from(authors).where(eq(authors.id, ticket.authorId));
  if (!author) return null;
  const authorBooks = await db.select().from(books).where(eq(books.authorId, ticket.authorId)).orderBy(books.id);
  const book = ticket.bookId ? (authorBooks.find((b) => b.id === ticket.bookId) ?? null) : null;
  return {
    ticket,
    author,
    book,
    authorBooks,
    royalty: summarizeRoyalty(authorBooks, now),
    previousQuarterEnd: royaltyCycle(now).previousQuarterEnd,
    today: toIsoDate(now),
  };
}

/** The most recent `limit` messages, oldest first, plus how many were left out. */
export async function loadRecentMessages(db: Db, ticketId: string, limit: number) {
  const rows = await db
    .select()
    .from(ticketMessages)
    .where(eq(ticketMessages.ticketId, ticketId))
    .orderBy(desc(ticketMessages.createdAt), desc(ticketMessages.id))
    .limit(limit);
  const [{ total } = { total: 0 }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(ticketMessages)
    .where(eq(ticketMessages.ticketId, ticketId));
  return { messages: rows.reverse(), omitted: Math.max(0, total - rows.length) };
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export const isPublished = (b: BookRow) => b.status === PUBLISHED_STATUS;

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);
}
