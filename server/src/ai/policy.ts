/**
 * Post-classification guardrails (policy v2), applied to AI and rules output
 * alike. They only ever raise priority or turn escalation on, never the
 * reverse, and each one encodes a written BookLeaf policy or a deliberate
 * safety margin rather than a model judgement. In order:
 *  1. legal         - legal threats, fraud allegations or data loss: critical + escalate (reputational and legal exposure).
 *  2. isbn_error    - ISBN error language: at least high (KB: "An ISBN error ... is a high-priority issue").
 *  3. angry_overdue - frustrated/angry author with overdue royalties: one level up, escalate when angry (our fault, and money).
 *  4. escalate_floor - anything escalated is at least high (an escalation cannot wait in the medium/low lane).
 *  5. low_confidence - confidence < 0.45 never leaves priority below medium (an unsure "low" must not bury a ticket).
 */
import { PRIORITY_RANK, TICKET_PRIORITIES, type TicketPriority } from "@bookleaf/shared";
import { ROYALTY_PAYOUT_THRESHOLD_INR } from "../lib/dates.js";
import { matchesKeyword } from "./retrieval.js";
import { hasIsbnErrorLanguage, hasLegalLanguage, type ClassificationResult } from "./rules-classifier.js";
import { daysBetween, type TicketContext } from "./ticket-context.js";

/** A quarter (up to 92 days) plus the 45-day payout window: no payout for longer than this means one was missed. */
export const OVERDUE_PAYOUT_DAYS = 137;
export const LOW_CONFIDENCE = 0.45;

export type GuardrailId = "legal" | "isbn_error" | "angry_overdue" | "escalate_floor" | "low_confidence";

/** Trusted royalty facts the policy needs; omitted when unknown (e.g. offline evaluation). */
export interface PolicyFacts {
  /** Pending royalty in INR for the ticket's book, or the author's total for account-level tickets. */
  pendingInr: number;
  /** Days since the last payout; null when there has never been one. */
  daysSinceLastPayout: number | null;
}

export interface PolicyOutcome extends ClassificationResult {
  /** Guardrails that changed the result, in the order they fired. */
  guardrails: GuardrailId[];
  /** " Policy: ..." suffix for the rationale, or "" when nothing fired. */
  policyNote: string;
}

const rank = (p: TicketPriority) => PRIORITY_RANK[p];
const atLeast = (p: TicketPriority, floor: TicketPriority): TicketPriority => (rank(p) >= rank(floor) ? p : floor);
const BY_RANK = [...TICKET_PRIORITIES].sort((a, b) => rank(a) - rank(b));
const oneUp = (p: TicketPriority): TicketPriority => BY_RANK[Math.min(BY_RANK.length - 1, BY_RANK.indexOf(p) + 1)]!;

/** Book facts for a book ticket; the author's total and most recent payout across books otherwise. */
export function policyFacts(ctx: TicketContext): PolicyFacts {
  if (ctx.book) {
    const last = ctx.book.lastRoyaltyPayoutDate;
    return { pendingInr: ctx.book.royaltyPending, daysSinceLastPayout: last ? daysBetween(last, ctx.today) : null };
  }
  const dates = ctx.authorBooks.map((b) => b.lastRoyaltyPayoutDate).filter((d): d is string => !!d).sort();
  const last = dates.at(-1);
  return { pendingInr: ctx.royalty.totalPending, daysSinceLastPayout: last ? daysBetween(last, ctx.today) : null };
}

/** Pending at or above the payout threshold and no payout within a full quarter plus the payout window (or ever). */
export function isRoyaltyOverdue(f: PolicyFacts): boolean {
  return f.pendingInr >= ROYALTY_PAYOUT_THRESHOLD_INR && (f.daysSinceLastPayout === null || f.daysSinceLastPayout > OVERDUE_PAYOUT_DAYS);
}

export function applyPolicy(result: ClassificationResult, text: string, facts?: PolicyFacts): PolicyOutcome {
  let { priority, escalate, escalateReason } = result;
  escalateReason = escalate ? escalateReason?.trim() || "Flagged for escalation by the classifier" : null;
  const guardrails: GuardrailId[] = [];
  const notes: string[] = [];
  const raiseTo = (p: TicketPriority, id: GuardrailId, note: string) => {
    if (rank(p) <= rank(priority)) return;
    priority = p;
    guardrails.push(id);
    notes.push(note);
  };
  const escalateFor = (reason: string) => {
    if (escalate) return false;
    escalate = true;
    escalateReason = reason;
    return true;
  };

  if (hasLegalLanguage(text)) {
    const raised = priority !== "critical";
    priority = "critical";
    const escalated = escalateFor("Legal threat, fraud allegation or data loss");
    if (raised || escalated) {
      guardrails.push("legal");
      notes.push(`${raised ? "raised to critical" : "kept critical"}${escalated ? " and escalated" : ""} (legal/fraud/data-loss language)`);
    }
  }

  if ((result.category === "isbn_metadata" || matchesKeyword(text, "isbn")) && hasIsbnErrorLanguage(text)) {
    raiseTo(atLeast(priority, "high"), "isbn_error", "raised to high (ISBN errors are high priority per BookLeaf policy)");
  }

  const upset = result.sentiment === "angry" || result.sentiment === "frustrated";
  if (upset && facts && isRoyaltyOverdue(facts)) {
    const before = priority;
    priority = oneUp(priority);
    const escalated = result.sentiment === "angry" && escalateFor("Angry author with overdue royalties");
    if (priority !== before || escalated) {
      guardrails.push("angry_overdue");
      notes.push(
        `${priority !== before ? `raised to ${priority}` : "kept critical"}${escalated ? " and escalated" : ""} (${result.sentiment} author, royalties overdue)`,
      );
    }
  }

  if (escalate) raiseTo(atLeast(priority, "high"), "escalate_floor", "raised to high (escalated tickets are at least high)");

  if (result.confidence < LOW_CONFIDENCE) {
    raiseTo(atLeast(priority, "medium"), "low_confidence", "raised to medium (low confidence never leaves a ticket at low)");
  }

  const policyNote = notes.length ? ` Policy: ${notes.join("; ")}.` : "";
  return {
    ...result,
    priority,
    escalate,
    escalateReason,
    rationale: `${result.rationale}${policyNote}`,
    guardrails,
    policyNote,
  };
}
