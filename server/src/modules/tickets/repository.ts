/**
 * Ticket queries. Filtering, sorting and pagination happen in SQL so the
 * queue stays correct (and cheap) regardless of how many tickets exist.
 */
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  FIRST_RESPONSE_SLA_HOURS,
  PRIORITY_RANK,
  TICKET_PRIORITIES,
  type TicketCategory,
  type TicketPriority,
  type TicketSort,
  type TicketStatus,
} from "@bookleaf/shared";
import type { Db } from "../../db/client.js";
import { authors, books, ticketEvents, ticketMessages, ticketNotes, tickets, users } from "../../db/schema.js";
import { addDays } from "../../lib/dates.js";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type Queryable = Db | Tx;

export const UNRESOLVED_STATUSES = ["open", "in_progress"] as const satisfies readonly TicketStatus[];

const assignee = alias(users, "assignee");

/** Columns every ticket read needs: the row plus the refs shown in lists and detail views. */
const coreColumns = {
  t: tickets,
  author: { id: authors.id, name: authors.name, email: authors.email },
  book: { id: books.id, title: books.title },
  assignee: { id: assignee.id, name: assignee.name, email: assignee.email },
};

const coreFrom = (db: Queryable) =>
  db
    .select({
      ...coreColumns,
      messageCount: sql<number>`(select count(*)::int from ${ticketMessages} where ${ticketMessages.ticketId} = ${tickets.id})`.mapWith(Number),
      lastMessageAt: sql<Date | null>`(select max(${ticketMessages.createdAt}) from ${ticketMessages} where ${ticketMessages.ticketId} = ${tickets.id})`.mapWith(
        ticketMessages.createdAt,
      ),
      lastSender: sql<string | null>`(select ${ticketMessages.senderType} from ${ticketMessages} where ${ticketMessages.ticketId} = ${tickets.id} order by ${ticketMessages.createdAt} desc limit 1)`,
    })
    .from(tickets)
    .innerJoin(authors, eq(authors.id, tickets.authorId))
    .leftJoin(books, eq(books.id, tickets.bookId))
    .leftJoin(assignee, eq(assignee.id, tickets.assigneeId));

export type TicketListRow = Awaited<ReturnType<typeof coreFrom>>[number];

export interface TicketFilters {
  /** Hard scope for authors; set from the session, never from the query string. */
  authorId?: string;
  status?: TicketStatus[];
  category?: TicketCategory[];
  priority?: TicketPriority[];
  /** "unassigned" or an admin user id ("me" is resolved by the caller). */
  assignee?: string;
  bookId?: string;
  from?: string;
  to?: string;
  q?: string;
}

const isUnresolvedSql = sql`${tickets.status} in ('open', 'in_progress')`;

/** NULL priority means "still classifying": ranked between high and medium so it is looked at promptly. */
const PENDING_PRIORITY_RANK = (PRIORITY_RANK.high + PRIORITY_RANK.medium) / 2;
const priorityRankSql = sql`case ${tickets.priority} ${sql.join(
  TICKET_PRIORITIES.map((p) => sql.raw(`when '${p}' then ${PRIORITY_RANK[p]}`)),
  sql` `,
)} else ${sql.raw(String(PENDING_PRIORITY_RANK))} end`;

const slaHoursSql = sql`case ${tickets.priority} ${sql.join(
  TICKET_PRIORITIES.map((p) => sql.raw(`when '${p}' then ${FIRST_RESPONSE_SLA_HOURS[p]}`)),
  sql` `,
)} end`;

/** Unresolved, never answered, classified, and older than its priority's first-response window. */
export const slaBreachedSql = (now: Date) =>
  sql`(${isUnresolvedSql} and ${tickets.firstRespondedAt} is null and ${tickets.priority} is not null
    and ${tickets.createdAt} + make_interval(hours => ${slaHoursSql}) < ${now.toISOString()}::timestamptz)`;

/**
 * Urgency: unresolved first, then priority, then (within the same priority)
 * tickets the classifier flagged for escalation, then oldest first.
 */
const ORDER_BY: Record<TicketSort, SQL[]> = {
  urgency: [
    sql`case when ${isUnresolvedSql} then 0 else 1 end`,
    sql`${priorityRankSql} desc`,
    sql`case when ${isUnresolvedSql} and ${tickets.aiEscalate} then 0 else 1 end`,
    asc(tickets.createdAt),
    asc(tickets.number),
  ],
  newest: [desc(tickets.createdAt), desc(tickets.number)],
  oldest: [asc(tickets.createdAt), asc(tickets.number)],
  updated: [desc(tickets.updatedAt), desc(tickets.number)],
};

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function whereClause(f: TicketFilters): SQL | undefined {
  const conds: (SQL | undefined)[] = [];
  if (f.authorId) conds.push(eq(tickets.authorId, f.authorId));
  if (f.status?.length) conds.push(inArray(tickets.status, f.status));
  if (f.category?.length) conds.push(inArray(tickets.category, f.category));
  if (f.priority?.length) conds.push(inArray(tickets.priority, f.priority));
  if (f.assignee === "unassigned") conds.push(isNull(tickets.assigneeId));
  else if (f.assignee) conds.push(eq(tickets.assigneeId, f.assignee));
  if (f.bookId) conds.push(eq(tickets.bookId, f.bookId));
  if (f.from) conds.push(gte(tickets.createdAt, new Date(`${f.from}T00:00:00.000Z`)));
  if (f.to) conds.push(lt(tickets.createdAt, addDays(new Date(`${f.to}T00:00:00.000Z`), 1)));
  if (f.q) {
    const pattern = `%${escapeLike(f.q)}%`;
    const ref = /^(?:bl-?)?(\d{1,9})$/i.exec(f.q);
    conds.push(
      or(
        ilike(tickets.subject, pattern),
        ilike(tickets.description, pattern),
        ilike(authors.name, pattern),
        ref ? eq(tickets.number, Number(ref[1])) : undefined,
      ),
    );
  }
  return and(...conds);
}

export async function listTickets(
  db: Queryable,
  filters: TicketFilters,
  opts: { sort: TicketSort; page: number; pageSize: number },
): Promise<{ rows: TicketListRow[]; total: number }> {
  const where = whereClause(filters);
  const [rows, [totalRow]] = await Promise.all([
    coreFrom(db)
      .where(where)
      .orderBy(...ORDER_BY[opts.sort])
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize),
    db.select({ n: count() }).from(tickets).innerJoin(authors, eq(authors.id, tickets.authorId)).where(where),
  ]);
  return { rows, total: totalRow?.n ?? 0 };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns undefined for unknown *and* malformed ids, so both surface as 404 rather than a SQL error. */
export async function findTicket(db: Queryable, id: string): Promise<TicketListRow | undefined> {
  if (!UUID_RE.test(id)) return undefined;
  const [row] = await coreFrom(db).where(eq(tickets.id, id));
  return row;
}

export const ticketExists = async (db: Queryable, id: string) => (await findTicket(db, id)) !== undefined;

export function listMessages(db: Queryable, ticketId: string) {
  return db
    .select({
      id: ticketMessages.id,
      sender: ticketMessages.senderType,
      senderName: users.name,
      body: ticketMessages.body,
      createdAt: ticketMessages.createdAt,
    })
    .from(ticketMessages)
    .innerJoin(users, eq(users.id, ticketMessages.senderId))
    .where(eq(ticketMessages.ticketId, ticketId))
    .orderBy(asc(ticketMessages.createdAt));
}
export type MessageRow = Awaited<ReturnType<typeof listMessages>>[number];

export function listNotes(db: Queryable, ticketId: string) {
  return db
    .select({
      id: ticketNotes.id,
      body: ticketNotes.body,
      author: { id: users.id, name: users.name, email: users.email },
      createdAt: ticketNotes.createdAt,
    })
    .from(ticketNotes)
    .innerJoin(users, eq(users.id, ticketNotes.authorId))
    .where(eq(ticketNotes.ticketId, ticketId))
    .orderBy(asc(ticketNotes.createdAt));
}
export type NoteRow = Awaited<ReturnType<typeof listNotes>>[number];

export function listEvents(db: Queryable, ticketId: string) {
  return db
    .select({
      id: ticketEvents.id,
      type: ticketEvents.type,
      actorName: users.name,
      from: ticketEvents.fromValue,
      to: ticketEvents.toValue,
      createdAt: ticketEvents.createdAt,
    })
    .from(ticketEvents)
    .leftJoin(users, eq(users.id, ticketEvents.actorId))
    .where(eq(ticketEvents.ticketId, ticketId))
    .orderBy(asc(ticketEvents.createdAt));
}
export type EventRow = Awaited<ReturnType<typeof listEvents>>[number];

/** Full author + book rows and the author's whole catalog, for the admin side panel. */
export async function loadContext(db: Queryable, authorId: string, bookId: string | null) {
  const [[author], catalog] = await Promise.all([
    db.select().from(authors).where(eq(authors.id, authorId)),
    db.select().from(books).where(eq(books.authorId, authorId)).orderBy(asc(books.id)),
  ]);
  if (!author) throw new Error(`ticket author ${authorId} missing`);
  return { author, catalog, book: catalog.find((b) => b.id === bookId) ?? null };
}

export async function findAdmin(db: Queryable, userId: string) {
  if (!UUID_RE.test(userId)) return undefined;
  const [row] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.role, "admin")));
  return row;
}
