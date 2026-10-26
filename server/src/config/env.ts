/**
 * Typed, validated configuration. The process refuses to boot on invalid
 * config instead of failing later at request time.
 *
 * Secrets (JWT_SECRET, ANTHROPIC_API_KEY, DATABASE_URL) only ever come from
 * the environment. ANTHROPIC_API_KEY is optional: without it the AI layer runs
 * in degraded mode (rule-based classification + templated drafts).
 */
import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

    /** postgres://... When unset, an embedded PGlite database is used (dev/test only). */
    DATABASE_URL: z.string().url().optional(),
    /** Directory for the embedded database. "memory" keeps it in-process only. */
    PGLITE_DATA_DIR: z.string().default(".data/pglite"),
    /** Run migrations + idempotent seed on boot (handy for single-instance demos). */
    DB_AUTO_MIGRATE: bool.default(true),
    DB_AUTO_SEED: bool.default(true),

    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters").optional(),
    JWT_TTL_HOURS: z.coerce.number().positive().default(12),
    /** Set when the web app is served from a different origin than the API. */
    CORS_ORIGIN: z.string().optional(),
    /** Serve the built web app (web/dist) from this process. */
    SERVE_WEB: bool.default(true),
    TRUST_PROXY: bool.default(false),

    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    /**
     * Passed to the SDK explicitly so it never silently picks up an
     * ANTHROPIC_BASE_URL exported in the host shell (e.g. a developer proxy).
     */
    AI_BASE_URL: z.string().url().default("https://api.anthropic.com"),
    AI_CLASSIFY_MODEL: z.string().default("claude-haiku-4-5"),
    AI_DRAFT_MODEL: z.string().default("claude-haiku-4-5"),
    AI_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
    AI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
    /** Consecutive failures before the circuit opens, and how long it stays open. */
    AI_BREAKER_THRESHOLD: z.coerce.number().int().positive().default(3),
    AI_BREAKER_COOLDOWN_MS: z.coerce.number().int().positive().default(60_000),
    AI_CLASSIFY_CONCURRENCY: z.coerce.number().int().positive().default(3),
    /** Kill switch: force degraded mode without removing the key. */
    AI_DISABLED: bool.default(false),

    /** Demo credentials used by the seed. Override in any shared environment. */
    SEED_AUTHOR_PASSWORD: z.string().min(8).default("Author@123"),
    SEED_ADMIN_PASSWORD: z.string().min(8).default("Admin@123"),
    /** On a fresh database, also add ~4 weeks of resolved demo tickets so the dashboard has history. */
    SEED_DEMO_HISTORY: bool.default(true),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production") {
      if (!env.JWT_SECRET) ctx.addIssue({ code: "custom", path: ["JWT_SECRET"], message: "required in production" });
      if (!env.DATABASE_URL) ctx.addIssue({ code: "custom", path: ["DATABASE_URL"], message: "required in production" });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

/** Dev/test-only fallback so local runs work without setup; production requires JWT_SECRET. */
export const DEV_JWT_SECRET = "dev-only-insecure-secret-change-me-0123456789";
