/**
 * Shared prompt helpers. Layout rules, for quality and cost:
 * - System prompts are static strings (no dates, ids or ticket data), sent
 *   first; everything per-ticket goes in the user turn.
 * - Author-written text is untrusted: it is wrapped in tags, our own tag
 *   names are neutralised inside it, and the model is told to ignore any
 *   instructions it contains.
 */

/** Bump when prompt wording changes so cached drafts are regenerated. */
import { daysBetween, type BookRow } from "../ticket-context.js";

export const PROMPT_VERSION = "2";

/** Triage v2 adds summary, next action and escalation text: about 150-250 output tokens. */
export const RATIONALE_MAX_CHARS = 240;

export const CLASSIFY_MAX_TOKENS = 500;
export const DRAFT_MAX_TOKENS = 700;
export const DRAFT_HISTORY_MESSAGES = 6;
export const DRAFT_MESSAGE_MAX_CHARS = 800;

const TAGS = ["ticket", "conversation", "author_facts", "knowledge_base", "examples", "today", "facts", "message"];
const TAG_RE = new RegExp(`<(/?)\\s*(${TAGS.join("|")})\\b[^>]*>`, "gi");

/** Stops author text from closing our delimiters and posing as trusted context. */
export function neutralize(text: string): string {
  return text.replace(TAG_RE, (_m, slash: string, name: string) => `[${slash}${name}]`);
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}


export function lastPayoutText(b: BookRow, today: string): string {
  return b.lastRoyaltyPayoutDate
    ? `${b.lastRoyaltyPayoutDate} (${daysBetween(b.lastRoyaltyPayoutDate, today)} days ago)`
    : "none recorded";
}

