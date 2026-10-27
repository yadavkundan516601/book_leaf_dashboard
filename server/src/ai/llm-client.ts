/**
 * The only path to the LLM. Short-circuits (no network) when AI is not
 * configured, disabled, or the circuit is open; records one `ai_calls` row
 * per attempt for cost/latency/reliability reporting; feeds the breaker.
 * Every failure surfaces as an AiError so callers can fall back.
 */
import type { Logger } from "../lib/logger.js";
import type { CircuitBreaker } from "./circuit-breaker.js";
import {
  AiError,
  asAiError,
  type LlmProvider,
  type LlmRequest,
  type LlmResult,
  type LlmUsage,
  type StructuredRequest,
  type UnavailableReason,
} from "./provider.js";
import type { RateLimiter } from "./rate-limiter.js";

export type CallPurpose = "classify" | "draft" | "answer";

export interface AiCallRecord {
  ticketId: string | null;
  purpose: CallPurpose;
  model: string;
  outcome: "success" | "error";
  errorType: string | null;
  usage: LlmUsage;
  latencyMs: number;
}

export interface GuardedLlm {
  structured<T>(purpose: CallPurpose, ticketId: string | null, req: StructuredRequest<T>): Promise<LlmResult<T>>;
  text(purpose: CallPurpose, ticketId: string | null, req: LlmRequest): Promise<LlmResult<string>>;
  /** null when a call would be attempted. */
  unavailableReason(): UnavailableReason | null;
}

/**
 * Errors that say the service answered (so it is healthy) but the output was
 * unusable, or the configured model id is wrong (a config problem the breaker
 * cannot fix by waiting).
 */
const HEALTHY_FAILURES = new Set(["refusal", "invalid_output", "model_not_found"]);

export function createGuardedLlm(deps: {
  provider: LlmProvider | null;
  disabled: boolean;
  breaker: CircuitBreaker;
  record: (row: AiCallRecord) => Promise<void>;
  log: Logger;
  /** Paces outgoing calls (free-tier quotas). A rejection is local: no ai_calls row, no breaker effect. */
  limiter?: RateLimiter;
}): GuardedLlm {
  const unavailableReason = (): UnavailableReason | null => {
    if (!deps.provider) return "not_configured";
    if (deps.disabled) return "disabled";
    if (deps.breaker.state() === "open") return "circuit_open";
    return null;
  };

  async function guarded<T>(
    purpose: CallPurpose,
    ticketId: string | null,
    model: string,
    call: (p: LlmProvider) => Promise<LlmResult<T>>,
  ): Promise<LlmResult<T>> {
    const reason = unavailableReason();
    if (reason || !deps.provider) throw new AiError("unavailable", `AI unavailable: ${reason}`, undefined, reason ?? "not_configured");
    if (deps.limiter) {
      try {
        await deps.limiter.acquire();
      } catch (e) {
        const err = asAiError(e);
        deps.log.warn({ purpose, ticketId, kind: err.kind, err: err.message }, "AI call throttled locally");
        throw err;
      }
    }
    if (!deps.breaker.tryAcquire()) throw new AiError("unavailable", "AI unavailable: circuit_open", undefined, "circuit_open");

    const started = performance.now();
    const latency = () => Math.round(performance.now() - started);
    try {
      const result = await call(deps.provider);
      deps.breaker.onSuccess();
      await safeRecord({ ticketId, purpose, model, outcome: "success", errorType: null, usage: result.usage, latencyMs: latency() });
      return result;
    } catch (e) {
      const err = asAiError(e);
      if (HEALTHY_FAILURES.has(err.kind)) deps.breaker.onSuccess();
      else deps.breaker.onFailure({ immediate: err.kind === "auth" });
      deps.log.warn({ purpose, ticketId, kind: err.kind, err: err.message }, "AI call failed");
      await safeRecord({ ticketId, purpose, model, outcome: "error", errorType: err.kind, usage: err.usage, latencyMs: latency() });
      throw err;
    }
  }

  /** Accounting must never break the request it accounts for. */
  async function safeRecord(row: AiCallRecord) {
    try {
      await deps.record(row);
    } catch (e) {
      deps.log.warn({ err: e instanceof Error ? e.message : String(e) }, "failed to record ai_call");
    }
  }

  return {
    unavailableReason,
    structured: (purpose, ticketId, req) => guarded(purpose, ticketId, req.model, (p) => p.structured(req)),
    text: (purpose, ticketId, req) => guarded(purpose, ticketId, req.model, (p) => p.text(req)),
  };
}
