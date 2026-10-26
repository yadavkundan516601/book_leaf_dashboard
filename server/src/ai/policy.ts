/**
 * Post-classification guardrails, applied to AI and rules output alike.
 * They only ever raise priority, never lower it, and each one is a written
 * BookLeaf policy rather than a model judgement:
 *  1. ISBN errors are high priority (KB: "An ISBN error ... is a high-priority issue").
 *  2. Legal threats, fraud allegations or data loss go straight to critical.
 */
import { PRIORITY_RANK, type TicketPriority } from "@bookleaf/shared";
import { hasIsbnErrorLanguage, hasLegalLanguage, type ClassificationResult } from "./rules-classifier.js";

function atLeast(p: TicketPriority, floor: TicketPriority): TicketPriority {
  return PRIORITY_RANK[p] >= PRIORITY_RANK[floor] ? p : floor;
}

export function applyPolicy(result: ClassificationResult, text: string): ClassificationResult {
  let priority = result.priority;
  const notes: string[] = [];
  if (hasLegalLanguage(text) && priority !== "critical") {
    priority = "critical";
    notes.push("raised to critical (legal/fraud/data-loss language)");
  }
  if (result.category === "isbn_metadata" && hasIsbnErrorLanguage(text) && PRIORITY_RANK[priority] < PRIORITY_RANK.high) {
    priority = atLeast(priority, "high");
    notes.push("raised to high (ISBN errors are high priority per BookLeaf policy)");
  }
  if (!notes.length) return result;
  return { ...result, priority, rationale: `${result.rationale} Policy: ${notes.join("; ")}.` };
}
