import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createAiLayer } from "../src/ai/create.js";
import { AiError, type LlmProvider, type StructuredRequest } from "../src/ai/provider.js";
import { classificationSchema, CLASSIFY_MAX_TOKENS } from "../src/ai/prompts.js";
import { aiCalls, ticketEvents, tickets } from "../src/db/schema.js";
import type { RoutedEvent } from "../src/modules/events/bus.js";
import { createTestApp, type TestApp } from "./helpers.js";

const USAGE = { inputTokens: 420, outputTokens: 60, cacheReadTokens: 0, cacheWriteTokens: 0 };

/** Fake LlmProvider: records every structured request, never touches the network. */
function fakeProvider(answer: (req: StructuredRequest<unknown>) => Promise<unknown> | unknown) {
  const calls: StructuredRequest<unknown>[] = [];
  const provider: LlmProvider = {
    async structured<T>(req: StructuredRequest<T>) {
      calls.push(req as StructuredRequest<unknown>);
      const value = req.schema.parse(await answer(req as StructuredRequest<unknown>));
      return { value, usage: USAGE, model: req.model, stopReason: "end_turn" };
    },
    async text() {
      throw new Error("text() is not used by classification");
    },
  };
  return { provider, calls };
}

const aiAnswer = (over: Partial<Record<string, unknown>> = {}) => () => ({
  rationale: "Asks when an unpublished book will be ready.",
  category: "book_status_production",
  priority: "medium",
  confidence: 0.92,
  sentiment: "concerned",
  language: "en",
  summary: "Author wants a publication date for Midnight in Mysore.",
  nextAction: "Check the current production stage and share a dated timeline.",
  escalate: false,
  escalateReason: null,
  ...over,
});

let t: TestApp | undefined;
afterEach(async () => {
  await t?.close();
  t = undefined;
});

async function boot(provider: LlmProvider, env: Record<string, string> = {}, monotonicNow?: () => number) {
  t = await createTestApp({
    env: { ANTHROPIC_API_KEY: "test-key", ...env },
    ai: (base) => createAiLayer({ ...base, provider, monotonicNow }),
  });
  return t;
}

async function ticketBySubject(app: TestApp, prefix: string) {
  const rows = await app.ctx.db.select().from(tickets);
  const row = rows.find((r) => r.subject.startsWith(prefix));
  if (!row) throw new Error(`no seeded ticket '${prefix}'`);
  return row;
}

const loadTicket = async (app: TestApp, id: string) => (await app.ctx.db.select().from(tickets).where(eq(tickets.id, id)))[0]!;

describe("classification queue", () => {
  it("persists an AI classification with event row, ai_calls row and an admin-only bus event", async () => {
    const longRationale = "x".repeat(400);
    const fake = fakeProvider(aiAnswer({ confidence: 1.4, rationale: longRationale }));
    const app = await boot(fake.provider);
    const ticket = await ticketBySubject(app, "When will Midnight in Mysore");
    const events: RoutedEvent[] = [];
    app.ctx.bus.subscribe((e) => events.push(e));

    app.ctx.ai.classification.enqueue(ticket.id);
    await app.ctx.ai.classification.drain();

    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]).toMatchObject({
      model: app.ctx.env.AI_CLASSIFY_MODEL,
      maxTokens: CLASSIFY_MAX_TOKENS,
      temperature: 0,
      schema: classificationSchema,
    });
    expect(fake.calls[0]!.user).toContain("Midnight in Mysore");

    const row = await loadTicket(app, ticket.id);
    expect(row).toMatchObject({
      category: "book_status_production",
      categorySource: "ai",
      priority: "medium",
      prioritySource: "ai",
      suggestedCategory: "book_status_production",
      suggestedPriority: "medium",
      classificationConfidence: 1,
      classificationState: "completed",
      classificationAttempts: 1,
    });
    expect(row.classifiedAt).not.toBeNull();
    expect(row.classificationRationale!.length).toBeLessThanOrEqual(240);

    const evs = await app.ctx.db.select().from(ticketEvents).where(eq(ticketEvents.ticketId, ticket.id));
    expect(evs.filter((e) => e.type === "classified")).toEqual([
      expect.objectContaining({ actorId: null, toValue: "book_status_production/medium via ai" }),
    ]);

    expect(events).toEqual([
      { event: { type: "ticket.classified", ticketId: ticket.id }, authorId: ticket.authorId, adminOnly: true },
    ]);

    const calls = await app.ctx.db.select().from(aiCalls).where(eq(aiCalls.ticketId, ticket.id));
    expect(calls).toEqual([
      expect.objectContaining({ purpose: "classify", outcome: "success", errorType: null, inputTokens: 420, outputTokens: 60 }),
    ]);
  });

  it("falls back to rules when the provider is rate limited, and records the failed call", async () => {
    const fake = fakeProvider(() => {
      throw new AiError("rate_limited", "429 Too Many Requests");
    });
    const app = await boot(fake.provider);
    const ticket = await ticketBySubject(app, "No royalty received since");

    await app.ctx.ai.classification.reclassify(ticket.id);

    expect(fake.calls).toHaveLength(1);
    const row = await loadTicket(app, ticket.id);
    expect(row).toMatchObject({
      category: "royalty_payments",
      categorySource: "rules",
      prioritySource: "rules",
      suggestedCategory: "royalty_payments",
      classificationState: "completed",
    });
    expect(row.classificationConfidence).toBeLessThanOrEqual(0.5);
    expect(row.classificationRationale).toMatch(/^Rule-based fallback/);

    const calls = await app.ctx.db.select().from(aiCalls).where(eq(aiCalls.ticketId, ticket.id));
    expect(calls).toEqual([expect.objectContaining({ outcome: "error", errorType: "rate_limited" })]);
  });

  it("opens the circuit after AI_BREAKER_THRESHOLD failures and half-opens after the cooldown", async () => {
    let clock = 0;
    let failing = true;
    const fake = fakeProvider(() => {
      if (failing) throw new AiError("server", "500");
      return aiAnswer()();
    });
    const app = await boot(
      fake.provider,
      { AI_BREAKER_THRESHOLD: "2", AI_BREAKER_COOLDOWN_MS: "60000", AI_CLASSIFY_CONCURRENCY: "1" },
      () => clock,
    );
    const ai = app.ctx.ai;

    expect(await ai.classification.recoverPending()).toBe(5);
    await ai.classification.drain();

    expect(fake.calls).toHaveLength(2);
    expect(ai.status.available()).toBe(false);
    const rows = await app.ctx.db.select().from(tickets);
    expect(rows.every((r) => r.classificationState === "completed" && r.categorySource === "rules")).toBe(true);

    clock += 59_999;
    const ticket = await ticketBySubject(app, "When will Midnight in Mysore");
    await ai.classification.reclassify(ticket.id);
    expect(fake.calls).toHaveLength(2);

    clock += 1;
    failing = false;
    expect(ai.status.available()).toBe(true);
    await ai.classification.reclassify(ticket.id);
    expect(fake.calls).toHaveLength(3);
    expect(await loadTicket(app, ticket.id)).toMatchObject({ categorySource: "ai", classificationAttempts: 3 });
  });

  it("never calls the provider without an API key, and still classifies by rules", async () => {
    const fake = fakeProvider(aiAnswer());
    t = await createTestApp({ ai: (base) => createAiLayer({ ...base, provider: fake.provider }) });
    const ai = t.ctx.ai;

    expect(ai.status.available()).toBe(false);
    expect(await ai.classification.recoverPending()).toBe(5);
    await ai.classification.drain();

    expect(fake.calls).toHaveLength(0);
    const rows = await t.ctx.db.select().from(tickets);
    expect(rows.every((r) => r.classificationState === "completed" && r.categorySource === "rules")).toBe(true);
    expect(await t.ctx.db.select().from(aiCalls)).toHaveLength(0);
  });

  it("keeps an admin override on reclassify while updating the suggestion and non-admin fields", async () => {
    const fake = fakeProvider(aiAnswer({ category: "royalty_payments", priority: "high" }));
    const app = await boot(fake.provider);
    const ticket = await ticketBySubject(app, "When will Midnight in Mysore");
    await app.ctx.db
      .update(tickets)
      .set({ category: "general_inquiry", categorySource: "admin" })
      .where(eq(tickets.id, ticket.id));

    await app.ctx.ai.classification.reclassify(ticket.id);

    expect(await loadTicket(app, ticket.id)).toMatchObject({
      category: "general_inquiry",
      categorySource: "admin",
      suggestedCategory: "royalty_payments",
      priority: "high",
      prioritySource: "ai",
      suggestedPriority: "high",
    });
    await expect(app.ctx.ai.classification.reclassify(randomUUID())).rejects.toMatchObject({ status: 404 });
  });

  it("persists the triage analysis, keeps admin overrides, and refreshes the analysis on reclassify", async () => {
    let answer = aiAnswer({
      sentiment: "angry",
      language: "hinglish",
      summary: "s".repeat(260),
      nextAction: "Confirm the publication date with production.",
      escalate: true,
      escalateReason: "Threatens a public review",
      priority: "low",
    });
    const fake = fakeProvider(() => answer());
    const app = await boot(fake.provider);
    const ticket = await ticketBySubject(app, "When will Midnight in Mysore");

    await app.ctx.ai.classification.reclassify(ticket.id);
    let row = await loadTicket(app, ticket.id);
    expect(row).toMatchObject({
      aiSentiment: "angry",
      aiLanguage: "hinglish",
      aiNextAction: "Confirm the publication date with production.",
      aiEscalate: true,
      aiEscalateReason: "Threatens a public review",
      priority: "high", // escalate_floor guardrail lifts the model's "low"
      prioritySource: "ai",
    });
    expect(row.aiSummary!.length).toBeLessThanOrEqual(200);
    expect(row.classificationRationale).toMatch(/Policy: raised to high \(escalated tickets/);
    let evs = await app.ctx.db.select().from(ticketEvents).where(eq(ticketEvents.ticketId, ticket.id));
    expect(evs.find((e) => e.type === "classified")?.toValue).toBe("book_status_production/high via ai, escalate");

    // An admin overrides priority; the next run refreshes the analysis but keeps the override.
    await app.ctx.db.update(tickets).set({ priority: "low", prioritySource: "admin" }).where(eq(tickets.id, ticket.id));
    answer = aiAnswer({ summary: "Author asks for a publication date.", sentiment: "calm", escalate: false, escalateReason: "stale" });
    await app.ctx.ai.classification.reclassify(ticket.id);
    row = await loadTicket(app, ticket.id);
    expect(row).toMatchObject({
      priority: "low",
      prioritySource: "admin",
      suggestedPriority: "medium",
      aiSentiment: "calm",
      aiLanguage: "en",
      aiSummary: "Author asks for a publication date.",
      aiEscalate: false,
      aiEscalateReason: null,
    });
    evs = await app.ctx.db.select().from(ticketEvents).where(eq(ticketEvents.ticketId, ticket.id));
    expect(evs.filter((e) => e.type === "classified").map((e) => e.toValue)).toContain("book_status_production/medium via ai");
  });

  it("fills the triage analysis from rules when the AI is unavailable", async () => {
    const fake = fakeProvider(() => {
      throw new AiError("server", "500");
    });
    const app = await boot(fake.provider);
    const ticket = await ticketBySubject(app, "No royalty received since");
    await app.ctx.ai.classification.reclassify(ticket.id);
    const row = await loadTicket(app, ticket.id);
    expect(row.categorySource).toBe("rules");
    expect(row.aiSentiment).toMatch(/^(calm|concerned|frustrated|angry)$/);
    expect(row.aiLanguage).toBe("en");
    expect(row.aiSummary).toBeTruthy();
    expect(row.aiNextAction).toMatch(/payout ledger/);
  });

  it("recoverPending classifies the seeded pending tickets and leaves nothing to recover", async () => {
    const fake = fakeProvider(aiAnswer());
    const app = await boot(fake.provider);
    const ai = app.ctx.ai;

    expect(await ai.classification.recoverPending()).toBe(5);
    await ai.classification.drain();

    const rows = await app.ctx.db.select().from(tickets);
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.classificationState === "completed" && r.categorySource === "ai")).toBe(true);
    expect(await ai.classification.recoverPending()).toBe(0);
  });

  it("de-dupes queued ids and respects the concurrency limit", async () => {
    let active = 0;
    let maxActive = 0;
    const fake = fakeProvider(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 15));
      active -= 1;
      return aiAnswer()();
    });
    const app = await boot(fake.provider, { AI_CLASSIFY_CONCURRENCY: "2" });
    const q = app.ctx.ai.classification;
    const ticket = await ticketBySubject(app, "When will Midnight in Mysore");

    q.enqueue(ticket.id);
    q.enqueue(ticket.id);
    q.enqueue(ticket.id);
    q.enqueue(randomUUID());
    await q.drain();
    expect(fake.calls).toHaveLength(1);
    expect((await loadTicket(app, ticket.id)).classificationAttempts).toBe(1);

    for (const r of await app.ctx.db.select({ id: tickets.id }).from(tickets)) q.enqueue(r.id);
    await q.drain();
    expect(fake.calls).toHaveLength(6);
    expect(maxActive).toBe(2);
  });
});
