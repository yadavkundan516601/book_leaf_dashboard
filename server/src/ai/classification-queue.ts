/**
 * In-process classification queue. Each job asks the LLM for a category and
 * priority; any AI failure (not configured, disabled, circuit open, rate
 * limit, bad output) falls back to the deterministic rules classifier, so a
 * ticket is always classified. Written BookLeaf policy is applied on top of
 * either source. Admin overrides are never overwritten: the classifier's
 * output still lands in suggested* so agreement can be measured.
 *
 * Jobs that fail for non-AI reasons (DB errors) are logged and left
 * `pending`; `recoverPending()` retries them up to MAX_ATTEMPTS.
 */
import { and, eq, lt, sql } from "drizzle-orm";
import type { ClassificationSource } from "@bookleaf/shared";
import type { Env } from "../config/env.js";
import type { Db } from "../db/client.js";
import { ticketEvents, tickets } from "../db/schema.js";
import { notFound } from "../lib/errors.js";
import type { Logger } from "../lib/logger.js";
import type { EventBus } from "../modules/events/bus.js";
import type { ClassificationQueue } from "./index.js";
import type { GuardedLlm } from "./llm-client.js";
import { applyPolicy } from "./policy.js";
import { AiError } from "./provider.js";
import { buildClassificationUser, CLASSIFY_MAX_TOKENS, CLASSIFY_SYSTEM, classificationSchema } from "./prompts.js";
import { classifyByRules, type ClassificationResult } from "./rules-classifier.js";
import { loadTicketContext } from "./ticket-context.js";

/** Tickets that keep failing (e.g. a poisoned row) stop being retried on recovery. */
export const MAX_CLASSIFICATION_ATTEMPTS = 5;
export const RATIONALE_MAX_CHARS = 240;

export interface ClassificationQueueDeps {
  db: Db;
  bus: EventBus;
  log: Logger;
  llm: GuardedLlm;
  env: Env;
  now: () => Date;
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Truncates the classifier's own text so a policy note appended to it always survives. */
function fitRationale(base: string, policyNote: string): string {
  const full = `${base}${policyNote}`.trim();
  if (full.length <= RATIONALE_MAX_CHARS) return full;
  const room = Math.max(0, RATIONALE_MAX_CHARS - policyNote.length - 1);
  return `${base.slice(0, room).trimEnd()}…${policyNote}`;
}

export function createClassificationQueue(deps: ClassificationQueueDeps): ClassificationQueue {
  const { db, bus, log, llm, env, now } = deps;
  const concurrency = env.AI_CLASSIFY_CONCURRENCY;
  const waiting: string[] = [];
  /** Ids queued or in flight: enqueueing one again is a no-op. */
  const scheduled = new Set<string>();
  let active = 0;
  let idleWaiters: (() => void)[] = [];

  async function classify(ticketId: string): Promise<{ result: ClassificationResult; source: ClassificationSource } | null> {
    const ctx = await loadTicketContext(db, ticketId, now());
    if (!ctx) return null;
    let raw: ClassificationResult;
    let source: ClassificationSource;
    try {
      const res = await llm.structured("classify", ticketId, {
        model: env.AI_CLASSIFY_MODEL,
        system: CLASSIFY_SYSTEM,
        user: buildClassificationUser(ctx),
        schema: classificationSchema,
        maxTokens: CLASSIFY_MAX_TOKENS,
        temperature: 0,
      });
      raw = { ...res.value, rationale: res.value.rationale.trim() };
      source = "ai";
    } catch (e) {
      if (!(e instanceof AiError)) throw e;
      log.info({ ticketId, kind: e.kind, reason: e.reason }, "classifying by rules (AI unavailable)");
      raw = classifyByRules(ctx.ticket.subject, ctx.ticket.description);
      source = "rules";
    }
    const policed = applyPolicy(raw, `${ctx.ticket.subject}\n${ctx.ticket.description}`);
    return {
      source,
      result: {
        ...policed,
        confidence: clamp01(policed.confidence),
        rationale: fitRationale(raw.rationale, policed.rationale.slice(raw.rationale.length)),
      },
    };
  }

  /** Returns false when the ticket does not exist. Throws only on DB/unexpected errors. */
  async function runJob(ticketId: string): Promise<boolean> {
    const [bumped] = await db
      .update(tickets)
      .set({ classificationAttempts: sql`${tickets.classificationAttempts} + 1` })
      .where(eq(tickets.id, ticketId))
      .returning({ id: tickets.id });
    if (!bumped) return false;

    const classified = await classify(ticketId);
    if (!classified) return false;
    const { result, source } = classified;

    const authorId = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          authorId: tickets.authorId,
          categorySource: tickets.categorySource,
          prioritySource: tickets.prioritySource,
          suggestedCategory: tickets.suggestedCategory,
          suggestedPriority: tickets.suggestedPriority,
        })
        .from(tickets)
        .where(eq(tickets.id, ticketId))
        .for("update");
      if (!current) return null;

      await tx
        .update(tickets)
        .set({
          suggestedCategory: result.category,
          suggestedPriority: result.priority,
          classificationConfidence: result.confidence,
          classificationRationale: result.rationale,
          classificationState: "completed",
          classifiedAt: now(),
          ...(current.categorySource !== "admin" && { category: result.category, categorySource: source }),
          ...(current.prioritySource !== "admin" && { priority: result.priority, prioritySource: source }),
        })
        .where(eq(tickets.id, ticketId));

      await tx.insert(ticketEvents).values({
        ticketId,
        actorId: null,
        type: "classified",
        fromValue: current.suggestedCategory ? `${current.suggestedCategory}/${current.suggestedPriority}` : null,
        toValue: `${result.category}/${result.priority} via ${source}`,
      });
      return current.authorId;
    });
    if (authorId === null) return false;

    bus.publish({ type: "ticket.classified", ticketId }, authorId, { adminOnly: true });
    return true;
  }

  function settleIfIdle() {
    if (active > 0 || waiting.length > 0) return;
    const resolve = idleWaiters;
    idleWaiters = [];
    for (const r of resolve) r();
  }

  function pump() {
    while (active < concurrency && waiting.length > 0) {
      const ticketId = waiting.shift()!;
      active += 1;
      runJob(ticketId)
        .then((found) => {
          if (!found) log.warn({ ticketId }, "classification skipped: ticket not found");
        })
        .catch((e: unknown) => {
          log.error({ ticketId, err: e instanceof Error ? e.message : String(e) }, "classification failed; left pending");
        })
        .finally(() => {
          active -= 1;
          scheduled.delete(ticketId);
          pump();
          settleIfIdle();
        });
    }
  }

  function enqueue(ticketId: string) {
    if (scheduled.has(ticketId)) return;
    scheduled.add(ticketId);
    waiting.push(ticketId);
    pump();
  }

  return {
    enqueue,

    async recoverPending() {
      const rows = await db
        .select({ id: tickets.id })
        .from(tickets)
        .where(and(eq(tickets.classificationState, "pending"), lt(tickets.classificationAttempts, MAX_CLASSIFICATION_ATTEMPTS)))
        .orderBy(tickets.createdAt);
      for (const r of rows) enqueue(r.id);
      return rows.length;
    },

    async reclassify(ticketId) {
      if (!(await runJob(ticketId))) throw notFound("Ticket");
    },

    drain() {
      if (active === 0 && waiting.length === 0) return Promise.resolve();
      return new Promise<void>((resolve) => idleWaiters.push(resolve));
    },
  };
}
