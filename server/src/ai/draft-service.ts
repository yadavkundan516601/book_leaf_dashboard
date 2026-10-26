// STUB — replaced by feat/ai-drafts on merge.
// Exists only so the composition root compiles on this branch; keep the
// createDraftService signature in sync with the real implementation.
import type { Env } from "../config/env.js";
import type { Db } from "../db/client.js";
import type { Logger } from "../lib/logger.js";
import type { DraftService } from "./index.js";
import type { GuardedLlm } from "./llm-client.js";

export function createDraftService(deps: { db: Db; log: Logger; llm: GuardedLlm; env: Env; now: () => Date }): DraftService {
  return {
    getDraft: async (ticketId) => ({
      ticketId,
      body: "",
      source: "template",
      model: null,
      notice: "drafting not wired yet",
      kbSections: [],
      createdAt: deps.now().toISOString(),
      cached: false,
    }),
  };
}
