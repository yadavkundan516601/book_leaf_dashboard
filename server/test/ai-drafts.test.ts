import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { CircuitBreaker } from "../src/ai/circuit-breaker.js";
import { createDraftService, NOTICE_NOT_CONFIGURED } from "../src/ai/draft-service.js";
import { createGuardedLlm } from "../src/ai/llm-client.js";
import { DRAFT_MAX_TOKENS, DRAFT_SYSTEM } from "../src/ai/prompts.js";
import { AiError, ZERO_USAGE, type LlmProvider, type LlmRequest, type LlmResult } from "../src/ai/provider.js";
import { aiDrafts, authors, ticketMessages, tickets, users } from "../src/db/schema.js";
import { AppError } from "../src/lib/errors.js";
import { createTestApp, type TestApp } from "./helpers.js";

const AI_REPLY = "Hi Ananya,\n\nThank you for your patience.\n\nWarm regards,\nBookLeaf Author Support";
const SIGN_OFF = "Warm regards,\nBookLeaf Author Support";

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

type Behaviour = (req: LlmRequest) => Promise<LlmResult<string>>;

/** Fake LLM behind the real guarded client and breaker; records every request it receives. */
function setup(opts: { provider?: "none" } = {}) {
  const calls: LlmRequest[] = [];
  let behaviour: Behaviour = async (req) => ({ value: `  ${AI_REPLY}\n`, usage: ZERO_USAGE, model: req.model, stopReason: "end_turn" });
  const provider: LlmProvider = {
    text: async (req) => {
      calls.push(req);
      return behaviour(req);
    },
    structured: async () => {
      throw new Error("not used by drafts");
    },
  };
  const llm = createGuardedLlm({
    provider: opts.provider === "none" ? null : provider,
    disabled: false,
    breaker: new CircuitBreaker({ threshold: 3, cooldownMs: 60_000, now: () => Date.now() }),
    record: async () => {},
    log: t.ctx.log,
  });
  const svc = createDraftService({ db: t.ctx.db, log: t.ctx.log, llm, env: t.ctx.env, now: t.ctx.now });
  return {
    svc,
    calls,
    behave(fn: Behaviour) {
      behaviour = fn;
    },
  };
}

async function newTicket(authorId: string, bookId: string | null, subject: string, description: string) {
  const [row] = await t.ctx.db.insert(tickets).values({ authorId, bookId, subject, description }).returning({ id: tickets.id });
  return row!.id;
}

async function addMessage(ticketId: string, sender: "author" | "admin", body: string, createdAt: Date) {
  const [ticket] = await t.ctx.db.select().from(tickets).where(eq(tickets.id, ticketId));
  const senderId =
    sender === "author"
      ? (await t.ctx.db.select({ id: authors.userId }).from(authors).where(eq(authors.id, ticket!.authorId)))[0]!.id
      : (await t.ctx.db.select({ id: users.id }).from(users).where(eq(users.role, "admin")))[0]!.id;
  await t.ctx.db.insert(ticketMessages).values({ ticketId, senderType: sender, senderId: senderId!, body, createdAt });
}

const royaltyTicket = () =>
  newTicket(
    "AUTH003",
    "BK005",
    "No royalty received since my book launched",
    "My book Between Two Temples was published in July 2024 and I have not received a single royalty payment so far.",
  );

const storedDrafts = async (ticketId: string) => t.ctx.db.select().from(aiDrafts).where(eq(aiDrafts.ticketId, ticketId));

describe("draft service: caching", () => {
  it("serves an unchanged ticket from the cache without calling the model", async () => {
    const { svc, calls } = setup();
    const id = await royaltyTicket();

    const first = await svc.getDraft(id, { regenerate: false });
    expect(first).toMatchObject({ source: "ai", cached: false, body: AI_REPLY, model: t.ctx.env.AI_DRAFT_MODEL, notice: null });
    expect(first.kbSections).toContain("royalty");

    const second = await svc.getDraft(id, { regenerate: false });
    expect(calls).toHaveLength(1);
    expect(second).toMatchObject({ source: "ai", cached: true, body: AI_REPLY, kbSections: first.kbSections });
  });

  it("calls the model again when regeneration is requested", async () => {
    const { svc, calls } = setup();
    const id = await royaltyTicket();
    await svc.getDraft(id, { regenerate: false });
    const again = await svc.getDraft(id, { regenerate: true });
    expect(calls).toHaveLength(2);
    expect(again.cached).toBe(false);
    expect(await storedDrafts(id)).toHaveLength(2);
  });

  it("drafts afresh after a new author message, then caches that state", async () => {
    const { svc, calls } = setup();
    const id = await royaltyTicket();
    await svc.getDraft(id, { regenerate: false });

    await addMessage(id, "author", "Any update on this please?", new Date());
    const afterMessage = await svc.getDraft(id, { regenerate: false });
    expect(calls).toHaveLength(2);
    expect(afterMessage.cached).toBe(false);
    expect(calls[1]!.user).toContain("Any update on this please?");

    expect((await svc.getDraft(id, { regenerate: false })).cached).toBe(true);
    expect(calls).toHaveLength(2);
  });
});

describe("draft service: graceful degradation", () => {
  it("falls back to a fact-filled royalty template when the model fails, stores nothing, and retries next time", async () => {
    const { svc, calls, behave } = setup();
    behave(async () => {
      throw new AiError("server", "upstream 500");
    });
    const id = await royaltyTicket();

    const draft = await svc.getDraft(id, { regenerate: false });
    expect(draft.source).toBe("template");
    expect(draft.model).toBeNull();
    expect(draft.notice).toMatch(/^AI drafting is temporarily unavailable \(.+\) — this is a policy-based template/);
    expect(draft.kbSections).toContain("royalty");
    expect(draft.body).toMatch(/^Hi Ananya,/);
    for (const phrase of ["₹2,546", "14 Nov 2026", "45 days", "₹1,000", "bank details", "48 hours"]) expect(draft.body).toContain(phrase);
    expect(draft.body.endsWith(SIGN_OFF)).toBe(true);
    expect(await storedDrafts(id)).toHaveLength(0);

    behave(async (req) => ({ value: AI_REPLY, usage: ZERO_USAGE, model: req.model, stopReason: "end_turn" }));
    const retried = await svc.getDraft(id, { regenerate: false });
    expect(calls).toHaveLength(2);
    expect(retried).toMatchObject({ source: "ai", cached: false });
  });

  it("treats an empty or refusing completion as a failure", async () => {
    const { svc, behave } = setup();
    const id = await royaltyTicket();
    behave(async (req) => ({ value: "   ", usage: ZERO_USAGE, model: req.model, stopReason: "end_turn" }));
    expect((await svc.getDraft(id, { regenerate: false })).source).toBe("template");
    behave(async (req) => ({ value: "I'm sorry, but I can't help with that.", usage: ZERO_USAGE, model: req.model, stopReason: "end_turn" }));
    const draft = await svc.getDraft(id, { regenerate: false });
    expect(draft.source).toBe("template");
    expect(draft.notice).toContain("unusable");
    expect(await storedDrafts(id)).toHaveLength(0);
  });

  it("uses a template with the not-configured notice when no provider is configured", async () => {
    const { svc } = setup({ provider: "none" });
    const id = await royaltyTicket();
    const draft = await svc.getDraft(id, { regenerate: false });
    expect(draft).toMatchObject({ source: "template", notice: NOTICE_NOT_CONFIGURED, cached: false });
    expect(NOTICE_NOT_CONFIGURED).toBe(
      "AI drafting is not configured — this is a policy-based template. Review and personalise before sending.",
    );
  });

  it("writes a sensible template for an account-level general question", async () => {
    const { svc } = setup({ provider: "none" });
    const id = await newTicket(
      "AUTH004",
      null,
      "Can I update my author bio?",
      "I'd like to update the author bio that appears on my book pages to mention my new podcast. How can I do that?",
    );
    const { body, kbSections } = await svc.getDraft(id, { regenerate: false });
    expect(kbSections).toContain("metadata_updates");
    expect(body).toMatch(/^Hi Vikram,/);
    for (const phrase of ["author bio", "dashboard", "3–5 business days"]) expect(body).toContain(phrase);
    expect(body).not.toContain("undefined");
    expect(body).not.toContain("null");
    expect(body.endsWith(SIGN_OFF)).toBe(true);
  });

  it("writes a production-status template from the book's current stage", async () => {
    const { svc } = setup({ provider: "none" });
    const id = await newTicket(
      "AUTH007",
      "BK013",
      "When will Midnight in Mysore be ready?",
      "It has been three weeks and my book Midnight in Mysore is still at the cover design stage. What is the timeline?",
    );
    const { body } = await svc.getDraft(id, { regenerate: false });
    expect(body).toMatch(/^Hi Sneha,/);
    for (const phrase of ['"Midnight in Mysore"', "Cover Design stage", "Typesetting", "48 hours"]) expect(body).toContain(phrase);
    expect(body).not.toContain("₹");
    expect(body.endsWith(SIGN_OFF)).toBe(true);
  });
});

describe("draft service: prompt contents", () => {
  it("sends computed facts, the matching KB section and only the recent thread", async () => {
    const { svc, calls } = setup();
    const id = await royaltyTicket();
    const base = Date.now() - 10 * 3_600_000;
    for (let i = 1; i <= 8; i++) {
      await addMessage(id, i % 2 ? "author" : "admin", `thread-marker-${i} royalty follow-up`, new Date(base + i * 60_000));
    }

    await svc.getDraft(id, { regenerate: false });
    expect(calls).toHaveLength(1);
    const req = calls[0]!;
    expect(req.system).toBe(DRAFT_SYSTEM);
    expect(req.system).not.toContain("Ananya");
    expect(req.model).toBe(t.ctx.env.AI_DRAFT_MODEL);
    expect(req.maxTokens).toBe(DRAFT_MAX_TOKENS);

    const user = req.user;
    for (const s of ["₹2,546", "2026-11-14", "<ticket>", "</ticket>", "## Royalty Policy"]) expect(user).toContain(s);
    expect(user).not.toContain("## Printing & Quality");
    for (let i = 3; i <= 8; i++) expect(user).toContain(`thread-marker-${i} `);
    expect(user).not.toContain("thread-marker-1 ");
    expect(user).not.toContain("thread-marker-2 ");
    expect(user).toContain("(2 earlier messages omitted)");
  });
});

describe("draft service: input validation", () => {
  it("returns 404 for an unknown ticket", async () => {
    const { svc, calls } = setup();
    const err = await svc.getDraft(randomUUID(), { regenerate: false }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ status: 404 });
    expect(calls).toHaveLength(0);
  });
});
