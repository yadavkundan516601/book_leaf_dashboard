/**
 * Contracts shared by the API server and the web client.
 *
 * - Enums are the single source of truth for ticket vocabulary (DB enums, AI
 *   output schemas and UI dropdowns are all derived from these arrays).
 * - Zod request schemas are used by the server for validation and by the web
 *   client for form validation, so both sides reject the same inputs.
 * - DTO types describe exactly what the API returns. Author-facing and
 *   admin-facing ticket shapes are distinct types on purpose: internal notes,
 *   AI metadata and assignment never appear in the author type.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export const ROLES = ["author", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const TICKET_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

export const TICKET_CATEGORIES = [
  "royalty_payments",
  "isbn_metadata",
  "printing_quality",
  "distribution_availability",
  "book_status_production",
  "general_inquiry",
] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  royalty_payments: "Royalty & Payments",
  isbn_metadata: "ISBN & Metadata Issues",
  printing_quality: "Printing & Quality",
  distribution_availability: "Distribution & Availability",
  book_status_production: "Book Status & Production Updates",
  general_inquiry: "General Inquiry",
};

export const TICKET_PRIORITIES = ["critical", "high", "medium", "low"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** Higher number = more urgent. Used for queue ordering. */
export const PRIORITY_RANK: Record<TicketPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Where the current category/priority value came from.
 * - ai: produced by the LLM classifier
 * - rules: produced by the deterministic fallback classifier (AI unavailable)
 * - admin: manually overridden by an operator
 */
export const CLASSIFICATION_SOURCES = ["ai", "rules", "admin"] as const;
export type ClassificationSource = (typeof CLASSIFICATION_SOURCES)[number];

export const CLASSIFICATION_STATES = ["pending", "completed"] as const;
export type ClassificationState = (typeof CLASSIFICATION_STATES)[number];

export const DRAFT_SOURCES = ["ai", "template"] as const;
export type DraftSource = (typeof DRAFT_SOURCES)[number];

export const MESSAGE_SENDERS = ["author", "admin"] as const;
export type MessageSender = (typeof MESSAGE_SENDERS)[number];

/** Response-time targets per priority (hours to first response). */
export const FIRST_RESPONSE_SLA_HOURS: Record<TicketPriority, number> = {
  critical: 4,
  high: 24,
  medium: 48,
  low: 72,
};

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

const trimmed = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(min, `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`);

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required").max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const ATTACHMENT_MAX_FILES = 3;
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

/** Metadata only: the assignment scopes attachments as UI-only. */
export const attachmentMetaSchema = z.object({
  name: z.string().trim().min(1).max(200),
  size: z.number().int().min(0).max(ATTACHMENT_MAX_BYTES),
  type: z.string().trim().max(100),
});
export type AttachmentMeta = z.infer<typeof attachmentMetaSchema>;

export const createTicketSchema = z.object({
  /** null = "General / Account Level" */
  bookId: z.string().trim().min(1).max(32).nullable(),
  subject: trimmed(5, 150, "Subject"),
  description: trimmed(20, 5000, "Description"),
  attachments: z.array(attachmentMetaSchema).max(ATTACHMENT_MAX_FILES).default([]),
});
export type CreateTicketInput = z.input<typeof createTicketSchema>;

export const createMessageSchema = z.object({
  body: trimmed(1, 10000, "Message"),
  /** Admin only: optionally move the ticket to a new status in the same action. */
  status: z.enum(TICKET_STATUSES).optional(),
  /** Admin only: whether the body started from an AI draft (for draft-acceptance metrics). */
  usedAiDraft: z.boolean().optional(),
});
export type CreateMessageInput = z.input<typeof createMessageSchema>;

export const createNoteSchema = z.object({
  body: trimmed(1, 5000, "Note"),
});
export type CreateNoteInput = z.infer<typeof createNoteSchema>;

export const updateTicketSchema = z
  .object({
    status: z.enum(TICKET_STATUSES).optional(),
    category: z.enum(TICKET_CATEGORIES).optional(),
    priority: z.enum(TICKET_PRIORITIES).optional(),
    /** null unassigns. */
    assigneeId: z.string().uuid().nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Provide at least one field to update",
  });
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

const csvEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.enum(values), z.array(z.enum(values))])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]));

export const TICKET_SORTS = ["urgency", "newest", "oldest", "updated"] as const;
export type TicketSort = (typeof TICKET_SORTS)[number];

export const listTicketsQuerySchema = z.object({
  status: csvEnum(TICKET_STATUSES),
  category: csvEnum(TICKET_CATEGORIES),
  priority: csvEnum(TICKET_PRIORITIES),
  /** "me" | "unassigned" | <admin uuid> */
  assignee: z.union([z.literal("me"), z.literal("unassigned"), z.string().uuid()]).optional(),
  authorId: z.string().trim().max(32).optional(),
  bookId: z.string().trim().max(32).optional(),
  /** Inclusive ISO date (YYYY-MM-DD) bounds on created_at. */
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  q: z.string().trim().max(200).optional(),
  sort: z.enum(TICKET_SORTS).default("urgency"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListTicketsQuery = z.input<typeof listTicketsQuerySchema>;

export const generateDraftSchema = z.object({
  /** Force a fresh generation instead of returning the cached draft. */
  regenerate: z.boolean().default(false),
});

// ---------------------------------------------------------------------------
// Response DTOs
// ---------------------------------------------------------------------------

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** Set when role = author. */
  authorId: string | null;
}

export interface AuthorDto {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  city: string | null;
  joinedDate: string | null;
}

export interface BookDto {
  id: string;
  authorId: string;
  title: string;
  isbn: string | null;
  genre: string | null;
  publicationDate: string | null;
  status: string;
  /** true when status is "Published & Live". */
  isPublished: boolean;
  mrp: number | null;
  royaltyPerCopy: number | null;
  totalCopiesSold: number;
  totalRoyaltyEarned: number;
  royaltyPaid: number;
  royaltyPending: number;
  lastRoyaltyPayoutDate: string | null;
  printPartner: string | null;
  availableOn: string[];
}

export interface RoyaltySummaryDto {
  totalEarned: number;
  totalPaid: number;
  totalPending: number;
  /** Policy threshold (INR) below which pending royalties roll over. */
  payoutThreshold: number;
  /** Whether the pending amount clears the threshold for the next cycle. */
  meetsThreshold: boolean;
  /** Close of the quarter currently accruing (YYYY-MM-DD). */
  currentQuarterEnd: string;
  /** Latest date the next payout is due under the quarterly + 45 day policy. */
  nextPayoutDueBy: string;
}

export interface MyBooksResponse {
  books: BookDto[];
  royalty: RoyaltySummaryDto;
}

export interface TicketMessageDto {
  id: string;
  sender: MessageSender;
  senderName: string;
  body: string;
  createdAt: string;
}

export interface TicketBookRef {
  id: string;
  title: string;
}

/** What an author sees. No AI metadata, no internal notes, no assignee. */
export interface AuthorTicketDto {
  id: string;
  number: number;
  reference: string;
  subject: string;
  description: string;
  status: TicketStatus;
  book: TicketBookRef | null;
  attachments: AttachmentMeta[];
  messages: TicketMessageDto[];
  createdAt: string;
  updatedAt: string;
}

export type AuthorTicketSummaryDto = Omit<AuthorTicketDto, "messages" | "description"> & {
  messageCount: number;
  lastMessageAt: string | null;
  /** True when the latest message is from the BookLeaf team. */
  awaitingAuthor: boolean;
};

export interface ClassificationDto {
  state: ClassificationState;
  category: TicketCategory | null;
  categorySource: ClassificationSource | null;
  priority: TicketPriority | null;
  prioritySource: ClassificationSource | null;
  /** What the classifier (AI or rules) originally said, kept for accuracy tracking. */
  suggestedCategory: TicketCategory | null;
  suggestedPriority: TicketPriority | null;
  confidence: number | null;
  rationale: string | null;
  classifiedAt: string | null;
}

export interface AdminRefDto {
  id: string;
  name: string;
  email: string;
}

export interface AdminTicketSummaryDto {
  id: string;
  number: number;
  reference: string;
  subject: string;
  status: TicketStatus;
  author: { id: string; name: string; email: string };
  book: TicketBookRef | null;
  classification: ClassificationDto;
  assignee: AdminRefDto | null;
  messageCount: number;
  firstRespondedAt: string | null;
  /** Hours since creation for unresolved tickets (null when resolved/closed). */
  ageHours: number | null;
  /** First-response SLA breached (no admin reply within the priority's window). */
  slaBreached: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TicketNoteDto {
  id: string;
  body: string;
  author: AdminRefDto;
  createdAt: string;
}

export interface TicketEventDto {
  id: string;
  type: string;
  actorName: string | null;
  from: string | null;
  to: string | null;
  createdAt: string;
}

export interface AdminTicketDto extends AdminTicketSummaryDto {
  description: string;
  attachments: AttachmentMeta[];
  messages: TicketMessageDto[];
  notes: TicketNoteDto[];
  events: TicketEventDto[];
  /** Author/book facts shown in the admin side panel. */
  context: {
    author: AuthorDto;
    book: BookDto | null;
    royalty: RoyaltySummaryDto;
  };
}

export interface DraftDto {
  ticketId: string;
  body: string;
  source: DraftSource;
  model: string | null;
  /** Human-readable reason when source = template (e.g. AI unavailable). */
  notice: string | null;
  /** KB sections the draft was grounded on. */
  kbSections: string[];
  createdAt: string;
  cached: boolean;
}

export interface AdminStatsDto {
  byStatus: Record<TicketStatus, number>;
  openByPriority: Record<TicketPriority, number>;
  unassignedOpen: number;
  slaBreached: number;
  ai: {
    available: boolean;
    model: string | null;
    calls24h: number;
    failures24h: number;
    inputTokens24h: number;
    outputTokens24h: number;
    estimatedCostUsd24h: number;
    /** Share of classified tickets whose category was NOT overridden by an admin. */
    categoryAgreement: number | null;
    priorityAgreement: number | null;
    /** Share of admin replies that started from an AI draft. */
    draftUsageRate: number | null;
  };
}

/** A count over the current 7-day window, the 7 days before it, and per day. */
export interface TrendDto {
  total: number;
  previousTotal: number;
  /** Exactly 7 values, one per UTC calendar day, oldest first (last = today). */
  daily: number[];
}

/** An average (hours, 1 decimal) for the current and previous window; null when nothing qualifies. */
export interface WindowedAverageDto {
  value: number | null;
  previous: number | null;
}

export interface DashboardCategoryCountDto {
  /** null = not classified yet. */
  category: TicketCategory | null;
  count: number;
}

/** Per-admin workload. "7d" is the dashboard window; "30d" the 30 UTC days ending today. */
export interface DashboardAgentDto {
  id: string;
  name: string;
  resolved7d: number;
  resolved30d: number;
  /** Admin replies sent. */
  replies7d: number;
  replies30d: number;
  /** Over tickets assigned to them whose first response was in the last 30 days. */
  avgFirstResponseHours: number | null;
}

/**
 * GET /admin/dashboard. The window is the 7 UTC calendar days ending today;
 * "previous" is the 7 days before that.
 */
export interface AdminDashboardDto {
  generatedAt: string;
  /** Tickets created. */
  created: TrendDto;
  /** Tickets whose resolved_at falls in the window. */
  resolved: TrendDto;
  /** Admin replies sent. */
  replies: TrendDto;
  /** Over tickets created in the window that have a first response. */
  avgFirstResponseHours: WindowedAverageDto;
  /** resolved_at - created_at over tickets resolved in the window. */
  avgResolutionHours: WindowedAverageDto;
  /** Open/in-progress tickets: every category (zeros included), then the unclassified (null) bucket. */
  unresolvedByCategory: DashboardCategoryCountDto[];
  /** Every admin, sorted by resolved7d desc, resolved30d desc, then name. */
  agents: DashboardAgentDto[];
  attention: {
    /** Same rule as AdminStatsDto.slaBreached. */
    slaBreached: number;
    /** Unassigned open/in-progress tickets with priority critical or high. */
    unassignedUrgent: number;
    /** Open/in-progress tickets with no admin reply yet. */
    awaitingFirstReply: number;
  };
}

/** Server-sent event payloads on GET /api/v1/events. */
export type RealtimeEvent =
  | { type: "ticket.created"; ticketId: string }
  | { type: "ticket.updated"; ticketId: string }
  | { type: "ticket.message"; ticketId: string }
  | { type: "ticket.classified"; ticketId: string };

export const ticketReference = (n: number) => `BL-${n}`;
