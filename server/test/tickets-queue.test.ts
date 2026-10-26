import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TicketCategory, TicketPriority, TicketStatus } from "@bookleaf/shared";
import { tickets } from "../src/db/schema.js";
import { ADMIN_EMAIL, FIXED_NOW, createTestApp, loginAs, type TestApp } from "./helpers.js";
import { fakeAi } from "./fake-ai.js";

type Agent = Awaited<ReturnType<typeof loginAs>>;

let t: TestApp;
let admin: Agent;
let priya: Agent;
const ids: Record<string, string> = {};

interface Fixture {
  key: string;
  as: "priya" | "rohit";
  bookId: string;
  subject: string;
  hoursAgo: number;
  status: TicketStatus;
  priority: TicketPriority | null;
  category?: TicketCategory;
}

// Expected urgency order: unresolved first, priority desc (unclassified between high and medium), oldest first.
const FIXTURES: Fixture[] = [
  { key: "A", as: "priya", bookId: "BK001", subject: "Typo on back cover", hoursAgo: 10, status: "open", priority: "low", category: "printing_quality" },
  { key: "B", as: "rohit", bookId: "BK003", subject: "Wrong ISBN on Amazon listing", hoursAgo: 2, status: "open", priority: "critical", category: "isbn_metadata" },
  { key: "C", as: "priya", bookId: "BK002", subject: "Question about something new", hoursAgo: 5, status: "open", priority: null },
  { key: "D", as: "rohit", bookId: "BK004", subject: "Royalty statement mismatch", hoursAgo: 30, status: "in_progress", priority: "medium", category: "royalty_payments" },
  { key: "E", as: "priya", bookId: "BK001", subject: "Book unavailable on Flipkart", hoursAgo: 50, status: "resolved", priority: "critical", category: "distribution_availability" },
  { key: "F", as: "rohit", bookId: "BK003", subject: "Printing smudges in chapter two", hoursAgo: 1, status: "open", priority: "high", category: "printing_quality" },
  { key: "G", as: "priya", bookId: "BK002", subject: "Royalty not paid for two quarters", hoursAgo: 8, status: "open", priority: "critical", category: "royalty_payments" },
];

beforeAll(async () => {
  t = await createTestApp({ ai: fakeAi().factory });
  // Start from an empty queue; the seed's demo tickets are timed off the wall clock, not FIXED_NOW.
  await t.ctx.db.delete(tickets);
  const agents = {
    priya: await loginAs(t.app, "priya.sharma@email.com"),
    rohit: await loginAs(t.app, "rohit.kapoor@email.com"),
  };
  priya = agents.priya;
  admin = await loginAs(t.app, ADMIN_EMAIL);
  for (const f of FIXTURES) {
    const res = await agents[f.as].post("/api/v1/tickets").send({
      bookId: f.bookId,
      subject: f.subject,
      description: `${f.subject}. Please look into this for me as soon as possible.`,
    });
    expect(res.status).toBe(201);
    ids[f.key] = res.body.id;
    const createdAt = new Date(FIXED_NOW.getTime() - f.hoursAgo * 3_600_000);
    await t.ctx.db
      .update(tickets)
      .set({ createdAt, updatedAt: createdAt, status: f.status, priority: f.priority, category: f.category ?? null })
      .where(eq(tickets.id, res.body.id));
  }
});
afterAll(() => t.close());

const keysOf = (body: { data: { id: string }[] }) =>
  body.data.map((d) => Object.entries(ids).find(([, id]) => id === d.id)?.[0]).join("");

async function queue(query: Record<string, unknown> = {}) {
  const res = await admin.get("/api/v1/tickets").query(query);
  expect(res.status).toBe(200);
  return res.body;
}

describe("admin queue", () => {
  it("sorts by urgency by default", async () => {
    const body = await queue();
    expect(keysOf(body)).toBe("GBFCDAE");
    expect(body).toMatchObject({ page: 1, pageSize: 25, total: 7 });
  });

  it("computes age and first-response SLA breaches", async () => {
    const body = await queue();
    const byKey = (k: string) => body.data.find((d: { id: string }) => d.id === ids[k]);
    expect(byKey("G")).toMatchObject({ slaBreached: true, ageHours: 8 }); // critical, 8h > 4h
    expect(byKey("B")).toMatchObject({ slaBreached: false, ageHours: 2 }); // critical, within 4h
    expect(byKey("C").slaBreached).toBe(false); // unclassified: no SLA yet
    expect(byKey("E")).toMatchObject({ slaBreached: false, ageHours: null }); // resolved
  });

  it("supports the other sorts", async () => {
    expect(keysOf(await queue({ sort: "newest" }))).toBe("FBCGADE");
    expect(keysOf(await queue({ sort: "oldest" }))).toBe("EDAGCBF");
    expect(keysOf(await queue({ sort: "updated" }))).toBe("FBCGADE");
  });

  it("paginates in SQL", async () => {
    const body = await queue({ page: 2, pageSize: 2 });
    expect(keysOf(body)).toBe("FC");
    expect(body.total).toBe(7);
  });

  it("filters by status, priority and category (multi-value)", async () => {
    expect(keysOf(await queue({ status: "in_progress" }))).toBe("D");
    expect(keysOf(await queue({ status: ["resolved", "in_progress"] }))).toBe("DE");
    expect(keysOf(await queue({ priority: "critical" }))).toBe("GBE");
    expect(keysOf(await queue({ category: ["printing_quality", "isbn_metadata"] }))).toBe("BFA");
  });

  it("filters by inclusive created date range, author and book", async () => {
    // FIXED_NOW is 09:00 UTC on the 26th, so A (10h ago) falls on the 25th.
    expect(keysOf(await queue({ from: "2026-10-26" }))).toBe("GBFC");
    expect(keysOf(await queue({ to: "2026-10-25" }))).toBe("DAE");
    expect(keysOf(await queue({ from: "2026-10-25", to: "2026-10-25" }))).toBe("DA");
    expect(keysOf(await queue({ authorId: "AUTH002" }))).toBe("BFD");
    expect(keysOf(await queue({ bookId: "BK002" }))).toBe("GC");
  });

  it("searches subject, description, author name and reference", async () => {
    expect(keysOf(await queue({ q: "royalty" }))).toBe("GD");
    expect(keysOf(await queue({ q: "ROHIT" }))).toBe("BFD");
    expect(keysOf(await queue({ q: "as soon as possible" })).length).toBe(7);
    const g = await admin.get(`/api/v1/tickets/${ids.G}`);
    expect(keysOf(await queue({ q: g.body.reference }))).toBe("G");
    expect(keysOf(await queue({ q: "%" }))).toBe(""); // LIKE wildcards are matched literally
  });

  it("filters by assignee", async () => {
    const me = await admin.get("/api/v1/auth/me");
    await admin.patch(`/api/v1/tickets/${ids.D}`).send({ assigneeId: me.body.user.id });
    expect(keysOf(await queue({ assignee: "me" }))).toBe("D");
    expect(keysOf(await queue({ assignee: "unassigned" }))).toBe("GBFCAE");
  });

  it("rejects invalid filter values", async () => {
    const res = await admin.get("/api/v1/tickets").query({ status: "pending" });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe("status");
  });
});

describe("author list", () => {
  it("is always scoped to the author, ignoring admin-only filters", async () => {
    const res = await priya.get("/api/v1/tickets").query({ authorId: "AUTH002" });
    expect(res.status).toBe(200);
    expect(keysOf(res.body)).toBe("GCAE");
    expect(Object.keys(res.body.data[0]).sort()).toEqual(
      ["attachments", "awaitingAuthor", "book", "createdAt", "id", "lastMessageAt", "messageCount", "number", "reference", "status", "subject", "updatedAt"],
    );
  });
});
