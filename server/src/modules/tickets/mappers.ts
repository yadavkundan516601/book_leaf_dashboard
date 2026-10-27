/**
 * Row -> DTO mapping. Author DTOs are built from an explicit allow-list (never
 * by spreading a row or an admin DTO) so a new internal column can't leak.
 */
import {
  FIRST_RESPONSE_SLA_HOURS,
  ticketReference,
  type AdminTicketDto,
  type AdminTicketSummaryDto,
  type AuthorTicketDto,
  type AuthorTicketSummaryDto,
  type ClassificationDto,
  type TicketEventDto,
  type TicketMessageDto,
  type TicketNoteDto,
  type TicketStatus,
} from "@bookleaf/shared";
import { summarizeRoyalty, toAuthorDto, toBookDto } from "../books/mappers.js";
import type { EventRow, MessageRow, NoteRow, TicketListRow, loadContext } from "./repository.js";

type TicketRow = TicketListRow["t"];

export const isUnresolved = (s: TicketStatus) => s === "open" || s === "in_progress";

const iso = (d: Date) => d.toISOString();
const isoOrNull = (d: Date | null) => (d ? d.toISOString() : null);

export function ageHours(t: TicketRow, now: Date): number | null {
  if (!isUnresolved(t.status)) return null;
  return Math.round(((now.getTime() - t.createdAt.getTime()) / 3_600_000) * 10) / 10;
}

export function isSlaBreached(t: TicketRow, now: Date): boolean {
  if (!isUnresolved(t.status) || t.firstRespondedAt || !t.priority) return false;
  return now.getTime() - t.createdAt.getTime() > FIRST_RESPONSE_SLA_HOURS[t.priority] * 3_600_000;
}

export function toClassificationDto(t: TicketRow): ClassificationDto {
  return {
    state: t.classificationState,
    category: t.category,
    categorySource: t.categorySource,
    priority: t.priority,
    prioritySource: t.prioritySource,
    suggestedCategory: t.suggestedCategory,
    suggestedPriority: t.suggestedPriority,
    confidence: t.classificationConfidence,
    rationale: t.classificationRationale,
    classifiedAt: isoOrNull(t.classifiedAt),
    sentiment: t.aiSentiment,
    summary: t.aiSummary,
    nextAction: t.aiNextAction,
    escalate: t.aiEscalate,
    escalateReason: t.aiEscalateReason,
    language: t.aiLanguage,
  };
}

export const toMessageDto = (m: MessageRow): TicketMessageDto => ({
  id: m.id,
  sender: m.sender,
  senderName: m.senderName,
  body: m.body,
  createdAt: iso(m.createdAt),
});

export const toNoteDto = (n: NoteRow): TicketNoteDto => ({ id: n.id, body: n.body, author: n.author, createdAt: iso(n.createdAt) });

export const toEventDto = (e: EventRow): TicketEventDto => ({
  id: e.id,
  type: e.type,
  actorName: e.actorName,
  from: e.from,
  to: e.to,
  createdAt: iso(e.createdAt),
});

// --- Author-facing (allow-list) ---------------------------------------------

export function toAuthorTicketDto(row: TicketListRow, messages: MessageRow[]): AuthorTicketDto {
  const { t } = row;
  return {
    id: t.id,
    number: t.number,
    reference: ticketReference(t.number),
    subject: t.subject,
    description: t.description,
    status: t.status,
    book: row.book,
    attachments: t.attachments,
    messages: messages.map(toMessageDto),
    createdAt: iso(t.createdAt),
    updatedAt: iso(t.updatedAt),
  };
}

export function toAuthorTicketSummaryDto(row: TicketListRow): AuthorTicketSummaryDto {
  const { t } = row;
  return {
    id: t.id,
    number: t.number,
    reference: ticketReference(t.number),
    subject: t.subject,
    status: t.status,
    book: row.book,
    attachments: t.attachments,
    messageCount: row.messageCount,
    lastMessageAt: isoOrNull(row.lastMessageAt),
    awaitingAuthor: row.lastSender === "admin",
    createdAt: iso(t.createdAt),
    updatedAt: iso(t.updatedAt),
  };
}

// --- Admin-facing -------------------------------------------------------------

export function toAdminTicketSummaryDto(row: TicketListRow, now: Date): AdminTicketSummaryDto {
  const { t } = row;
  return {
    id: t.id,
    number: t.number,
    reference: ticketReference(t.number),
    subject: t.subject,
    status: t.status,
    author: row.author,
    book: row.book,
    classification: toClassificationDto(t),
    assignee: row.assignee,
    messageCount: row.messageCount,
    firstRespondedAt: isoOrNull(t.firstRespondedAt),
    ageHours: ageHours(t, now),
    slaBreached: isSlaBreached(t, now),
    createdAt: iso(t.createdAt),
    updatedAt: iso(t.updatedAt),
  };
}

export function toAdminTicketDto(
  row: TicketListRow,
  parts: {
    messages: MessageRow[];
    notes: NoteRow[];
    events: EventRow[];
    context: Awaited<ReturnType<typeof loadContext>>;
  },
  now: Date,
): AdminTicketDto {
  return {
    ...toAdminTicketSummaryDto(row, now),
    description: row.t.description,
    attachments: row.t.attachments,
    messages: parts.messages.map(toMessageDto),
    notes: parts.notes.map(toNoteDto),
    events: parts.events.map(toEventDto),
    context: {
      author: toAuthorDto(parts.context.author),
      book: parts.context.book ? toBookDto(parts.context.book) : null,
      royalty: summarizeRoyalty(parts.context.catalog, now),
    },
  };
}
