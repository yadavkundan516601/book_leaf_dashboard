import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADMIN_EMAIL, createTestApp, loginAs, type TestApp } from "./helpers.js";

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());

describe("auth", () => {
  it("rejects bad credentials with 401 and a stable error shape", async () => {
    const res = await request(t.app).post("/api/v1/auth/login").send({ email: "priya.sharma@email.com", password: "nope" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("validates the login payload", async () => {
    const res = await request(t.app).post("/api/v1/auth/login").send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "email" }), expect.objectContaining({ field: "password" })]),
    );
  });

  it("logs an author in with an httpOnly cookie and returns their profile", async () => {
    const res = await request(t.app).post("/api/v1/auth/login").send({ email: "Priya.Sharma@email.com", password: "Author@123" });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ role: "author", authorId: "AUTH001", name: "Priya Sharma" });
    expect(String(res.headers["set-cookie"])).toMatch(/bl_session=.*HttpOnly/i);
  });

  it("protects routes without a session", async () => {
    const res = await request(t.app).get("/api/v1/books");
    expect(res.status).toBe(401);
  });

  it("accepts a Bearer token for API clients", async () => {
    const login = await request(t.app).post("/api/v1/auth/login").send({ email: ADMIN_EMAIL, password: "Admin@123" });
    const res = await request(t.app).get("/api/v1/auth/me").set("Authorization", `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("admin");
  });
});

describe("books", () => {
  it("returns only the author's own books with a royalty summary", async () => {
    const agent = await loginAs(t.app, "sneha.kulkarni@email.com");
    const res = await agent.get("/api/v1/books");
    expect(res.status).toBe(200);
    expect(res.body.books.map((b: { id: string }) => b.id)).toEqual(["BK011", "BK012", "BK013"]);
    const inProduction = res.body.books.find((b: { id: string }) => b.id === "BK013");
    expect(inProduction).toMatchObject({ isPublished: false, mrp: null, publicationDate: null, availableOn: [] });
    expect(res.body.royalty).toMatchObject({ totalPending: 7865, meetsThreshold: true, nextPayoutDueBy: "2026-11-14" });
  });

  it("flags pending royalties below the payout threshold", async () => {
    const agent = await loginAs(t.app, "kavita.deshmukh@email.com");
    const res = await agent.get("/api/v1/books");
    expect(res.body.royalty).toMatchObject({ totalPending: 850, meetsThreshold: false });
  });

  it("hides other authors' books (404, not 403, to avoid id probing)", async () => {
    const agent = await loginAs(t.app, "priya.sharma@email.com");
    expect((await agent.get("/api/v1/books/BK003")).status).toBe(404);
    expect((await agent.get("/api/v1/books/BK001")).status).toBe(200);
  });

  it("forbids authors from the admin author directory", async () => {
    const agent = await loginAs(t.app, "priya.sharma@email.com");
    expect((await agent.get("/api/v1/authors")).status).toBe(403);
  });

  it("lets admins read every book", async () => {
    const agent = await loginAs(t.app, ADMIN_EMAIL);
    const res = await agent.get("/api/v1/books");
    expect(res.body.books).toHaveLength(18);
  });
});
