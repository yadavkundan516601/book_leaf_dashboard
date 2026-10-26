/**
 * Database schema (PostgreSQL via Drizzle ORM).
 *
 * Design notes
 * - Authors/books keep the business IDs from the source system (AUTH001,
 *   BK001) as primary keys so support staff and the dataset speak the same
 *   language. Everything created by this app uses UUIDs.
 * - Money is stored as numeric(12,2) INR; the dataset is whole rupees but real
 *   royalty calculations are not.
 * - Internal notes live in their own table instead of a `visibility` flag on
 *   messages: an author-facing query physically cannot select them, so a
 *   forgotten WHERE clause can't leak them.
 * - The ticket row stores both the *suggested* classification (what the
 *   AI/rules said) and the *effective* one (possibly admin-overridden), so we
 *   can measure classifier agreement over time.
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  CLASSIFICATION_SOURCES,
  CLASSIFICATION_STATES,
  DRAFT_SOURCES,
  MESSAGE_SENDERS,
  ROLES,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type AttachmentMeta,
} from "@bookleaf/shared";

export const roleEnum = pgEnum("user_role", ROLES);
export const ticketStatusEnum = pgEnum("ticket_status", TICKET_STATUSES);
export const ticketCategoryEnum = pgEnum("ticket_category", TICKET_CATEGORIES);
export const ticketPriorityEnum = pgEnum("ticket_priority", TICKET_PRIORITIES);
export const classificationSourceEnum = pgEnum("classification_source", CLASSIFICATION_SOURCES);
export const classificationStateEnum = pgEnum("classification_state", CLASSIFICATION_STATES);
export const draftSourceEnum = pgEnum("draft_source", DRAFT_SOURCES);
export const messageSenderEnum = pgEnum("message_sender", MESSAGE_SENDERS);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const money = (name: string) => numeric(name, { precision: 12, scale: 2, mode: "number" });

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    role: roleEnum("role").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_lower_uq").on(sql`lower(${t.email})`)],
);

export const authors = pgTable("authors", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  city: text("city"),
  joinedDate: date("joined_date"),
  createdAt: createdAt(),
});

export const books = pgTable(
  "books",
  {
    id: text("id").primaryKey(),
    authorId: text("author_id")
      .notNull()
      .references(() => authors.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    isbn: text("isbn"),
    genre: text("genre"),
    publicationDate: date("publication_date"),
    status: text("status").notNull(),
    mrp: money("mrp"),
    royaltyPerCopy: money("royalty_per_copy"),
    totalCopiesSold: integer("total_copies_sold").notNull().default(0),
    totalRoyaltyEarned: money("total_royalty_earned").notNull().default(0),
    royaltyPaid: money("royalty_paid").notNull().default(0),
    royaltyPending: money("royalty_pending").notNull().default(0),
    lastRoyaltyPayoutDate: date("last_royalty_payout_date"),
    printPartner: text("print_partner"),
    availableOn: text("available_on").array().notNull().default(sql`'{}'::text[]`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("books_author_idx").on(t.authorId)],
);

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Human-friendly sequence shown as BL-<number>. */
    number: serial("number").notNull().unique(),
    authorId: text("author_id")
      .notNull()
      .references(() => authors.id, { onDelete: "cascade" }),
    bookId: text("book_id").references(() => books.id, { onDelete: "set null" }),
    subject: text("subject").notNull(),
    description: text("description").notNull(),
    attachments: jsonb("attachments").$type<AttachmentMeta[]>().notNull().default([]),
    status: ticketStatusEnum("status").notNull().default("open"),

    // Effective classification (what the queue filters/sorts on).
    category: ticketCategoryEnum("category"),
    categorySource: classificationSourceEnum("category_source"),
    priority: ticketPriorityEnum("priority"),
    prioritySource: classificationSourceEnum("priority_source"),

    // Classifier output, preserved even after an admin override.
    classificationState: classificationStateEnum("classification_state").notNull().default("pending"),
    suggestedCategory: ticketCategoryEnum("suggested_category"),
    suggestedPriority: ticketPriorityEnum("suggested_priority"),
    classificationConfidence: real("classification_confidence"),
    classificationRationale: text("classification_rationale"),
    classificationAttempts: integer("classification_attempts").notNull().default(0),
    classifiedAt: timestamp("classified_at", { withTimezone: true }),

    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    firstRespondedAt: timestamp("first_responded_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("tickets_author_idx").on(t.authorId, t.createdAt),
    index("tickets_queue_idx").on(t.status, t.priority, t.createdAt),
    index("tickets_assignee_idx").on(t.assigneeId),
    index("tickets_classification_state_idx").on(t.classificationState),
  ],
);

/** Conversation visible to the author: their messages and BookLeaf responses. */
export const ticketMessages = pgTable(
  "ticket_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    senderType: messageSenderEnum("sender_type").notNull(),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    usedAiDraft: boolean("used_ai_draft").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("ticket_messages_ticket_idx").on(t.ticketId, t.createdAt)],
);

/** Internal-only notes. Never joined into author-facing queries. */
export const ticketNotes = pgTable(
  "ticket_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("ticket_notes_ticket_idx").on(t.ticketId, t.createdAt)],
);

/** Append-only audit trail of state changes (status, overrides, assignment). */
export const ticketEvents = pgTable(
  "ticket_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id),
    type: text("type").notNull(),
    fromValue: text("from_value"),
    toValue: text("to_value"),
    createdAt: createdAt(),
  },
  (t) => [index("ticket_events_ticket_idx").on(t.ticketId, t.createdAt)],
);

/**
 * Cached response drafts. `inputHash` covers everything the draft depends on
 * (ticket text, thread, category, KB version, model), so re-opening an
 * unchanged ticket never pays for a second generation.
 */
export const aiDrafts = pgTable(
  "ai_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    inputHash: text("input_hash").notNull(),
    body: text("body").notNull(),
    source: draftSourceEnum("source").notNull(),
    model: text("model"),
    notice: text("notice"),
    kbSections: text("kb_sections").array().notNull().default(sql`'{}'::text[]`),
    createdAt: createdAt(),
  },
  (t) => [index("ai_drafts_ticket_idx").on(t.ticketId, t.createdAt)],
);

/** One row per LLM call: the basis for cost, latency and reliability reporting. */
export const aiCalls = pgTable(
  "ai_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id").references(() => tickets.id, { onDelete: "set null" }),
    purpose: text("purpose").notNull(),
    model: text("model").notNull(),
    outcome: text("outcome").notNull(),
    errorType: text("error_type"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("ai_calls_created_idx").on(t.createdAt)],
);

// Relations (used by the relational query builder)
export const usersRelations = relations(users, ({ one }) => ({
  author: one(authors, { fields: [users.id], references: [authors.userId] }),
}));

export const authorsRelations = relations(authors, ({ one, many }) => ({
  user: one(users, { fields: [authors.userId], references: [users.id] }),
  books: many(books),
  tickets: many(tickets),
}));

export const booksRelations = relations(books, ({ one }) => ({
  author: one(authors, { fields: [books.authorId], references: [authors.id] }),
}));

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  author: one(authors, { fields: [tickets.authorId], references: [authors.id] }),
  book: one(books, { fields: [tickets.bookId], references: [books.id] }),
  assignee: one(users, { fields: [tickets.assigneeId], references: [users.id] }),
  messages: many(ticketMessages),
  notes: many(ticketNotes),
  events: many(ticketEvents),
}));

export const ticketMessagesRelations = relations(ticketMessages, ({ one }) => ({
  ticket: one(tickets, { fields: [ticketMessages.ticketId], references: [tickets.id] }),
  sender: one(users, { fields: [ticketMessages.senderId], references: [users.id] }),
}));

export const ticketNotesRelations = relations(ticketNotes, ({ one }) => ({
  ticket: one(tickets, { fields: [ticketNotes.ticketId], references: [tickets.id] }),
  author: one(users, { fields: [ticketNotes.authorId], references: [users.id] }),
}));

export const ticketEventsRelations = relations(ticketEvents, ({ one }) => ({
  ticket: one(tickets, { fields: [ticketEvents.ticketId], references: [tickets.id] }),
  actor: one(users, { fields: [ticketEvents.actorId], references: [users.id] }),
}));
