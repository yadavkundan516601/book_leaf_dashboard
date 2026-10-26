/**
 * Integration-test harness: a real Express app over an in-memory Postgres
 * (PGlite), migrated and seeded with the provided dataset.
 */
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../src/app.js";
import { bootstrap, type BootstrapOptions } from "../src/bootstrap.js";
import type { AppContext } from "../src/context.js";
import { createLogger } from "../src/lib/logger.js";

export const AUTHOR_PASSWORD = "Author@123";
export const ADMIN_PASSWORD = "Admin@123";
export const ADMIN_EMAIL = "admin@bookleaf.test";
export const SECOND_ADMIN_EMAIL = "support@bookleaf.test";

/** Fixed clock: 2026-10-26 (Q4 accruing, Q3 payout due by 2026-11-14). */
export const FIXED_NOW = new Date("2026-10-26T09:00:00Z");

export interface TestApp {
  ctx: AppContext;
  app: Express;
  close(): Promise<void>;
}

export async function createTestApp(opts: BootstrapOptions = {}): Promise<TestApp> {
  const ctx = await bootstrap({
    log: createLogger("silent", false),
    now: () => FIXED_NOW,
    ...opts,
    env: {
      NODE_ENV: "test",
      PGLITE_DATA_DIR: "memory",
      DATABASE_URL: undefined as unknown as string,
      ANTHROPIC_API_KEY: undefined as unknown as string,
      SERVE_WEB: "false",
      SEED_AUTHOR_PASSWORD: AUTHOR_PASSWORD,
      SEED_ADMIN_PASSWORD: ADMIN_PASSWORD,
      ...opts.env,
    },
  });
  const app = createApp(ctx);
  return {
    ctx,
    app,
    close: async () => {
      await ctx.ai.classification.drain();
      await ctx.dbHandle.close();
    },
  };
}

/** Logs in and returns a supertest agent carrying the session cookie. */
export async function loginAs(app: Express, email: string, password = email.endsWith("@bookleaf.test") ? ADMIN_PASSWORD : AUTHOR_PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post("/api/v1/auth/login").send({ email, password });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}

/** Extracts the session JWT from a login response's Set-Cookie header (API-client style auth). */
export function sessionToken(res: { headers: Record<string, unknown> }): string {
  const cookies = ([] as string[]).concat((res.headers["set-cookie"] as string[] | string | undefined) ?? []);
  const match = cookies.join(";").match(/bl_session=([^;]+)/);
  if (!match?.[1]) throw new Error("no session cookie in response");
  return match[1];
}
