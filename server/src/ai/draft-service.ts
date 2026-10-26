/**
 * Response drafting. One LLM call per distinct ticket state: the draft is
 * keyed by a hash of everything that shapes it (KB and prompt versions,
 * model, ticket text, category, the book's status and royalty figures, and
 * the messages included), so re-opening an unchanged ticket is free and a
 * new author message produces a fresh draft. The prompt carries only the
 * retrieved KB sections, computed facts and the last few messages, never the
 * whole KB or thread.
 *
 * When the AI cannot draft (not configured, disabled, circuit open, failure,
 * unusable output) the admin gets a policy-based template instead. Templates
 * are not stored, so the next open retries the AI.
 */
import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { DraftDto, TicketCategory } from "@bookleaf/shared";
import type { Env } from "../config/env.js";
import type { Db } from "../db/client.js";
import { aiDrafts } from "../db/schema.js";
import { notFound } from "../lib/errors.js";
import type { Logger } from "../lib/logger.js";
import type { DraftService } from "./index.js";
import { KB_VERSION } from "./knowledge-base.js";
import type { GuardedLlm } from "./llm-client.js";
import { DRAFT_HISTORY_MESSAGES, DRAFT_MAX_TOKENS, DRAFT_SYSTEM, PROMPT_VERSION, buildDraftUser } from "./prompts.js";
import { AiError } from "./provider.js";
import { retrieveKb } from "./retrieval.js";
import { classifyByRules } from "./rules-classifier.js";
import { templateDraft } from "./templates.js";
import { loadRecentMessages, loadTicketContext, type MessageRow, type TicketContext } from "./ticket-context.js";

export const NOTICE_NOT_CONFIGURED =
  "AI drafting is not configured — this is a policy-based template. Review and personalise before sending.";

const UNAVAILABLE_DETAIL: Partial<Record<string, string>> = {
  circuit_open: "paused after repeated errors",
  timeout: "the AI service timed out",
  connection: "could not reach the AI service",
  rate_limited: "the AI service is rate limiting requests",
  overloaded: "the AI service is overloaded",
  refusal: "the AI declined to draft this reply",
  invalid_output: "the AI response was unusable",
};

export function unavailableNotice(err: AiError): string {
  if (err.reason === "not_configured" || err.reason === "disabled") return NOTICE_NOT_CONFIGURED;
  const detail = UNAVAILABLE_DETAIL[err.reason ?? err.kind] ?? "the AI service returned an error";
  return `AI drafting is temporarily unavailable (${detail}) — this is a policy-based template. Review and personalise before sending.`;
}

/** Output that cannot be shown as a draft: empty, or the model talking about itself instead of replying. */
const NOT_A_REPLY = /^(?:i'm sorry,? but|i am sorry,? but|i can(?:no|')t|i am unable|i'm unable|as an ai)\b/i;

function draftInputHash(env: Env, ctx: TicketContext, category: TicketCategory, messages: MessageRow[]): string {
  const b = ctx.book;
  const material = {
    kb: KB_VERSION,
    prompt: PROMPT_VERSION,
    model: env.AI_DRAFT_MODEL,
    subject: ctx.ticket.subject,
    description: ctx.ticket.description,
    category,
    book: b && {
      id: b.id,
      status: b.status,
      earned: b.totalRoyaltyEarned,
      paid: b.royaltyPaid,
      pending: b.royaltyPending,
      lastPayout: b.lastRoyaltyPayoutDate,
    },
    authorPending: ctx.royalty.totalPending,
    nextPayoutDueBy: ctx.royalty.nextPayoutDueBy,
    // The prompt states today's date and "N days since last payout", so a draft is valid for one day.
    today: ctx.today,
    messages: messages.map((m) => m.id),
  };
  return createHash("sha256").update(JSON.stringify(material)).digest("hex");
}

export function createDraftService(deps: { db: Db; log: Logger; llm: GuardedLlm; env: Env; now: () => Date }): DraftService {
  const { db, log, llm, env } = deps;

  return {
    async getDraft(ticketId, opts) {
      const ctx = await loadTicketContext(db, ticketId, deps.now());
      if (!ctx) throw notFound("Ticket");
      const { messages, omitted } = await loadRecentMessages(db, ticketId, DRAFT_HISTORY_MESSAGES);

      const { ticket } = ctx;
      const category = ticket.category ?? classifyByRules(ticket.subject, ticket.description).category;
      const latestAuthor = [...messages].reverse().find((m) => m.senderType === "author");
      const kb = retrieveKb(category, [ticket.subject, ticket.description, latestAuthor?.body ?? ""].join("\n"));
      const inputHash = draftInputHash(env, ctx, category, messages);

      if (!opts.regenerate) {
        const [hit] = await db
          .select()
          .from(aiDrafts)
          .where(and(eq(aiDrafts.ticketId, ticketId), eq(aiDrafts.inputHash, inputHash), eq(aiDrafts.source, "ai")))
          .orderBy(desc(aiDrafts.createdAt))
          .limit(1);
        if (hit) {
          return {
            ticketId,
            body: hit.body,
            source: "ai",
            model: hit.model,
            notice: hit.notice,
            kbSections: hit.kbSections,
            createdAt: hit.createdAt.toISOString(),
            cached: true,
          } satisfies DraftDto;
        }
      }

      try {
        const result = await llm.text("draft", ticketId, {
          model: env.AI_DRAFT_MODEL,
          system: DRAFT_SYSTEM,
          user: buildDraftUser({
            ctx,
            category,
            sections: kb.sections,
            examples: kb.examples,
            messages,
            omittedMessages: omitted,
          }),
          maxTokens: DRAFT_MAX_TOKENS,
        });
        const body = result.value.trim();
        if (!body || NOT_A_REPLY.test(body)) throw new AiError("invalid_output", "Draft output is empty or not a reply", result.usage);

        const [row] = await db
          .insert(aiDrafts)
          .values({ ticketId, inputHash, body, source: "ai", model: result.model, notice: null, kbSections: kb.sectionIds })
          .returning();
        return {
          ticketId,
          body,
          source: "ai",
          model: result.model,
          notice: null,
          kbSections: kb.sectionIds,
          createdAt: row!.createdAt.toISOString(),
          cached: false,
        } satisfies DraftDto;
      } catch (e) {
        if (!(e instanceof AiError)) throw e;
        log.info({ ticketId, kind: e.kind, reason: e.reason }, "draft fell back to template");
        return {
          ticketId,
          body: templateDraft(category, ctx),
          source: "template",
          model: null,
          notice: unavailableNotice(e),
          kbSections: kb.sectionIds,
          createdAt: deps.now().toISOString(),
          cached: false,
        } satisfies DraftDto;
      }
    },
  };
}
