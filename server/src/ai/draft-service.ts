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
 *
 * Refinement (shorter, warmer, ...) rewrites the admin's current text: it
 * always calls the model and is never cached or stored. Without the AI it
 * fails with AI_UNAVAILABLE, since refining into a template means nothing.
 *
 * Every draft carries its grounding (the figures, dates and timelines it may
 * quote) and the result of `checkDraft` against it.
 */
import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  POLICY_DURATIONS,
  checkDraft,
  extractAmounts,
  extractDurations,
  type DraftDto,
  type DraftGrounding,
  type GenerateDraftOptions,
  type TicketCategory,
} from "@bookleaf/shared";
import type { Env } from "../config/env.js";
import type { Db } from "../db/client.js";
import { aiDrafts } from "../db/schema.js";
import { AppError, notFound } from "../lib/errors.js";
import { ROYALTY_PAYOUT_WINDOW_DAYS } from "../lib/dates.js";
import type { Logger } from "../lib/logger.js";
import type { DraftService } from "./index.js";
import { KB_VERSION, type KbSection } from "./knowledge-base.js";
import type { GuardedLlm } from "./llm-client.js";
import {
  DRAFT_HISTORY_MESSAGES,
  DRAFT_MAX_TOKENS,
  DRAFT_PROMPT_VERSION,
  DRAFT_SYSTEM,
  PROMPT_VERSION,
  buildDraftUser,
  buildRefineUser,
} from "./prompts.js";
import { AiError } from "./provider.js";
import { retrieveKb } from "./retrieval.js";
import { classifyByRules } from "./rules-classifier.js";
import { templateDraft } from "./templates.js";
import { daysBetween, firstName, loadRecentMessages, loadTicketContext, type MessageRow, type TicketContext } from "./ticket-context.js";

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
  auth: "the AI key was rejected, check GEMINI_API_KEY",
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
    draftPrompt: DRAFT_PROMPT_VERSION,
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

const uniq = <T,>(xs: T[]) => [...new Set(xs)];

/**
 * What a reply to this ticket may quote: every figure and date the prompt shows the model (author facts,
 * royalty position, today), the timelines in the retrieved KB sections plus BookLeaf's policy durations,
 * and figures the author stated themselves (echoing them back is not inventing them).
 */
export function buildGrounding(ctx: TicketContext, sections: readonly KbSection[], authorTexts: readonly string[]): DraftGrounding {
  const { royalty: r } = ctx;
  const amounts: number[] = [r.totalEarned, r.totalPaid, r.totalPending, r.payoutThreshold];
  const dates: string[] = [ctx.today, r.nextPayoutDueBy, r.currentQuarterEnd, ctx.previousQuarterEnd, ctx.ticket.createdAt.toISOString().slice(0, 10)];
  const numbers: number[] = [ctx.authorBooks.length, ROYALTY_PAYOUT_WINDOW_DAYS];
  for (const b of ctx.authorBooks) {
    amounts.push(b.totalRoyaltyEarned, b.royaltyPaid, b.royaltyPending);
    if (b.mrp != null) amounts.push(b.mrp);
    if (b.royaltyPerCopy != null) amounts.push(b.royaltyPerCopy);
    numbers.push(b.totalCopiesSold);
    if (b.publicationDate) dates.push(b.publicationDate);
    if (b.lastRoyaltyPayoutDate) {
      dates.push(b.lastRoyaltyPayoutDate);
      numbers.push(daysBetween(b.lastRoyaltyPayoutDate, ctx.today));
    }
  }
  const allowedPhrases = [...POLICY_DURATIONS, ...sections.flatMap((s) => extractDurations(s.body).map((d) => d.text))];
  for (const text of authorTexts) {
    amounts.push(...extractAmounts(text).map((a) => a.value));
    allowedPhrases.push(...extractDurations(text).map((d) => d.text));
    for (const m of text.matchAll(/\b\d[\d,]*\b/g)) numbers.push(Number(m[0].replace(/,/g, "")));
  }
  return {
    firstName: firstName(ctx.author.name),
    amounts: uniq(amounts.filter(Number.isFinite)),
    dates: uniq(dates),
    numbers: uniq(numbers.filter(Number.isFinite)),
    allowedPhrases: uniq(allowedPhrases),
  };
}

function withCheck(draft: Omit<DraftDto, "grounding" | "warnings" | "checklist">, grounding: DraftGrounding): DraftDto {
  return { ...draft, grounding, ...checkDraft(draft.body, grounding) };
}

export const AI_UNAVAILABLE = "AI_UNAVAILABLE";

export function createDraftService(deps: { db: Db; log: Logger; llm: GuardedLlm; env: Env; now: () => Date }): DraftService {
  const { db, log, llm, env } = deps;

  return {
    // Wider than DraftService's `{ regenerate }`: the tickets route passes the whole parsed request body.
    async getDraft(ticketId: string, opts: Pick<GenerateDraftOptions, "regenerate"> & Partial<GenerateDraftOptions>) {
      const ctx = await loadTicketContext(db, ticketId, deps.now());
      if (!ctx) throw notFound("Ticket");
      const { messages, omitted } = await loadRecentMessages(db, ticketId, DRAFT_HISTORY_MESSAGES);

      const { ticket } = ctx;
      const category = ticket.category ?? classifyByRules(ticket.subject, ticket.description).category;
      const latestAuthor = [...messages].reverse().find((m) => m.senderType === "author");
      const kb = retrieveKb(category, [ticket.subject, ticket.description, latestAuthor?.body ?? ""].join("\n"));
      const authorTexts = [ticket.subject, ticket.description, ...messages.filter((m) => m.senderType === "author").map((m) => m.body)];
      const grounding = buildGrounding(ctx, kb.sections, authorTexts);

      if (opts.instruction) {
        if (!opts.baseDraft) throw new AppError(400, "VALIDATION_ERROR", "Request validation failed", [{ field: "baseDraft", message: "Write or draft a reply first, then refine it" }]);
        try {
          const result = await llm.text("draft", ticketId, {
            model: env.AI_DRAFT_MODEL,
            system: DRAFT_SYSTEM,
            user: buildRefineUser({
              ctx,
              sections: kb.sections,
              latestAuthorMessage: latestAuthor?.body ?? null,
              baseDraft: opts.baseDraft,
              instruction: opts.instruction,
              customInstruction: opts.customInstruction,
            }),
            maxTokens: DRAFT_MAX_TOKENS,
          });
          const body = result.value.trim();
          if (!body || NOT_A_REPLY.test(body)) throw new AiError("invalid_output", "Refined output is empty or not a reply", result.usage);
          return withCheck(
            { ticketId, body, source: "ai", model: result.model, notice: null, kbSections: kb.sectionIds, createdAt: deps.now().toISOString(), cached: false },
            grounding,
          );
        } catch (e) {
          if (!(e instanceof AiError)) throw e;
          log.info({ ticketId, kind: e.kind, reason: e.reason }, "draft refinement unavailable");
          const detail = e.reason === "not_configured" || e.reason === "disabled" ? "AI drafting is not configured" : "AI drafting is temporarily unavailable";
          throw new AppError(503, AI_UNAVAILABLE, `${detail}, so the reply can't be refined right now. Your text is unchanged; edit it directly.`);
        }
      }

      const inputHash = draftInputHash(env, ctx, category, messages);

      if (!opts.regenerate) {
        const [hit] = await db
          .select()
          .from(aiDrafts)
          .where(and(eq(aiDrafts.ticketId, ticketId), eq(aiDrafts.inputHash, inputHash), eq(aiDrafts.source, "ai")))
          .orderBy(desc(aiDrafts.createdAt))
          .limit(1);
        if (hit) {
          return withCheck(
            {
              ticketId,
              body: hit.body,
              source: "ai",
              model: hit.model,
              notice: hit.notice,
              kbSections: hit.kbSections,
              createdAt: hit.createdAt.toISOString(),
              cached: true,
            },
            grounding,
          );
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
        return withCheck(
          {
            ticketId,
            body,
            source: "ai",
            model: result.model,
            notice: null,
            kbSections: kb.sectionIds,
            createdAt: row!.createdAt.toISOString(),
            cached: false,
          },
          grounding,
        );
      } catch (e) {
        if (!(e instanceof AiError)) throw e;
        log.info({ ticketId, kind: e.kind, reason: e.reason }, "draft fell back to template");
        return withCheck(
          {
            ticketId,
            body: templateDraft(category, ctx),
            source: "template",
            model: null,
            notice: unavailableNotice(e),
            kbSections: kb.sectionIds,
            createdAt: deps.now().toISOString(),
            cached: false,
          },
          grounding,
        );
      }
    },
  };
}

