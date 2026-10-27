import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aiCalls, tickets } from "../src/db/schema.js";
import { ADMIN_EMAIL, FIXED_NOW, createTestApp, loginAs, type TestApp } from "./helpers.js";
import { fakeAi } from "./fake-ai.js";

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp({ ai: fakeAi().factory });
});
afterAll(() => t.close());

describe("admin endpoints", () => {
  it("lists the team for assignment", async () => {
    const admin = await loginAs(t.app, ADMIN_EMAIL);
    const res = await admin.get("/api/v1/admin/team");
    expect(res.status).toBe(200);
    expect(res.body.data.map((a: { name: string }) => a.name)).toEqual(["Ananya Ops", "Rahul Support"]);
    expect(Object.keys(res.body.data[0]).sort()).toEqual(["email", "id", "name"]);
  });

  it("forbids authors", async () => {
    const author = await loginAs(t.app, "priya.sharma@email.com");
    expect((await author.get("/api/v1/admin/team")).status).toBe(403);
    expect((await author.get("/api/v1/admin/stats")).status).toBe(403);
    expect((await author.get("/api/v1/admin/dashboard")).status).toBe(403);
  });

  it("reports queue, SLA and AI stats", async () => {
    const admin = await loginAs(t.app, ADMIN_EMAIL);
    const author = await loginAs(t.app, "priya.sharma@email.com");
    await t.ctx.db.delete(tickets);

    const create = async (subject: string) =>
      (
        await author.post("/api/v1/tickets").send({ bookId: "BK001", subject, description: `${subject} - details for the support team.` })
      ).body.id as string;
    const breached = await create("Critical and unanswered");
    const agreed = await create("Classifier agreed");
    const answered = await create("Answered with a draft");

    const hoursAgo = (h: number) => new Date(FIXED_NOW.getTime() - h * 3_600_000);
    await t.ctx.db
      .update(tickets)
      .set({ priority: "critical", createdAt: hoursAgo(5), classificationState: "completed", suggestedCategory: "royalty_payments", category: "isbn_metadata", suggestedPriority: "critical" })
      .where(eq(tickets.id, breached));
    await t.ctx.db
      .update(tickets)
      .set({ priority: "low", classificationState: "completed", suggestedCategory: "royalty_payments", category: "royalty_payments", suggestedPriority: "medium" })
      .where(eq(tickets.id, agreed));
    await admin.post(`/api/v1/tickets/${answered}/messages`).send({ body: "Draft-based reply", usedAiDraft: true, status: "resolved" });
    await admin.post(`/api/v1/tickets/${answered}/messages`).send({ body: "Hand-written follow-up" });

    await t.ctx.db.insert(aiCalls).values([
      { purpose: "classify", model: "claude-haiku-4-5", outcome: "success", inputTokens: 1000, outputTokens: 200, createdAt: hoursAgo(1) },
      { purpose: "draft", model: "claude-haiku-4-5", outcome: "timeout", inputTokens: 500, outputTokens: 0, createdAt: hoursAgo(2) },
      { purpose: "classify", model: "claude-haiku-4-5", outcome: "success", inputTokens: 9999, outputTokens: 9999, createdAt: hoursAgo(30) },
    ]);

    const res = await admin.get("/api/v1/admin/stats");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      byStatus: { open: 2, in_progress: 0, resolved: 1, closed: 0 },
      openByPriority: { critical: 1, high: 0, medium: 0, low: 1 },
      unassignedOpen: 2,
      slaBreached: 1,
      ai: {
        available: true,
        provider: "anthropic",
        model: "claude-haiku-4-5",
        calls24h: 2,
        failures24h: 1,
        inputTokens24h: 1500,
        outputTokens24h: 200,
        estimatedCostUsd24h: 0.0025, // (1500 * $1 + 200 * $5) / 1M
        categoryAgreement: 0.5,
        priorityAgreement: 0.5,
        draftUsageRate: 0.5,
      },
    });
  });
});

describe("API docs", () => {
  it("serves an OpenAPI 3.1 spec covering every route", async () => {
    const res = await request(t.app).get("/api/openapi.json");
    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\.1/);
    expect(Object.keys(res.body.paths).sort()).toEqual(
      [
        "/health",
        "/auth/login",
        "/auth/logout",
        "/auth/me",
        "/books",
        "/books/{id}",
        "/authors",
        "/authors/{id}",
        "/tickets",
        "/tickets/{id}",
        "/tickets/{id}/messages",
        "/tickets/{id}/notes",
        "/tickets/{id}/draft",
        "/tickets/{id}/reclassify",
        "/admin/team",
        "/admin/stats",
        "/admin/dashboard",
        "/events",
      ].sort(),
    );
    expect(Object.keys(res.body.paths["/tickets/{id}"]).sort()).toEqual(["get", "parameters", "patch"]);
    expect(res.body.components.securitySchemes.cookieAuth).toMatchObject({ in: "cookie", name: "bl_session" });
    expect(res.body.components.schemas.Error.properties.error.required).toEqual(["code", "message"]);
  });

  it("serves Swagger UI with assets that the CSP allows", async () => {
    const page = await request(t.app).get("/api/docs/");
    expect(page.status).toBe(200);
    expect(page.text).toContain("swagger-ui");
    const csp = String(page.headers["content-security-policy"]);
    expect(csp).toContain("script-src 'self'");
    // Every script must be same-origin (no inline <script> bodies, which the CSP would block).
    const scripts = [...page.text.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
    expect(scripts.length).toBeGreaterThan(0);
    for (const [, attrs, body] of scripts) {
      expect(attrs).toMatch(/src="\.\//);
      expect(body!.trim()).toBe("");
    }
    const init = await request(t.app).get("/api/docs/swagger-ui-init.js");
    expect(init.status).toBe(200);
    expect(init.text).toContain("BookLeaf");
  });
});
