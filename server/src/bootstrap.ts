/**
 * Builds the runtime context (config, DB, AI layer) shared by the HTTP server,
 * CLI scripts and integration tests.
 */
import { createAiLayer } from "./ai/index.js";
import { DEV_JWT_SECRET, loadEnv, type Env } from "./config/env.js";
import type { AppContext } from "./context.js";
import { createDb } from "./db/client.js";
import { seed } from "./db/seed.js";
import { createLogger, type Logger } from "./lib/logger.js";
import { EventBus } from "./modules/events/bus.js";

export interface BootstrapOptions {
  env?: Partial<Record<keyof Env, string>>;
  log?: Logger;
  /** Replace the AI layer (tests). */
  ai?: (base: Omit<AppContext, "ai">) => AppContext["ai"];
  now?: () => Date;
}

export async function bootstrap(opts: BootstrapOptions = {}): Promise<AppContext> {
  const env = loadEnv({ ...process.env, ...opts.env });
  const log = opts.log ?? createLogger(env.LOG_LEVEL, env.NODE_ENV === "development");
  const dbHandle = await createDb({ databaseUrl: env.DATABASE_URL, pgliteDataDir: env.PGLITE_DATA_DIR });

  if (env.DB_AUTO_MIGRATE) await dbHandle.migrate();
  if (env.DB_AUTO_SEED) {
    await seed(dbHandle.db, {
      authorPassword: env.SEED_AUTHOR_PASSWORD,
      adminPassword: env.SEED_ADMIN_PASSWORD,
      log,
    });
  }

  if (!env.JWT_SECRET) log.warn("JWT_SECRET not set - using an insecure development secret");
  const base: Omit<AppContext, "ai"> = {
    env,
    jwtSecret: env.JWT_SECRET ?? DEV_JWT_SECRET,
    dbHandle,
    db: dbHandle.db,
    log,
    bus: new EventBus(),
    now: opts.now ?? (() => new Date()),
  };
  const ai = opts.ai ? opts.ai(base) : createAiLayer({ db: base.db, bus: base.bus, env, log, now: base.now });
  return { ...base, ai };
}
