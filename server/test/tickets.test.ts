import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADMIN_EMAIL, SECOND_ADMIN_EMAIL, createTestApp, loginAs, type TestApp } from "./helpers.js";
import { fakeAi, tickingClock, type FakeAi } from "./fake-ai.js";

type Agent = Awaited<ReturnType<typeof loginAs>>;

let t: TestApp;
let ai: FakeAi;
let priya: Agent;
let rohit: Agent;
let admin: Agent;

const newTicket = {
  bookId: "BK001",
  subject: "Royalty for Q2 not received",
  description: "I have not received my royalty payment for the last quarter even though sales are showing.",
};

beforeAll(async () => {
  ai = fakeAi();
  t = await createTestApp({ ai: ai.factory, now: tickingClock() });
  [priya, rohit, admin] = await Promise.all([
    loginAs(t.app, "priya.sharma@email.com"),
    loginAs(t.app, "rohit.kapoor@email.com"),
    loginAs(t.app, ADMIN_EMAIL),
  ]);
});
afterAll(() => t.close());

async function createAsPriya(overrides: Partial<typeof newTicket> = {}) {
  const res = await priya.post("/api/v1/tickets").send({ ...newTicket, ...overrides });
  expect(res.status).toBe(201);
  return res.body as { id: string; reference: string; number: number };
}

describe("ticket lifecycle", () => {
  it("runs author create -> admin triage/reply -> author sees reply -> author reply reopens", async () => {
    const created = await priya.post("/api/v1/tickets").send(newTicket);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      subject: newTicket.subject,
      status: "open",
      book: { id: "BK001" },
      messages: [],
      attachments: [],
    });
    expect(created.body.reference).toBe(`BL-${created.body.number}`);
    const id = created.body.id as string;
    expect(ai.enqueued).toContain(id);

    // Admin sees it in the queue with author context.
    const queue = await admin.get("/api/v1/tickets").query({ q: created.body.reference });
    expect(queue.status).toBe(200);
    expect(queue.body.data).toHaveLength(1);
    expect(queue.body.data[0]).toMatchObject({
      id,
      author: { id: "AUTH001", name: "Priya Sharma" },
      classification: { state: "pending" },
      assignee: null,
      slaBreached: false,
    });

    const detail = await admin.get(`/api/v1/tickets/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.context.author.id).toBe("AUTH001");
    expect(detail.body.context.book.id).toBe("BK001");
    expect(detail.body.context.royalty).toHaveProperty("nextPayoutDueBy");
    expect(detail.body.events.map((e: { type: string }) => e.type)).toEqual(["created"]);
    expect(detail.body.events[0].actorName).toBe("Priya Sharma");

    // Admin replies and resolves in one action.
    const reply = await admin.post(`/api/v1/tickets/${id}/messages`).send({ body: "Paid today.", status: "resolved", usedAiDraft: true });
    expect(reply.status).toBe(201);
    expect(reply.body).toMatchObject({ sender: "admin", senderName: "Ananya Ops", body: "Paid today." });

    const afterReply = await admin.get(`/api/v1/tickets/${id}`);
    expect(afterReply.body.status).toBe("resolved");
    expect(afterReply.body.firstRespondedAt).not.toBeNull();
    expect(afterReply.body.assignee).toMatchObject({ name: "Ananya Ops" });
    expect(afterReply.body.ageHours).toBeNull();
    expect(afterReply.body.events.map((e: { type: string }) => e.type)).toEqual(["created", "status_changed", "assigned"]);

    // Author sees the reply and a resolved ticket that awaits them.
    const authorView = await priya.get(`/api/v1/tickets/${id}`);
    expect(authorView.body.status).toBe("resolved");
    expect(authorView.body.messages.map((m: { sender: string }) => m.sender)).toEqual(["admin"]);
    const authorList = await priya.get("/api/v1/tickets");
    expect(authorList.body.data.find((x: { id: string }) => x.id === id)).toMatchObject({ messageCount: 1, awaitingAuthor: true });

    // Author follow-up reopens it.
    const followUp = await priya.post(`/api/v1/tickets/${id}/messages`).send({ body: "Still not in my account.", status: "closed" });
    expect(followUp.status).toBe(201);
    const reopened = await admin.get(`/api/v1/tickets/${id}`);
    expect(reopened.body.status).toBe("open");
    expect(reopened.body.events.at(-1)).toMatchObject({ type: "status_changed", from: "resolved", to: "open", actorName: "Priya Sharma" });
    expect(reopened.body.messages.map((m: { sender: string }) => m.sender)).toEqual(["admin", "author"]);
  });

  it("moves an open ticket to in_progress on an admin reply without an explicit status", async () => {
    const { id } = await createAsPriya();
    await admin.post(`/api/v1/tickets/${id}/messages`).send({ body: "Looking into it." });
    expect((await admin.get(`/api/v1/tickets/${id}`)).body.status).toBe("in_progress");
  });

  it("rejects author replies on closed tickets with 409 TICKET_CLOSED", async () => {
    const { id } = await createAsPriya();
    expect((await admin.patch(`/api/v1/tickets/${id}`).send({ status: "closed" })).status).toBe(200);
    const res = await priya.post(`/api/v1/tickets/${id}/messages`).send({ body: "Hello?" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("TICKET_CLOSED");
  });

  it("accepts a general (account-level) ticket with no book", async () => {
    const res = await priya.post("/api/v1/tickets").send({ ...newTicket, bookId: null });
    expect(res.status).toBe(201);
    expect(res.body.book).toBeNull();
  });
});

describe("RBAC", () => {
  it("hides other authors' tickets behind 404", async () => {
    const { id } = await createAsPriya();
    expect((await rohit.get(`/api/v1/tickets/${id}`)).status).toBe(404);
    expect((await rohit.post(`/api/v1/tickets/${id}/messages`).send({ body: "hi" })).status).toBe(404);
    const list = await rohit.get("/api/v1/tickets").query({ authorId: "AUTH001" });
    expect(list.body.data.some((x: { id: string }) => x.id === id)).toBe(false);
  });

  it("forbids authors from admin actions", async () => {
    const { id } = await createAsPriya();
    expect((await priya.patch(`/api/v1/tickets/${id}`).send({ status: "closed" })).status).toBe(403);
    expect((await priya.post(`/api/v1/tickets/${id}/notes`).send({ body: "x" })).status).toBe(403);
    expect((await priya.post(`/api/v1/tickets/${id}/draft`)).status).toBe(403);
    expect((await priya.post(`/api/v1/tickets/${id}/reclassify`)).status).toBe(403);
  });

  it("forbids admins from raising tickets", async () => {
    expect((await admin.post("/api/v1/tickets").send(newTicket)).status).toBe(403);
  });

  it("never serializes internal fields into author responses", async () => {
    const { id } = await createAsPriya();
    await admin.post(`/api/v1/tickets/${id}/notes`).send({ body: "Internal: payout batch failed" });
    await admin.post(`/api/v1/tickets/${id}/reclassify`);
    await admin.post(`/api/v1/tickets/${id}/messages`).send({ body: "On it." });

    const forbiddenKeys = ["notes", "classification", "assignee", "events", "context", "slaBreached", "firstRespondedAt"];
    const detail = await priya.get(`/api/v1/tickets/${id}`);
    const list = await priya.get("/api/v1/tickets");
    for (const body of [detail.body, list.body.data.find((x: { id: string }) => x.id === id)]) {
      expect(body).toBeDefined();
      for (const key of forbiddenKeys) expect(Object.keys(body)).not.toContain(key);
    }
    expect(detail.text).not.toContain("payout batch failed");
    expect(detail.text).not.toContain("royalty_payments");
  });
});

describe("validation", () => {
  it("rejects a book that belongs to another author", async () => {
    const res = await priya.post("/api/v1/tickets").send({ ...newTicket, bookId: "BK003" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details).toEqual([expect.objectContaining({ field: "bookId" })]);
  });

  it("rejects a short subject with a field error", async () => {
    const res = await priya.post("/api/v1/tickets").send({ ...newTicket, subject: "Hi" });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([expect.objectContaining({ field: "subject" })]);
  });

  it("rejects an empty PATCH", async () => {
    const { id } = await createAsPriya();
    const res = await admin.patch(`/api/v1/tickets/${id}`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 for malformed and unknown ticket ids", async () => {
    expect((await admin.get("/api/v1/tickets/not-a-uuid")).status).toBe(404);
    expect((await admin.get("/api/v1/tickets/00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await admin.post("/api/v1/tickets/not-a-uuid/draft")).status).toBe(404);
    expect(ai.drafted.some((d) => d.ticketId === "not-a-uuid")).toBe(false);
  });

  it("rejects assigning a ticket to a non-admin user", async () => {
    const { id } = await createAsPriya();
    const me = await priya.get("/api/v1/auth/me");
    const res = await admin.patch(`/api/v1/tickets/${id}`).send({ assigneeId: me.body.user.id });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([expect.objectContaining({ field: "assigneeId" })]);
  });
});

describe("admin actions", () => {
  it("records overrides as admin-sourced with one event per changed field", async () => {
    const { id } = await createAsPriya();
    await admin.post(`/api/v1/tickets/${id}/reclassify`);
    const team = await admin.get("/api/v1/admin/team");
    const rahul = team.body.data.find((a: { email: string }) => a.email === SECOND_ADMIN_EMAIL);

    const res = await admin.patch(`/api/v1/tickets/${id}`).send({
      category: "isbn_metadata",
      priority: "high", // unchanged from the classifier: a no-op
      assigneeId: rahul.id,
      status: "in_progress",
    });
    expect(res.status).toBe(200);
    expect(res.body.classification).toMatchObject({
      category: "isbn_metadata",
      categorySource: "admin",
      suggestedCategory: "royalty_payments",
      priority: "high",
      prioritySource: "ai",
    });
    expect(res.body.assignee).toMatchObject({ id: rahul.id, name: "Rahul Support" });
    const changes = res.body.events.filter((e: { type: string }) => e.type !== "created");
    expect(changes).toEqual([
      expect.objectContaining({ type: "status_changed", from: "open", to: "in_progress", actorName: "Ananya Ops" }),
      expect.objectContaining({ type: "category_changed", from: "royalty_payments", to: "isbn_metadata" }),
      expect.objectContaining({ type: "assigned", from: null, to: "Rahul Support" }),
    ]);

    const resolved = await admin.patch(`/api/v1/tickets/${id}`).send({ status: "resolved", assigneeId: null });
    expect(resolved.body.status).toBe("resolved");
    expect(resolved.body.assignee).toBeNull();
    expect(resolved.body.events.at(-1)).toMatchObject({ type: "unassigned", from: "Rahul Support", to: null });
  });

  it("adds internal notes visible to admins", async () => {
    const { id } = await createAsPriya();
    const res = await admin.post(`/api/v1/tickets/${id}/notes`).send({ body: "Check the payout batch" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ body: "Check the payout batch", author: { name: "Ananya Ops" } });
    expect((await admin.get(`/api/v1/tickets/${id}`)).body.notes).toHaveLength(1);
  });

  it("returns AI drafts and passes the regenerate flag through", async () => {
    const { id } = await createAsPriya();
    const first = await admin.post(`/api/v1/tickets/${id}/draft`);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ ticketId: id, source: "ai" });
    await admin.post(`/api/v1/tickets/${id}/draft`).send({ regenerate: true });
    expect(ai.drafted.filter((d) => d.ticketId === id)).toEqual([
      { ticketId: id, regenerate: false },
      { ticketId: id, regenerate: true },
    ]);
  });

  it("reclassifies on demand and returns the updated ticket", async () => {
    const { id } = await createAsPriya();
    const res = await admin.post(`/api/v1/tickets/${id}/reclassify`);
    expect(res.status).toBe(200);
    expect(res.body.classification).toMatchObject({ state: "completed", priority: "high", prioritySource: "ai" });
  });
});

describe("rate limiting", () => {
  it("limits ticket creation per user outside the test environment", async () => {
    const limited = await createTestApp({ ai: fakeAi().factory, env: { NODE_ENV: "development" } });
    try {
      const agent = await loginAs(limited.app, "priya.sharma@email.com");
      for (let i = 0; i < 10; i++) expect((await agent.post("/api/v1/tickets").send(newTicket)).status).toBe(201);
      const res = await agent.post("/api/v1/tickets").send(newTicket);
      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe("RATE_LIMITED");
      // Another author is unaffected: the limit is per user.
      const other = await loginAs(limited.app, "rohit.kapoor@email.com");
      expect((await other.post("/api/v1/tickets").send({ ...newTicket, bookId: "BK003" })).status).toBe(201);
    } finally {
      await limited.close();
    }
  });
});
