/**
 * Composition root of the AI layer. The Anthropic SDK is only constructed
 * when an API key is configured; without one (or with AI_DISABLED, or while
 * the circuit is open) every call short-circuits and the app runs on rules
 * and templates.
 */
import type { Env } from "../config/env.js";
import type { Db } from "../db/client.js";
import { aiCalls } from "../db/schema.js";
import type { Logger } from "../lib/logger.js";
import type { EventBus } from "../modules/events/bus.js";
import { createAnthropicProvider } from "./anthropic-provider.js";
import { CircuitBreaker } from "./circuit-breaker.js";
import { createClassificationQueue } from "./classification-queue.js";
import { createDraftService } from "./draft-service.js";
import type { AiLayer } from "./index.js";
import { createGuardedLlm } from "./llm-client.js";
import type { LlmProvider } from "./provider.js";
import { createAnswerService } from "./answer-service.js";

export interface AiLayerDeps {
  now: () => Date;
  db: Db;
  bus: EventBus;
  env: Env;
  log: Logger;
  /**
   * Replaces the Anthropic transport (tests). Like the real one it is only
   * used when ANTHROPIC_API_KEY is set: the key is the on/off switch.
   */
  provider?: LlmProvider;
  /** Monotonic clock for the circuit breaker (tests). */
  monotonicNow?: () => number;
}

export function createAiLayer(deps: AiLayerDeps): AiLayer {
  const { db, bus, env, log, now } = deps;

  const breaker = new CircuitBreaker({
    threshold: env.AI_BREAKER_THRESHOLD,
    cooldownMs: env.AI_BREAKER_COOLDOWN_MS,
    now: deps.monotonicNow ?? (() => performance.now()),
  });

  const apiKey = env.ANTHROPIC_API_KEY;
  const provider = apiKey
    ? (deps.provider ??
      createAnthropicProvider({ apiKey, baseURL: env.AI_BASE_URL, timeoutMs: env.AI_TIMEOUT_MS, maxRetries: env.AI_MAX_RETRIES }))
    : null;

  const llm = createGuardedLlm({
    provider,
    disabled: env.AI_DISABLED,
    breaker,
    log,
    record: async (row) => {
      await db.insert(aiCalls).values({
        ticketId: row.ticketId,
        purpose: row.purpose,
        model: row.model,
        outcome: row.outcome,
        errorType: row.errorType,
        inputTokens: row.usage.inputTokens,
        outputTokens: row.usage.outputTokens,
        cacheReadTokens: row.usage.cacheReadTokens,
        cacheWriteTokens: row.usage.cacheWriteTokens,
        latencyMs: row.latencyMs,
      });
    },
  });

  return {
    classification: createClassificationQueue({ db, bus, log, llm, env, now }),
    drafts: createDraftService({ db, log, llm, env, now }),
    status: {
      available: () => llm.unavailableReason() === null,
      models: () => ({ classify: env.AI_CLASSIFY_MODEL, draft: env.AI_DRAFT_MODEL }),
    },
    answers: createAnswerService({ db, log, llm, model: env.AI_DRAFT_MODEL, now }),
  };
}
