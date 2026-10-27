/**
 * Public surface of the AI layer. The rest of the app depends only on these
 * interfaces, never on the LLM SDK, so the provider can be swapped or faked
 * in tests and the app keeps working when the AI is unavailable.
 *
 * Contract: nothing here throws because the LLM failed. Classification falls
 * back to deterministic rules; drafts fall back to KB-based templates. Callers
 * only see errors for genuinely bad input (e.g. unknown ticket id -> NotFound).
 * The one exception is draft refinement, which has no template equivalent and
 * fails with 503 AI_UNAVAILABLE.
 */
import type { AnswerDto, AnswerRequest, DraftDto, GenerateDraftOptions } from "@bookleaf/shared";

export interface ClassificationQueue {
  /** Fire-and-forget: classify the ticket in the background, persist, emit `ticket.classified`. */
  enqueue(ticketId: string): void;
  /** Re-enqueue tickets left in `pending` state (e.g. after a restart). Returns how many. */
  recoverPending(): Promise<number>;
  /** Run classification now (admin "re-run AI" action). Overwrites only non-admin fields. */
  reclassify(ticketId: string): Promise<void>;
  /** Resolves once in-flight work is done (tests, graceful shutdown). */
  drain(): Promise<void>;
}

export interface DraftService {
  /**
   * Returns the cached draft for the ticket's current state, generating one if needed. With `instruction`
   * it refines `baseDraft` instead (always calls the model, never cached; 503 AI_UNAVAILABLE without the AI).
   */
  getDraft(ticketId: string, opts: GenerateDraftOptions): Promise<DraftDto>;
}

export interface AiStatus {
  /** Key configured, not disabled, and circuit breaker closed. */
  available(): boolean;
  models(): { classify: string; draft: string };
  /** The LLM vendor in use, or null when no key is configured. */
  provider(): "gemini" | "anthropic" | null;
}

export interface AiLayer {
  classification: ClassificationQueue;
  drafts: DraftService;
  status: AiStatus;
  answers: AnswerService;
}

export interface AnswerService {
  /** Instant answer to an author's question from their own data and the KB. Falls back to a template; never fails on AI errors. */
  answer(author: { userId: string; authorId: string }, input: AnswerRequest): Promise<AnswerDto>;
}

export { createAiLayer } from "./create.js";
export { estimateCostUsd } from "./pricing.js";
