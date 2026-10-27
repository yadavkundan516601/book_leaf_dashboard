/** POST /tickets/:id/draft: request validation, access, and refinement through the route. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAiLayer } from "../src/ai/create.js";
import { AiError, type LlmProvider, type LlmRequest } from "../src/ai/provider.js";
import { ADMIN_EMAIL, createTestApp, loginAs, type TestApp } from "./helpers.js";
import { fakeAi, tickingClock, type FakeAi } from "./fake-ai.js";

type Agent = Awaited<ReturnType<typeof loginAs>>;

const newTicket = {
  bookId: "BK001",
  subject: "Royalty for Q2 not received",
  description: "I have not received my royalty payment for the last quarter even though sales are showing.",
};
const BASE = "Hi Priya,\n\nYour royalty is on its way.\n\nWarm regards,\nBookLeaf Author Support";
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

let t: TestApp;
let ai: FakeAi;
let priya: Agent;
let admin: Agent;

beforeAll(async () => {
  ai = fakeAi();
  t = await createTestApp({ ai: ai.factory, now: tickingClock() });
  [priya, admin] = await Promise.all([loginAs(t.app, "priya.sharma@email.com"), loginAs(t.app, ADMIN_EMAIL)]);
});
afterAll(() => t.close());

async function ticketAs(author: Agent) {
  const res = await author.post("/api/v1/tickets").send(newTicket);
  expect(res.status).toBe(201);
  return res.body.id as string;
}

const requestsFor = (id: string) => ai.draftRequests.filter((r) => r.ticketId === id);

describe("POST /tickets/:id/draft: validation", () => {
  it("still accepts an empty body and defaults regenerate to false", async () => {
    const id = await ticketAs(priya);
    const res = await admin.post(`/api/v1/tickets/${id}/draft`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ticketId: id, grounding: expect.any(Object), warnings: [], checklist: [] });
    expect(requestsFor(id)).toEqual([{ ticketId: id, regenerate: false }]);
  });

  it("rejects an unknown instruction with field details", async () => {
    const id = await ticketAs(priya);
    const res = await admin.post(`/api/v1/tickets/${id}/draft`).send({ instruction: "louder", baseDraft: BASE });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details).toEqual([expect.objectContaining({ field: "instruction" })]);
    expect(requestsFor(id)).toEqual([]);
  });

  it("rejects a custom instruction over 300 characters", async () => {
    const id = await ticketAs(priya);
    const res = await admin
      .post(`/api/v1/tickets/${id}/draft`)
      .send({ instruction: "custom", customInstruction: "x".repeat(301), baseDraft: BASE });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([expect.objectContaining({ field: "customInstruction" })]);
    expect(requestsFor(id)).toEqual([]);
  });

  it("rejects a base draft over 4,000 characters", async () => {
    const id = await ticketAs(priya);
    const res = await admin.post(`/api/v1/tickets/${id}/draft`).send({ instruction: "shorter", baseDraft: "x".repeat(4001) });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([expect.objectContaining({ field: "baseDraft" })]);
    expect(requestsFor(id)).toEqual([]);
  });

  it("requires a base draft with an instruction and a custom instruction with custom", async () => {
    const id = await ticketAs(priya);
    const noBase = await admin.post(`/api/v1/tickets/${id}/draft`).send({ instruction: "warmer" });
    expect(noBase.status).toBe(400);
    expect(noBase.body.error.details).toEqual([expect.objectContaining({ field: "baseDraft" })]);
    const noCustom = await admin.post(`/api/v1/tickets/${id}/draft`).send({ instruction: "custom", baseDraft: BASE });
    expect(noCustom.status).toBe(400);
    expect(noCustom.body.error.details).toEqual([expect.objectContaining({ field: "customInstruction" })]);
  });
});

describe("POST /tickets/:id/draft: access and refinement", () => {
  it("forbids authors, including refinement of their own ticket", async () => {
    const id = await ticketAs(priya);
    const res = await priya.post(`/api/v1/tickets/${id}/draft`).send({ instruction: "shorter", baseDraft: BASE });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(requestsFor(id)).toEqual([]);
  });

  it("returns 404 when refining a ticket that does not exist, without calling the AI", async () => {
    const res = await admin.post(`/api/v1/tickets/${UNKNOWN_ID}/draft`).send({ instruction: "shorter", baseDraft: BASE });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(requestsFor(UNKNOWN_ID)).toEqual([]);
  });

  it("passes the instruction, custom instruction and base draft through to the AI", async () => {
    const id = await ticketAs(priya);
    const shorter = await admin.post(`/api/v1/tickets/${id}/draft`).send({ instruction: "shorter", baseDraft: `  ${BASE}  ` });
    expect(shorter.status).toBe(200);
    await admin
      .post(`/api/v1/tickets/${id}/draft`)
      .send({ instruction: "custom", customInstruction: " Mention the dashboard ", baseDraft: BASE });
    expect(requestsFor(id)).toEqual([
      { ticketId: id, regenerate: false, instruction: "shorter", baseDraft: BASE },
      { ticketId: id, regenerate: false, instruction: "custom", customInstruction: "Mention the dashboard", baseDraft: BASE },
    ]);
  });
});

describe("POST /tickets/:id/draft: refinement without the AI", () => {
  let offline: TestApp;
  const calls: LlmRequest[] = [];

  beforeAll(async () => {
    // A configured provider that fails every call: drafts fall back to templates, refinements cannot.
    const provider: LlmProvider = {
      text: async (req) => {
        calls.push(req);
        throw new AiError("server", "upstream 500");
      },
      structured: async () => {
        throw new AiError("server", "upstream 500");
      },
    };
    offline = await createTestApp({
      env: { ANTHROPIC_API_KEY: "test-key" },
      ai: (base) => createAiLayer({ ...base, provider }),
    });
  });
  afterAll(() => offline.close());

  it("answers 503 AI_UNAVAILABLE for a refinement, while a plain draft still falls back to a template", async () => {
    const author = await loginAs(offline.app, "priya.sharma@email.com");
    const staff = await loginAs(offline.app, ADMIN_EMAIL);
    const id = await ticketAs(author);

    const refined = await staff.post(`/api/v1/tickets/${id}/draft`).send({ instruction: "warmer", baseDraft: BASE });
    expect(refined.status).toBe(503);
    expect(refined.body.error.code).toBe("AI_UNAVAILABLE");
    expect(refined.body.error.message).toContain("Your text is unchanged");
    expect(calls.some((c) => c.user.includes(BASE))).toBe(true);

    const plain = await staff.post(`/api/v1/tickets/${id}/draft`);
    expect(plain.status).toBe(200);
    expect(plain.body.source).toBe("template");
  });
});
