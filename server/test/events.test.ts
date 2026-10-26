import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADMIN_EMAIL, ADMIN_PASSWORD, AUTHOR_PASSWORD, createTestApp, type TestApp } from "./helpers.js";
import { fakeAi } from "./fake-ai.js";

let t: TestApp;
let server: Server;
let base: string;

beforeAll(async () => {
  t = await createTestApp({ ai: fakeAi().factory });
  server = t.app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await t.close();
});

async function tokenFor(email: string, password: string) {
  const res = await request(t.app).post("/api/v1/auth/login").send({ email, password });
  return res.body.token as string;
}

interface Frame {
  event: string;
  data: string;
}

/** Minimal SSE client over fetch: collects frames and lets a test wait for one. */
async function openStream(token: string) {
  const abort = new AbortController();
  const res = await fetch(`${base}/api/v1/events`, { headers: { Authorization: `Bearer ${token}` }, signal: abort.signal });
  const frames: Frame[] = [];
  let buffer = "";
  let raw = "";
  const waiters: (() => void)[] = [];
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        raw += value;
        buffer += value;
        let idx;
        while ((idx = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const event = /^event: (.*)$/m.exec(block)?.[1];
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (event && data) frames.push({ event, data });
          waiters.splice(0).forEach((w) => w());
        }
      }
    } catch {
      // aborted
    }
  })();

  async function waitFor(pred: (f: Frame) => boolean, timeoutMs = 3000): Promise<Frame> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const hit = frames.find(pred);
      if (hit) return hit;
      if (Date.now() > deadline) throw new Error(`timed out; frames: ${JSON.stringify(frames)}`);
      await new Promise<void>((resolve) => {
        waiters.push(resolve);
        setTimeout(resolve, 50);
      });
    }
  }
  return { res, frames, waitFor, raw: () => raw, close: () => abort.abort() };
}

describe("GET /events (SSE)", () => {
  it("requires a session", async () => {
    expect((await request(t.app).get("/api/v1/events")).status).toBe(401);
  });

  it("routes events by role and ownership", async () => {
    const [authorToken, otherToken, adminToken] = await Promise.all([
      tokenFor("priya.sharma@email.com", AUTHOR_PASSWORD),
      tokenFor("rohit.kapoor@email.com", AUTHOR_PASSWORD),
      tokenFor(ADMIN_EMAIL, ADMIN_PASSWORD),
    ]);
    const author = await openStream(authorToken);
    const adminStream = await openStream(adminToken);
    try {
      expect(author.res.status).toBe(200);
      expect(author.res.headers.get("content-type")).toMatch(/^text\/event-stream/);
      expect(author.res.headers.get("cache-control")).toBe("no-cache, no-transform");
      expect(author.res.headers.get("x-accel-buffering")).toBe("no");
      await author.waitFor((f) => f.event === "ready");
      await adminStream.waitFor((f) => f.event === "ready");
      expect(author.raw()).toMatch(/^retry: 5000\n\n/);

      const api = (token: string) => ({
        post: (path: string, body?: object) => request(t.app).post(path).set("Authorization", `Bearer ${token}`).send(body),
      });

      // Another author's ticket: admin sees it, Priya must not.
      const foreign = await api(otherToken).post("/api/v1/tickets", {
        bookId: "BK003",
        subject: "Rohit's private ticket",
        description: "This ticket belongs to Rohit and must never reach Priya's stream.",
      });
      // Priya's own ticket, then an internal note (adminOnly), then a reply (visible to the author).
      const own = await api(authorToken).post("/api/v1/tickets", {
        bookId: "BK001",
        subject: "Priya's ticket",
        description: "This ticket belongs to Priya and its public events should reach her.",
      });
      const ownId = own.body.id as string;
      await api(adminToken).post(`/api/v1/tickets/${ownId}/notes`, { body: "internal" });
      await api(adminToken).post(`/api/v1/tickets/${ownId}/messages`, { body: "We're on it" });

      const lastForAuthor = (f: Frame) => f.event === "ticket.message" && JSON.parse(f.data).ticketId === ownId;
      await author.waitFor(lastForAuthor);
      await adminStream.waitFor(lastForAuthor);

      // Delivery is in publish order, so by the time the message arrived anything else would have too.
      const seen = (s: typeof author) => s.frames.filter((f) => f.event !== "ready").map((f) => `${f.event}:${JSON.parse(f.data).ticketId}`);
      expect(seen(author)).toEqual([`ticket.created:${ownId}`, `ticket.message:${ownId}`]);
      expect(seen(adminStream)).toEqual([
        `ticket.created:${foreign.body.id}`,
        `ticket.created:${ownId}`,
        `ticket.updated:${ownId}`,
        `ticket.message:${ownId}`,
      ]);
      expect(JSON.parse(author.frames.find(lastForAuthor)!.data)).toEqual({ type: "ticket.message", ticketId: ownId });
      expect(t.ctx.bus.listenerCount()).toBe(2);
    } finally {
      author.close();
      adminStream.close();
    }

    // Closing the connection unsubscribes from the bus.
    const deadline = Date.now() + 3000;
    while (t.ctx.bus.listenerCount() > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
    expect(t.ctx.bus.listenerCount()).toBe(0);
  });
});
