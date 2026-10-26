/**
 * Ticket business rules. Every method takes the acting user and enforces
 * ownership itself, so routes stay thin and RBAC can't be skipped by a new
 * route forgetting a check.
 *
 * Realtime events are published only after the transaction commits, so a
 * client that refetches on an event always sees the committed state.
 */
import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import type {
  AdminTicketDto,
  AdminTicketSummaryDto,
  AuthorTicketDto,
  AuthorTicketSummaryDto,
  DraftDto,
  Paginated,
  TicketMessageDto,
  TicketNoteDto,
  TicketStatus,
  createMessageSchema,
  createTicketSchema,
  listTicketsQuerySchema,
  updateTicketSchema,
} from "@bookleaf/shared";
import type { AppContext } from "../../context.js";
import { books, ticketEvents, ticketMessages, ticketNotes, tickets } from "../../db/schema.js";
import { AppError, forbidden, notFound, validationError } from "../../lib/errors.js";
import type { AuthUser } from "../../middleware/auth.js";
import {
  isUnresolved,
  toAdminTicketDto,
  toAdminTicketSummaryDto,
  toAuthorTicketDto,
  toAuthorTicketSummaryDto,
  toMessageDto,
  toNoteDto,
} from "./mappers.js";
import {
  findAdmin,
  findTicket,
  listEvents,
  listMessages,
  listNotes,
  listTickets,
  loadContext,
  type TicketFilters,
  type TicketListRow,
  type Tx,
} from "./repository.js";

type CreateTicket = z.output<typeof createTicketSchema>;
type CreateMessage = z.output<typeof createMessageSchema>;
type UpdateTicket = z.output<typeof updateTicketSchema>;
type ListQuery = z.output<typeof listTicketsQuerySchema>;

type NewEvent = Omit<typeof ticketEvents.$inferInsert, "ticketId">;

const ticketNotFound = () => notFound("Ticket");

/** resolvedAt follows status: set on entering resolved/closed (kept if already set), cleared on reopening. */
const resolvedAtFor = (status: TicketStatus, current: Date | null, now: Date) => (isUnresolved(status) ? null : (current ?? now));

export type TicketService = ReturnType<typeof createTicketService>;

export function createTicketService(ctx: AppContext) {
  const { db } = ctx;

  async function insertEvents(tx: Tx, ticketId: string, events: NewEvent[]) {
    if (events.length) await tx.insert(ticketEvents).values(events.map((e) => ({ ...e, ticketId })));
  }

  /** Author scope: unknown and foreign tickets are indistinguishable (404) to avoid id probing. */
  async function requireVisible(user: AuthUser, id: string): Promise<TicketListRow> {
    const row = await findTicket(db, id);
    if (!row || (user.role === "author" && row.t.authorId !== user.authorId)) throw ticketNotFound();
    return row;
  }

  async function adminDetailOf(row: TicketListRow): Promise<AdminTicketDto> {
    const [messages, notes, events, context] = await Promise.all([
      listMessages(db, row.t.id),
      listNotes(db, row.t.id),
      listEvents(db, row.t.id),
      loadContext(db, row.t.authorId, row.t.bookId),
    ]);
    return toAdminTicketDto(row, { messages, notes, events, context }, ctx.now());
  }

  /** Re-read after a write so the response reflects the committed state. */
  async function adminDetail(id: string): Promise<AdminTicketDto> {
    const row = await findTicket(db, id);
    if (!row) throw ticketNotFound();
    return adminDetailOf(row);
  }

  async function authorDetail(id: string): Promise<AuthorTicketDto> {
    const row = await findTicket(db, id);
    if (!row) throw ticketNotFound();
    return toAuthorTicketDto(row, await listMessages(db, id));
  }

  function authorIdOf(user: AuthUser): string {
    if (!user.authorId) throw forbidden();
    return user.authorId;
  }

  return {
    async create(user: AuthUser, input: CreateTicket): Promise<AuthorTicketDto> {
      const authorId = authorIdOf(user);
      if (input.bookId) {
        const [book] = await db
          .select({ id: books.id })
          .from(books)
          .where(and(eq(books.id, input.bookId), eq(books.authorId, authorId)));
        if (!book) throw validationError([{ field: "bookId", message: "Choose one of your books, or General / Account Level" }]);
      }

      const now = ctx.now();
      const id = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(tickets)
          .values({
            authorId,
            bookId: input.bookId,
            subject: input.subject,
            description: input.description,
            attachments: input.attachments,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: tickets.id });
        await insertEvents(tx, created!.id, [{ actorId: user.id, type: "created", createdAt: now }]);
        return created!.id;
      });

      ctx.bus.publish({ type: "ticket.created", ticketId: id }, authorId);
      // Fire-and-forget: the ticket is saved whether or not classification can run right now.
      try {
        ctx.ai.classification.enqueue(id);
      } catch (err) {
        ctx.log.error({ err, ticketId: id }, "failed to enqueue classification");
      }
      return authorDetail(id);
    },

    async list(
      user: AuthUser,
      query: ListQuery,
    ): Promise<Paginated<AuthorTicketSummaryDto> | Paginated<AdminTicketSummaryDto>> {
      const page = { sort: query.sort, page: query.page, pageSize: query.pageSize };
      const filters: TicketFilters = {
        status: query.status,
        category: query.category,
        priority: query.priority,
        bookId: query.bookId,
        from: query.from,
        to: query.to,
        q: query.q,
      };
      if (user.role === "author") {
        // Admin-only filters (assignee, authorId) are ignored; the scope comes from the session.
        const { rows, total } = await listTickets(db, { ...filters, authorId: authorIdOf(user) }, page);
        return { data: rows.map(toAuthorTicketSummaryDto), page: query.page, pageSize: query.pageSize, total };
      }
      const assignee = query.assignee === "me" ? user.id : query.assignee;
      const { rows, total } = await listTickets(db, { ...filters, authorId: query.authorId, assignee }, page);
      const now = ctx.now();
      return { data: rows.map((r) => toAdminTicketSummaryDto(r, now)), page: query.page, pageSize: query.pageSize, total };
    },

    async get(user: AuthUser, id: string): Promise<AuthorTicketDto | AdminTicketDto> {
      const row = await requireVisible(user, id);
      return user.role === "author" ? toAuthorTicketDto(row, await listMessages(db, id)) : adminDetailOf(row);
    },

    async update(user: AuthUser, id: string, input: UpdateTicket): Promise<AdminTicketDto> {
      const { t, assignee } = await requireVisible(user, id);

      let nextAssignee = assignee;
      if (input.assigneeId) {
        nextAssignee = (await findAdmin(db, input.assigneeId)) ?? null;
        if (!nextAssignee) throw validationError([{ field: "assigneeId", message: "Assignee must be a BookLeaf team member" }]);
      } else if (input.assigneeId === null) {
        nextAssignee = null;
      }

      const now = ctx.now();
      const patch: Partial<typeof tickets.$inferInsert> = {};
      const events: NewEvent[] = [];
      const event = (type: string, from: string | null, to: string | null) =>
        events.push({ type, actorId: user.id, fromValue: from, toValue: to, createdAt: now });

      if (input.status && input.status !== t.status) {
        patch.status = input.status;
        patch.resolvedAt = resolvedAtFor(input.status, t.resolvedAt, now);
        event("status_changed", t.status, input.status);
      }
      if (input.category && input.category !== t.category) {
        Object.assign(patch, { category: input.category, categorySource: "admin" });
        event("category_changed", t.category, input.category);
      }
      if (input.priority && input.priority !== t.priority) {
        Object.assign(patch, { priority: input.priority, prioritySource: "admin" });
        event("priority_changed", t.priority, input.priority);
      }
      if (input.assigneeId !== undefined && nextAssignee?.id !== assignee?.id) {
        patch.assigneeId = nextAssignee?.id ?? null;
        // Names (not ids) so the audit trail reads as it did at the time.
        event(nextAssignee ? "assigned" : "unassigned", assignee?.name ?? null, nextAssignee?.name ?? null);
      }

      if (events.length) {
        await db.transaction(async (tx) => {
          await tx.update(tickets).set({ ...patch, updatedAt: now }).where(eq(tickets.id, id));
          await insertEvents(tx, id, events);
        });
        // Authors only hear about changes they can see (status); overrides and assignment are internal.
        ctx.bus.publish({ type: "ticket.updated", ticketId: id }, t.authorId, { adminOnly: patch.status === undefined });
      }
      return adminDetail(id);
    },

    async addMessage(user: AuthUser, id: string, input: CreateMessage): Promise<TicketMessageDto> {
      const { t, assignee } = await requireVisible(user, id);
      const now = ctx.now();
      const patch: Partial<typeof tickets.$inferInsert> = { updatedAt: now };
      const events: NewEvent[] = [];
      let usedAiDraft = false;

      if (user.role === "author") {
        if (t.status === "closed") {
          throw new AppError(409, "TICKET_CLOSED", "This ticket is closed. Please raise a new ticket if you still need help.");
        }
        if (t.status === "resolved") {
          Object.assign(patch, { status: "open", resolvedAt: null });
          events.push({ type: "status_changed", actorId: user.id, fromValue: t.status, toValue: "open", createdAt: now });
        }
      } else {
        usedAiDraft = input.usedAiDraft ?? false;
        if (!t.firstRespondedAt) patch.firstRespondedAt = now;
        const nextStatus = input.status ?? (t.status === "open" ? "in_progress" : t.status);
        if (nextStatus !== t.status) {
          Object.assign(patch, { status: nextStatus, resolvedAt: resolvedAtFor(nextStatus, t.resolvedAt, now) });
          events.push({ type: "status_changed", actorId: user.id, fromValue: t.status, toValue: nextStatus, createdAt: now });
        }
        if (!assignee) {
          patch.assigneeId = user.id;
          events.push({ type: "assigned", actorId: user.id, fromValue: null, toValue: user.name, createdAt: now });
        }
      }

      const messageId = await db.transaction(async (tx) => {
        const [m] = await tx
          .insert(ticketMessages)
          .values({ ticketId: id, senderType: user.role, senderId: user.id, body: input.body, usedAiDraft, createdAt: now })
          .returning({ id: ticketMessages.id });
        await tx.update(tickets).set(patch).where(eq(tickets.id, id));
        await insertEvents(tx, id, events);
        return m!.id;
      });

      ctx.bus.publish({ type: "ticket.message", ticketId: id }, t.authorId);
      return toMessageDto({ id: messageId, sender: user.role, senderName: user.name, body: input.body, createdAt: now });
    },

    async addNote(user: AuthUser, id: string, body: string): Promise<TicketNoteDto> {
      const { t } = await requireVisible(user, id);
      const now = ctx.now();
      // Notes deliberately leave tickets.updated_at alone: the author can see that timestamp.
      const [note] = await db
        .insert(ticketNotes)
        .values({ ticketId: id, authorId: user.id, body, createdAt: now })
        .returning({ id: ticketNotes.id });
      ctx.bus.publish({ type: "ticket.updated", ticketId: id }, t.authorId, { adminOnly: true });
      return toNoteDto({ id: note!.id, body, author: { id: user.id, name: user.name, email: user.email }, createdAt: now });
    },

    async draft(user: AuthUser, id: string, regenerate: boolean): Promise<DraftDto> {
      await requireVisible(user, id);
      return ctx.ai.drafts.getDraft(id, { regenerate });
    },

    async reclassify(user: AuthUser, id: string): Promise<AdminTicketDto> {
      await requireVisible(user, id);
      await ctx.ai.classification.reclassify(id);
      return adminDetail(id);
    },
  };
}
