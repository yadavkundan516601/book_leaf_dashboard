/**
 * Composition root of the AI layer. The vendor SDK (Gemini first, Anthropic
 * as the alternative; see AI_PROVIDER) is only constructed when its API key is
 * configured; without one (or with AI_DISABLED, or while the circuit is open)
 * every call short-circuits and the app runs on rules and templates.
 */
import type { AiProviderName, Env } from "../config/env.js";
import type { Db } from "../db/client.js";
import { aiCalls } from "../db/schema.js";
import type { Logger } from "../lib/logger.js";
import type { EventBus } from "../modules/events/bus.js";
import { CircuitBreaker } from "./circuit-breaker.js";
import { createClassificationQueue } from "./classification-queue.js";
import { createDraftService } from "./draft-service.js";
import type { AiLayer } from "./index.js";
import { createGuardedLlm } from "./llm-client.js";
import type { LlmProvider } from "./provider.js";
import { createAnswerService } from "./answer-service.js";
import { createProviderFromEnv } from "./provider-factory.js";
import { createRateLimiter, type LimiterClock } from "./rate-limiter.js";

export { createProviderFromEnv } from "./provider-factory.js";

export interface AiLayerDeps {
  now: () => Date;
  db: Db;
  bus: EventBus;
  env: Env;
  log: Logger;
  /**
   * Replaces the vendor transport (tests). Like the real one it is only used
   * when an LLM key is configured (Gemini, Google or Anthropic): a key is the
   * on/off switch.
   */
  provider?: LlmProvider;
  /** Monotonic clock for the circuit breaker (tests). */
  monotonicNow?: () => number;
  /** Clock for the request limiter (tests). */
  limiterClock?: LimiterClock;
}

/** The provider an injected transport stands in for: the resolved one, else whichever key is set. */
function injectedProviderName(env: Env): AiProviderName | null {
  return env.AI_ACTIVE_PROVIDER ?? (env.GEMINI_API_KEY ? "gemini" : env.ANTHROPIC_API_KEY ? "anthropic" : null);
}

export function createAiLayer(deps: AiLayerDeps): AiLayer {
  const { db, bus, env, log, now } = deps;

  const breaker = new CircuitBreaker({
    threshold: env.AI_BREAKER_THRESHOLD,
    cooldownMs: env.AI_BREAKER_COOLDOWN_MS,
    now: deps.monotonicNow ?? (() => performance.now()),
  });

  let provider: LlmProvider | null = null;
  let providerName: AiProviderName | null = null;
  if (deps.provider) {
    providerName = injectedProviderName(env);
    provider = providerName ? deps.provider : null;
  } else {
    const built = createProviderFromEnv(env, log);
    if (built) ({ provider, name: providerName } = built);
    else if (env.AI_PROVIDER !== "auto") log.warn({ provider: env.AI_PROVIDER }, "AI_PROVIDER is set but its API key is missing; AI is off");
  }

  const llm = createGuardedLlm({
    provider,
    disabled: env.AI_DISABLED,
    breaker,
    log,
    // One limiter per process: classification, drafts and answers share the quota.
    limiter: createRateLimiter({
      limit: env.AI_RPM_LIMIT,
      maxWaitMs: env.AI_QUEUE_WAIT_MS,
      ...(deps.limiterClock ? { clock: deps.limiterClock } : {}),
    }),
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
      provider: () => (provider ? providerName : null),
    },
    answers: createAnswerService({ db, log, llm, model: env.AI_DRAFT_MODEL, now }),
  };
}
