/**
 * PLACEHOLDER - replaced by the AI implementation. Exists so the API layer
 * compiles and runs end-to-end before the AI layer lands.
 */
import type { Env } from "../config/env.js";
import type { Db } from "../db/client.js";
import type { Logger } from "../lib/logger.js";
import type { EventBus } from "../modules/events/bus.js";
import type { AiLayer } from "./index.js";

export interface AiLayerDeps {
  now: () => Date;
  db: Db;
  bus: EventBus;
  env: Env;
  log: Logger;
}

export function createAiLayer(_deps: AiLayerDeps): AiLayer {
  return {
    classification: {
      enqueue: () => {},
      recoverPending: async () => 0,
      reclassify: async () => {},
      drain: async () => {},
    },
    drafts: {
      getDraft: async (ticketId) => ({
        ticketId,
        body: "",
        source: "template",
        model: null,
        notice: "AI layer not implemented yet",
        kbSections: [],
        createdAt: new Date().toISOString(),
        cached: false,
      }),
    },
    status: { available: () => false, models: () => ({ classify: "none", draft: "none" }) },
  };
}
