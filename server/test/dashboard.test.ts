import { asc, eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TICKET_CATEGORIES, type AdminDashboardDto, type AdminTicketSummaryDto, type TrendDto } from "@bookleaf/shared";
import { ticketMessages, tickets } from "../src/db/schema.js";
import { dashboardWindow, toTrend } from "../src/modules/admin/dashboard.js";
import { ADMIN_EMAIL, FIXED_NOW, createTestApp, loginAs, type TestApp } from "./helpers.js";

const DAY = 86_400_000;
const at = (iso: string) => new Date(iso);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Independent oracle: buckets timestamps into the 14 UTC days before tomorrow's midnight. */
function expectedTrend(stamps: (Date | null)[], now: Date): TrendDto {
  const { previousStart } = dashboardWindow(now);
  const days = new Array<number>(14).fill(0);
  for (const s of stamps) {
    if (!s) continue;
    const idx = Math.floor((s.getTime() - previousStart.getTime()) / DAY);
    if (idx >= 0 && idx < 14) days[idx]! += 1;
  }
  return { total: sum(days.slice(7)), previousTotal: sum(days.slice(0, 7)), daily: days.slice(7) };
}

describe("dashboard window helpers", () => {
  it("anchors the window on the UTC day of `now`, either side of midnight", () => {
    const justAfter = dashboardWindow(at("2026-10-26T00:00:00.000Z"));
    expect(justAfter.start.toISOString()).toBe("2026-10-20T00:00:00.000Z");
    expect(justAfter.end.toISOString()).toBe("2026-10-27T00:00:00.000Z");
    expect(justAfter.previousStart.toISOString()).toBe("2026-10-13T00:00:00.000Z");
    expect(justAfter.start30d.toISOString()).toBe("2026-09-27T00:00:00.000Z");

    const justBefore = dashboardWindow(at("2026-10-25T23:59:59.999Z"));
    expect(justBefore.start.toISOString()).toBe("2026-10-19T00:00:00.000Z");
    expect(justBefore.end.toISOString()).toBe("2026-10-26T00:00:00.000Z");
  });

  it("splits 14 day buckets into previous and current, oldest first, ignoring out-of-range rows", () => {
    const trend = toTrend([
      { day: 13, n: 2 },
      { day: 0, n: 1 },
      { day: 7, n: 3 },
      { day: 14, n: 9 },
      { day: -1, n: 9 },
    ]);
    expect(trend).toEqual({ total: 5, previousTotal: 1, daily: [3, 0, 0, 0, 0, 0, 2] });
  });
});

describe("GET /admin/dashboard with demo history", () => {
  let t: TestApp;
  let body: AdminDashboardDto;

  beforeAll(async () => {
    t = await createTestApp({ env: { SEED_DEMO_HISTORY: "true" } });
    await t.ctx.ai.classification.drain();
    const admin = await loginAs(t.app, ADMIN_EMAIL);
    const res = await admin.get("/api/v1/admin/dashboard");
    expect(res.status).toBe(200);
    body = res.body;
  });
  afterAll(() => t.close());

  it("keeps BL-1..BL-5 as the original demo tickets and adds classified history after them", async () => {
    const rows = await t.ctx.db.select().from(tickets).orderBy(asc(tickets.number));
    expect(rows.length).toBeGreaterThanOrEqual(35);
    expect(rows[0]!.number).toBe(1);
    expect(rows[0]!.subject).toBe("No royalty received since my book launched");
    expect(rows[4]!.subject).toBe("Can I update my author bio?");
    const history = rows.slice(5);
    expect(history.every((r) => r.classificationState === "completed" && r.category && r.priority && r.assigneeId && r.firstRespondedAt)).toBe(true);
    expect(new Set(history.map((r) => r.category)).size).toBe(TICKET_CATEGORIES.length);
    expect(history.some((r) => r.bookId === null)).toBe(true);
    expect(history.every((r) => r.createdAt.getTime() >= FIXED_NOW.getTime() - 29 * DAY && r.createdAt < FIXED_NOW)).toBe(true);
  });

  it("returns the documented shape", () => {
    expect(Object.keys(body).sort()).toEqual(
      ["agents", "attention", "avgFirstResponseHours", "avgResolutionHours", "created", "generatedAt", "replies", "resolved", "unresolvedByCategory"].sort(),
    );
    expect(body.generatedAt).toBe(FIXED_NOW.toISOString());
    for (const trend of [body.created, body.resolved, body.replies]) {
      expect(trend.daily).toHaveLength(7);
      expect(trend.total).toBe(sum(trend.daily));
    }
    for (const avg of [body.avgFirstResponseHours, body.avgResolutionHours]) {
      expect(typeof avg.value).toBe("number");
      expect(typeof avg.previous).toBe("number");
      expect(Math.round(avg.value! * 10) / 10).toBe(avg.value);
    }
  });

  it("has non-trivial data on a fresh boot", () => {
    expect(body.created.total).toBeGreaterThanOrEqual(5);
    expect(body.resolved.total).toBeGreaterThanOrEqual(5);
    expect(body.unresolvedByCategory.filter((c) => c.count > 0 && c.category !== null).length).toBeGreaterThanOrEqual(3);
  });

  it("matches per-day counts for this week and the previous one", async () => {
    const rows = await t.ctx.db.select({ createdAt: tickets.createdAt, resolvedAt: tickets.resolvedAt }).from(tickets);
    const replies = await t.ctx.db.select({ createdAt: ticketMessages.createdAt }).from(ticketMessages).where(eq(ticketMessages.senderType, "admin"));
    expect(body.created).toEqual(expectedTrend(rows.map((r) => r.createdAt), FIXED_NOW));
    expect(body.resolved).toEqual(expectedTrend(rows.map((r) => r.resolvedAt), FIXED_NOW));
    expect(body.replies).toEqual(expectedTrend(replies.map((r) => r.createdAt), FIXED_NOW));
    expect(body.created.previousTotal).toBeGreaterThan(0);
    expect(body.resolved.previousTotal).toBeGreaterThan(0);
  });

  it("counts unresolved tickets per category consistently with the queue", async () => {
    expect(body.unresolvedByCategory.map((c) => c.category)).toEqual([...TICKET_CATEGORIES, null]);
    const admin = await loginAs(t.app, ADMIN_EMAIL);
    const queue = await admin.get("/api/v1/tickets").query({ status: ["open", "in_progress"], pageSize: 100 });
    expect(queue.status).toBe(200);
    const fromQueue = new Map<string | null, number>();
    for (const tk of queue.body.data as AdminTicketSummaryDto[]) {
      fromQueue.set(tk.classification.category, (fromQueue.get(tk.classification.category) ?? 0) + 1);
    }
    for (const c of body.unresolvedByCategory) expect(c.count).toBe(fromQueue.get(c.category) ?? 0);
    expect(sum(body.unresolvedByCategory.map((c) => c.count))).toBe(queue.body.total);
  });

  it("lists every admin, busiest first", () => {
    expect(body.agents.map((a) => a.name).sort()).toEqual(["Ananya Ops", "Rahul Support"]);
    const [first, second] = body.agents;
    expect(first!.resolved7d > second!.resolved7d || (first!.resolved7d === second!.resolved7d && first!.resolved30d >= second!.resolved30d)).toBe(true);
    for (const a of body.agents) {
      expect(a.resolved30d).toBeGreaterThanOrEqual(a.resolved7d);
      expect(a.replies30d).toBeGreaterThanOrEqual(a.replies7d);
      expect(a.replies30d).toBeGreaterThan(0);
      expect(typeof a.avgFirstResponseHours).toBe("number");
    }
  });

  it("reports the seeded unanswered demo tickets as awaiting a first reply", () => {
    // BL-1..BL-4 are open with no reply; history tickets were all answered.
    expect(body.attention.awaitingFirstReply).toBe(4);
    expect(body.attention.slaBreached).toBeGreaterThanOrEqual(0);
    expect(body.attention.unassignedUrgent).toBeGreaterThanOrEqual(0);
  });

  it("is admin only", async () => {
    expect((await request(t.app).get("/api/v1/admin/dashboard")).status).toBe(401);
    const author = await loginAs(t.app, "priya.sharma@email.com");
    expect((await author.get("/api/v1/admin/dashboard")).status).toBe(403);
  });
});

describe("GET /admin/dashboard without history", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it("seeds only the five demo tickets when SEED_DEMO_HISTORY is off", async () => {
    expect((await t.ctx.db.select({ id: tickets.id }).from(tickets)).length).toBe(5);
  });

  it("returns zeros and nulls when there are no tickets", async () => {
    await t.ctx.db.delete(tickets);
    const admin = await loginAs(t.app, ADMIN_EMAIL);
    const res = await admin.get("/api/v1/admin/dashboard");
    expect(res.status).toBe(200);
    const zero = { total: 0, previousTotal: 0, daily: [0, 0, 0, 0, 0, 0, 0] };
    expect(res.body).toMatchObject({
      created: zero,
      resolved: zero,
      replies: zero,
      avgFirstResponseHours: { value: null, previous: null },
      avgResolutionHours: { value: null, previous: null },
      attention: { slaBreached: 0, unassignedUrgent: 0, awaitingFirstReply: 0 },
    });
    expect(res.body.unresolvedByCategory).toEqual([...TICKET_CATEGORIES, null].map((category) => ({ category, count: 0 })));
    expect(res.body.agents.map((a: { name: string }) => a.name)).toEqual(["Ananya Ops", "Rahul Support"]);
    for (const a of res.body.agents) {
      expect(a).toMatchObject({ resolved7d: 0, resolved30d: 0, replies7d: 0, replies30d: 0, avgFirstResponseHours: null });
    }
  });

  it("buckets by UTC day around midnight and averages in hours", async () => {
    await t.ctx.db.delete(tickets);
    const base = { authorId: "AUTH001", bookId: "BK001", subject: "Bucketing check", description: "A ticket placed on a day boundary." };
    await t.ctx.db.insert(tickets).values([
      // Today (2026-10-26) starts at 00:00:00.000Z; the millisecond before belongs to yesterday.
      { ...base, createdAt: at("2026-10-26T00:00:00.000Z"), firstRespondedAt: at("2026-10-26T02:15:00.000Z") },
      { ...base, createdAt: at("2026-10-25T23:59:59.999Z") },
      // First day of the window, resolved 36h later.
      { ...base, status: "resolved", createdAt: at("2026-10-20T00:00:00.000Z"), resolvedAt: at("2026-10-21T12:00:00.000Z") },
      // Previous window: its last and first instants; then one just outside.
      { ...base, createdAt: at("2026-10-19T23:59:59.999Z"), firstRespondedAt: at("2026-10-20T00:59:59.999Z") },
      { ...base, createdAt: at("2026-10-13T00:00:00.000Z") },
      { ...base, createdAt: at("2026-10-12T23:59:59.999Z") },
    ]);
    const admin = await loginAs(t.app, ADMIN_EMAIL);
    const res = await admin.get("/api/v1/admin/dashboard");
    expect(res.status).toBe(200);
    expect(res.body.created).toEqual({ total: 3, previousTotal: 2, daily: [1, 0, 0, 0, 0, 1, 1] });
    expect(res.body.resolved).toEqual({ total: 1, previousTotal: 0, daily: [0, 1, 0, 0, 0, 0, 0] });
    expect(res.body.avgFirstResponseHours).toEqual({ value: 2.3, previous: 1 });
    expect(res.body.avgResolutionHours).toEqual({ value: 36, previous: null });
    expect(res.body.attention.awaitingFirstReply).toBe(3); // unresolved and unanswered: 6 minus 2 answered minus 1 resolved
  });
});
