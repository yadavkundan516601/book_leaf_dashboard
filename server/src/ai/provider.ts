/**
 * Provider-agnostic LLM interface. The rest of the AI layer only sees this,
 * so the vendor SDK (Gemini or Anthropic) can be swapped or faked (tests
 * never hit the network).
 */
import type { z } from "zod";

export type AiErrorKind =
  | "timeout"
  | "connection"
  | "rate_limited"
  | "overloaded"
  | "server"
  | "auth"
  | "bad_request"
  /** The configured model id does not exist (or is not offered to this key). Not a service outage. */
  | "model_not_found"
  | "refusal"
  | "invalid_output"
  | "unavailable"
  | "unknown";

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export const ZERO_USAGE: LlmUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

/** Why the guarded client refused to call out (kind = "unavailable"). */
export type UnavailableReason = "not_configured" | "disabled" | "circuit_open";

export class AiError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    message: string,
    /** Tokens billed before the failure (refusal, truncated output), if known. */
    readonly usage: LlmUsage = ZERO_USAGE,
    readonly reason?: UnavailableReason,
    /** Server-suggested wait before retrying (rate limits), when the provider exposes one. */
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "AiError";
  }
}

export interface LlmRequest {
  model: string;
  /** Static instructions. Sent first and marked cacheable. */
  system: string;
  /** Per-ticket content. Sent last so it never breaks the cached prefix. */
  user: string;
  maxTokens: number;
  temperature?: number;
  /**
   * Reasoning effort for providers with thinking models (Gemini). Defaults to
   * "low": classification and drafts want latency, and thought tokens are
   * billed as output. Providers without the concept ignore it.
   */
  thinking?: "off" | "low" | "default";
}

export interface StructuredRequest<T> extends LlmRequest {
  schema: z.ZodType<T>;
}

export interface LlmResult<T> {
  value: T;
  usage: LlmUsage;
  model: string;
  stopReason: string | null;
}

export interface LlmProvider {
  structured<T>(req: StructuredRequest<T>): Promise<LlmResult<T>>;
  text(req: LlmRequest): Promise<LlmResult<string>>;
}

/** Normalises anything thrown by a provider into an AiError. */
export function asAiError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  return new AiError("unknown", e instanceof Error ? e.message : String(e));
}
