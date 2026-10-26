/**
 * LlmProvider backed by the Anthropic SDK. Only constructed when an API key
 * is configured; the key never leaves the server process.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AiError, type LlmProvider, type LlmUsage } from "./provider.js";

export interface AnthropicProviderOptions {
  apiKey: string;
  baseURL: string;
  timeoutMs: number;
  maxRetries: number;
  /** Test seam: replaces the HTTP transport. */
  fetch?: typeof fetch;
}

/** Most specific first: connection errors are APIError subclasses too. */
export function toAiError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new AiError("timeout", msg);
  if (e instanceof Anthropic.APIConnectionError) return new AiError("connection", msg);
  if (e instanceof Anthropic.RateLimitError) return new AiError("rate_limited", msg);
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return new AiError("auth", msg);
  if (e instanceof Anthropic.BadRequestError) return new AiError("bad_request", msg);
  if (e instanceof Anthropic.InternalServerError) {
    return new AiError(e.status === 529 || e.type === "overloaded_error" ? "overloaded" : "server", msg);
  }
  if (e instanceof Anthropic.APIError) return new AiError("unknown", msg);
  // Non-HTTP SDK errors come from the structured-output parser (bad JSON / schema mismatch).
  if (e instanceof Anthropic.AnthropicError) return new AiError("invalid_output", msg);
  return new AiError("unknown", msg);
}

function mapUsage(u: Anthropic.Usage): LlmUsage {
  return {
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
  };
}

/**
 * Static text first, marked cacheable. Haiku 4.5 only caches prefixes of
 * 4096+ tokens, so today's compact prompts are below the floor; the layout is
 * ready for a larger KB without code changes.
 */
const systemBlocks = (system: string): Anthropic.TextBlockParam[] => [
  { type: "text", text: system, cache_control: { type: "ephemeral" } },
];

function checkStop(stopReason: string | null, usage: LlmUsage) {
  if (stopReason === "refusal") throw new AiError("refusal", "Model declined the request", usage);
  if (stopReason === "max_tokens") throw new AiError("invalid_output", "Output truncated at max_tokens", usage);
}

export function createAnthropicProvider(opts: AnthropicProviderOptions): LlmProvider {
  const client = new Anthropic({
    apiKey: opts.apiKey,
    baseURL: opts.baseURL,
    timeout: opts.timeoutMs,
    maxRetries: opts.maxRetries,
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
  });

  return {
    async structured(req) {
      let res;
      try {
        res = await client.messages.parse({
          model: req.model,
          max_tokens: req.maxTokens,
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
          system: systemBlocks(req.system),
          messages: [{ role: "user", content: req.user }],
          output_config: { format: zodOutputFormat(req.schema) },
        });
      } catch (e) {
        throw toAiError(e);
      }
      const usage = mapUsage(res.usage);
      checkStop(res.stop_reason, usage);
      if (res.parsed_output == null) throw new AiError("invalid_output", "No parseable structured output", usage);
      return { value: res.parsed_output as never, usage, model: res.model, stopReason: res.stop_reason };
    },

    async text(req) {
      let res;
      try {
        res = await client.messages.create({
          model: req.model,
          max_tokens: req.maxTokens,
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
          system: systemBlocks(req.system),
          messages: [{ role: "user", content: req.user }],
        });
      } catch (e) {
        throw toAiError(e);
      }
      const usage = mapUsage(res.usage);
      checkStop(res.stop_reason, usage);
      let text = "";
      for (const block of res.content) if (block.type === "text") text += block.text;
      if (!text.trim()) throw new AiError("invalid_output", "Empty response", usage);
      return { value: text.trim(), usage, model: res.model, stopReason: res.stop_reason };
    },
  };
}
