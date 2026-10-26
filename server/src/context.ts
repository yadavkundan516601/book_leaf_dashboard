import type { AiLayer } from "./ai/index.js";
import type { Env } from "./config/env.js";
import type { DbHandle } from "./db/client.js";
import type { Logger } from "./lib/logger.js";
import type { EventBus } from "./modules/events/bus.js";

/** Explicit dependency container passed to every module's router factory. */
export interface AppContext {
  env: Env;
  jwtSecret: string;
  dbHandle: DbHandle;
  db: DbHandle["db"];
  log: Logger;
  bus: EventBus;
  ai: AiLayer;
  /** Injectable clock so date-dependent logic (royalty cycle, SLA) is testable. */
  now: () => Date;
}
