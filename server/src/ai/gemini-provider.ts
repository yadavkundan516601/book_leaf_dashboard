/**
 * LlmProvider backed by Google's Gemini API (`@google/genai`). Only
 * constructed when a Gemini key is configured; the key never leaves the
 * server process and is never logged.
 *
 * Built for uncertainty about which model ids a given key may use and for
 * tight free-tier quotas:
 *  - a model fallback chain: on "model not found" the next known-good model is
 *    tried and the working one is remembered for the process lifetime;
 *  - an own retry loop (the SDK's is disabled) with exponential backoff and
 *    jitter that honours the server's RetryInfo, inside one overall deadline;
 *  - thinking kept low per model family, dropped for a model that rejects it.
 * Structured output uses JSON mode with a JSON Schema derived from the zod
 * schema; zod stays the source of truth (Gemini ignores e.g. maxLength), with
 * one repair round trip when the reply does not validate.
 */
import { ApiError, GoogleGenAI, ThinkingLevel, type GenerateContentParameters, type ThinkingConfig } from "@google/genai";
import { z } from "zod";
import type { Logger } from "../lib/logger.js";
import { AiError, ZERO_USAGE, type LlmProvider, type LlmRequest, type LlmUsage, type StructuredRequest } from "./provider.js";

/** The subset of a generateContent response this provider reads. */
export interface GeminiResponse {
  text?: string | undefined;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    cachedContentTokenCount?: number;
    thoughtsTokenCount?: number;
  };
  candidates?: { finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

/** The subset of the SDK client this provider uses (test seam). */
export interface GeminiClient {
  models: { generateContent(params: GenerateContentParameters): Promise<GeminiResponse> };
}

export interface GeminiProviderOptions {
  apiKey: string;
  /** Overall budget of one provider call, retries and fallbacks included. */
  timeoutMs: number;
  /** Retries after the first attempt, for transient failures only. */
  maxRetries: number;
  /** Test seam: replaces the SDK client. */
  client?: GeminiClient;
  log?: Logger;
  /** Test seams for the backoff. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
}

const LITE_FALLBACKS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite"];
// gemini-3.6-flash first: it answered in ~3 s in live tests; gemini-3.8-flash timed out (see README).
// Order = preference when the first is unavailable or out of quota: the proven fast models first, 3.8 last.
const FLASH_FALLBACKS = ["gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-2.5-flash"];

/** The configured model first, then known-good fallbacks of the same tier. */
export function modelCandidates(configured: string): string[] {
  const fallbacks = /lite/.test(configured) ? LITE_FALLBACKS : FLASH_FALLBACKS;
  return [configured, ...fallbacks.filter((m) => m !== configured)];
}

/** Smallest X-Server-Timeout the Gemini API accepts. */
export const MIN_SERVER_DEADLINE_MS = 10_000;
const BACKOFF_BASE_MS = 500;
/** Longest single wait between attempts, whatever the server suggests. */
export const MAX_RETRY_DELAY_MS = 15_000;
const RETRYABLE = new Set(["rate_limited", "overloaded", "server", "connection"]);
/** Errors that prove the model id exists (the API accepted it and answered). */
const MODEL_EXISTS = new Set(["rate_limited", "overloaded", "server", "bad_request", "refusal", "invalid_output"]);
const REFUSAL_FINISH = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION", "IMAGE_SAFETY"]);

/** Parses the RetryInfo `retryDelay` ("23s", "1.5s") from an ApiError body, if present. */
function retryDelayMs(message: string): number | undefined {
  const m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(message);
  return m ? Math.round(Number(m[1]) * 1000) : undefined;
}

/** Normalises SDK, HTTP and network errors into AiError kinds. */
export function toGeminiAiError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  const status = e instanceof ApiError ? e.status : typeof (e as { status?: unknown })?.status === "number" ? (e as { status: number }).status : null;
  if (status !== null) {
    if (status === 429) return new AiError("rate_limited", msg, ZERO_USAGE, undefined, retryDelayMs(msg));
    if (status === 503 || status === 529) return new AiError("overloaded", msg);
    if (status >= 500) return new AiError("server", msg);
    if (status === 401 || status === 403) return new AiError("auth", msg);
    if (status === 404) return new AiError("model_not_found", msg);
    if (status === 408) return new AiError("timeout", msg);
    // Google reports a wrong or revoked key as HTTP 400 INVALID_ARGUMENT ("API key not valid"), not 401.
    if (status === 400 && /API_KEY_INVALID|API key not valid|API key expired|API key was reported as (leaked|invalid)/i.test(msg)) {
      return new AiError("auth", msg);
    }
    if (status === 400) return new AiError("bad_request", msg);
    return new AiError("unknown", msg);
  }
  const name = (e as { name?: unknown })?.name;
  if (name === "AbortError" || name === "TimeoutError") return new AiError("timeout", msg);
  // undici reports network failures as TypeError("fetch failed") with a system error as cause.
  const cause = (e as { cause?: { code?: unknown } })?.cause;
  if ((e instanceof TypeError && /fetch failed|network/i.test(msg)) || typeof cause?.code === "string") {
    return new AiError("connection", msg);
  }
  return new AiError("unknown", msg);
}

function mapUsage(u: GeminiResponse["usageMetadata"]): LlmUsage {
  const cached = u?.cachedContentTokenCount ?? 0;
  return {
    // promptTokenCount includes cached tokens; keep them apart as Anthropic does.
    inputTokens: Math.max(0, (u?.promptTokenCount ?? 0) - cached),
    // Thought tokens are billed as output.
    outputTokens: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0),
    cacheReadTokens: cached,
    cacheWriteTokens: 0,
  };
}

const addUsage = (a: LlmUsage, b: LlmUsage): LlmUsage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
});

/** Thinking config for a model family, or undefined to leave the model's default. */
export function thinkingConfigFor(model: string, thinking: LlmRequest["thinking"] = "low"): ThinkingConfig | undefined {
  if (thinking === "default") return undefined;
  if (/gemini-(3|4)/.test(model)) return { thinkingLevel: thinking === "off" ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW };
  if (/gemini-2\.5/.test(model)) {
    if (thinking === "off" || /lite/.test(model)) return { thinkingBudget: 0 };
    return { thinkingBudget: 512 };
  }
  return undefined;
}

/**
 * Gemini counts thinking tokens against maxOutputTokens, so a small answer budget plus any thinking can
 * leave nothing for the answer (empty or truncated output). Add room for the thinking the request allows.
 */
export function outputHeadroom(thinkingConfig: ThinkingConfig | undefined, model: string): number {
  if (!thinkingConfig) return /gemini-(2\.5|3|4)/.test(model) ? 2048 : 0; // model default = dynamic thinking
  if (thinkingConfig.thinkingBudget !== undefined) return thinkingConfig.thinkingBudget;
  return thinkingConfig.thinkingLevel === ThinkingLevel.MINIMAL ? 128 : 768;
}

/** zod -> the JSON Schema subset Gemini accepts: inlined, no $schema / additionalProperties. */
export function toGeminiJsonSchema(schema: z.ZodType): unknown {
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) {
        if (k === "$schema" || k === "additionalProperties") continue;
        out[k] = strip(v);
      }
      return out;
    }
    return node;
  };
  return strip(z.toJSONSchema(schema, { target: "draft-7", io: "output", reused: "inline", unrepresentable: "any" }));
}

/** Models sometimes wrap JSON in a markdown fence despite JSON mode. */
export function stripCodeFences(text: string): string {
  const m = /^\s*```(?:json)?\s*\n?([\s\S]*?)\n?\s*```\s*$/i.exec(text);
  return (m ? m[1]! : text).trim();
}

type ParseOutcome<T> = { ok: true; value: T } | { ok: false; error: string };

function parseStructured<T>(raw: string, schema: z.ZodType<T>): ParseOutcome<T> {
  let json: unknown;
  try {
    json = JSON.parse(stripCodeFences(raw));
  } catch (e) {
    return { ok: false, error: `not valid JSON (${e instanceof Error ? e.message : String(e)})` };
  }
  const parsed = schema.safeParse(json);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ") };
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createGeminiProvider(opts: GeminiProviderOptions): LlmProvider {
  // The SDK's own retries are off: retries are counted and paced here, inside one deadline.
  const client: GeminiClient =
    opts.client ?? new GoogleGenAI({ apiKey: opts.apiKey, httpOptions: { retryOptions: { attempts: 1 } } });
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? (() => Date.now());
  const random = opts.random ?? Math.random;

  /** configured model id -> model id that answered (process lifetime). */
  const resolvedModel = new Map<string, string>();
  /** Models whose id the API said does not exist (skipped from then on). */
  const missing = new Set<string>();
  /** model id -> when its quota resets. Free-tier daily limits are per model, so a spent model is skipped, not waited on. */
  const cooldown = new Map<string, number>();
  /** Models that rejected thinkingConfig with a 400. */
  const noThinking = new Set<string>();

  /** One model, with the transient-failure retry loop and the no-thinking retry. */
  async function callModel(
    model: string,
    req: LlmRequest,
    contents: GenerateContentParameters["contents"],
    extra: GenerateContentParameters["config"],
    deadline: number,
  ): Promise<GeminiResponse> {
    let retries = 0;
    for (;;) {
      const remaining = deadline - now();
      if (remaining <= 0) throw new AiError("timeout", `Gemini call exceeded ${opts.timeoutMs} ms`);
      const thinkingConfig = noThinking.has(model) ? undefined : thinkingConfigFor(model, req.thinking);
      try {
        return await client.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction: req.system,
            maxOutputTokens: req.maxTokens + outputHeadroom(thinkingConfig, model),
            ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
            ...(thinkingConfig ? { thinkingConfig } : {}),
            ...extra,
            // Google rejects a server deadline under 10 s ("deadline 1s is too short"), which is what a retry
            // late in the budget would send. Below that, skip the header and enforce the limit on our side.
            ...(remaining >= MIN_SERVER_DEADLINE_MS ? { httpOptions: { timeout: remaining } } : {}),
            abortSignal: AbortSignal.timeout(remaining),
          },
        });
      } catch (e) {
        const err = toGeminiAiError(e);
        if (err.kind === "bad_request" && thinkingConfig && /thinking/i.test(err.message)) {
          noThinking.add(model);
          opts.log?.warn({ model }, "Gemini model rejected thinkingConfig; sending requests without it");
          continue;
        }
        if (!RETRYABLE.has(err.kind) || retries >= opts.maxRetries) throw err;
        // A wait this long is a spent quota (e.g. the daily free-tier limit), not a burst: waiting won't help.
        if (err.kind === "rate_limited" && (err.retryAfterMs ?? 0) > MAX_RETRY_DELAY_MS) throw err;
        const backoff = BACKOFF_BASE_MS * 2 ** retries * (0.5 + random() / 2);
        const delay = Math.min(MAX_RETRY_DELAY_MS, err.retryAfterMs ?? backoff);
        if (now() + delay >= deadline) throw err;
        retries += 1;
        await sleep(delay);
      }
    }
  }

  /** Walks the fallback chain on model_not_found; remembers the model that answered. */
  async function generate(
    req: LlmRequest,
    contents: GenerateContentParameters["contents"],
    extra: GenerateContentParameters["config"],
    deadline: number,
  ): Promise<{ res: GeminiResponse; model: string }> {
    const chain = modelCandidates(req.model);
    const usable = (m: string) => !missing.has(m) && (cooldown.get(m) ?? 0) <= now();
    let candidates = chain.filter(usable);
    if (!candidates.length) {
      // Everything was ruled out earlier: forget the "missing" verdicts and try the chain once more.
      missing.clear();
      candidates = chain.filter(usable);
      if (!candidates.length) {
        const soonest = Math.min(...chain.map((m) => (cooldown.get(m) ?? 0) - now()));
        throw new AiError("rate_limited", "Every candidate Gemini model has used its quota for now", ZERO_USAGE, undefined, Math.max(0, soonest));
      }
    }
    let lastErr: AiError | null = null;
    for (const model of candidates) {
      try {
        const res = await callModel(model, req, contents, extra, deadline);
        remember(req.model, model);
        return { res, model };
      } catch (e) {
        const err = toGeminiAiError(e);
        if (err.kind === "model_not_found") {
          missing.add(model);
          lastErr = err;
          continue;
        }
        if (err.kind === "rate_limited" && (err.retryAfterMs ?? 0) > MAX_RETRY_DELAY_MS) {
          cooldown.set(model, now() + (err.retryAfterMs ?? 0));
          opts.log?.warn({ model, resetsInMs: err.retryAfterMs }, `Gemini model ${model} has used its quota, trying the next model`);
          lastErr = err;
          continue;
        }
        if (MODEL_EXISTS.has(err.kind)) remember(req.model, model);
        throw err;
      }
    }
    throw lastErr ?? new AiError("model_not_found", `No Gemini model available for ${req.model}`);
  }

  function remember(configured: string, model: string) {
    if (resolvedModel.get(configured) === model) return;
    resolvedModel.set(configured, model);
    if (model !== configured) opts.log?.warn({ configured, model }, `Gemini model ${configured} unavailable, using ${model}`);
  }

  /** Refusals and empty output, checked before the text is used. */
  function checkResponse(res: GeminiResponse, usage: LlmUsage): string {
    const block = res.promptFeedback?.blockReason;
    if (block) throw new AiError("refusal", `Prompt blocked: ${block}`, usage);
    const finish = res.candidates?.[0]?.finishReason ?? null;
    if (finish && REFUSAL_FINISH.has(finish)) throw new AiError("refusal", `Response blocked: ${finish}`, usage);
    return (res.text ?? "").trim();
  }

  const finishOf = (res: GeminiResponse) => res.candidates?.[0]?.finishReason ?? null;

  return {
    async structured<T>(req: StructuredRequest<T>) {
      const deadline = now() + opts.timeoutMs;
      const json = { responseMimeType: "application/json", responseJsonSchema: toGeminiJsonSchema(req.schema) };

      const first = await generate(req, req.user, json, deadline);
      let usage = mapUsage(first.res.usageMetadata);
      const raw = checkResponse(first.res, usage);
      if (!raw) throw new AiError("invalid_output", "Empty response", usage);
      const parsed = parseStructured(raw, req.schema);
      if (parsed.ok) return { value: parsed.value, usage, model: first.model, stopReason: finishOf(first.res) };
      if (finishOf(first.res) === "MAX_TOKENS") throw new AiError("invalid_output", "Output truncated at max_tokens", usage);

      // One repair round trip: show the model its reply and what was wrong with it.
      const repair = await generate(
        req,
        [
          { role: "user", parts: [{ text: req.user }] },
          { role: "model", parts: [{ text: raw }] },
          {
            role: "user",
            parts: [{ text: `Your reply did not match the required JSON schema: ${parsed.error}. Reply again with only the corrected JSON object.` }],
          },
        ],
        json,
        deadline,
      );
      usage = addUsage(usage, mapUsage(repair.res.usageMetadata));
      const repairedRaw = checkResponse(repair.res, usage);
      const repaired = parseStructured(repairedRaw, req.schema);
      if (repaired.ok) return { value: repaired.value, usage, model: repair.model, stopReason: finishOf(repair.res) };
      throw new AiError("invalid_output", `Structured output invalid after repair: ${repaired.error}`, usage);
    },

    async text(req) {
      const deadline = now() + opts.timeoutMs;
      const { res, model } = await generate(req, req.user, {}, deadline);
      const usage = mapUsage(res.usageMetadata);
      const text = checkResponse(res, usage);
      if (!text) throw new AiError("invalid_output", finishOf(res) === "MAX_TOKENS" ? "Output truncated at max_tokens" : "Empty response", usage);
      // A reply cut off mid-sentence must never reach an admin (or the draft cache): treat it as unusable.
      if (finishOf(res) === "MAX_TOKENS") throw new AiError("invalid_output", "Output truncated at max_tokens", usage);
      return { value: text, usage, model, stopReason: finishOf(res) };
    },
  };
}

/**
 * Lists the model ids this key can use (without the "models/" prefix).
 * Returns null when listing fails: it is a diagnostic, never a boot blocker.
 */
export async function listAvailableModels(apiKey: string, client?: { models: { list(): Promise<AsyncIterable<{ name?: string }>> } }): Promise<string[] | null> {
  try {
    const c = client ?? new GoogleGenAI({ apiKey });
    const pager = await c.models.list();
    const names: string[] = [];
    for await (const m of pager) if (m.name) names.push(m.name.replace(/^models\//, ""));
    return names;
  } catch {
    return null;
  }
}

/** Startup diagnostic: logs which candidate models exist for the configured ids. */
export async function checkGeminiModels(apiKey: string, configured: string[], log: Logger): Promise<void> {
  const available = await listAvailableModels(apiKey);
  if (!available) {
    log.warn("could not list Gemini models; model fallback will resolve on first use");
    return;
  }
  for (const model of new Set(configured)) {
    const candidates = modelCandidates(model).map((m) => ({ model: m, available: available.includes(m) }));
    const level = candidates[0]!.available ? "info" : "warn";
    log[level]({ configured: model, candidates }, "Gemini model availability");
  }
}

/**
 * First request to a Gemini model after idle can take 20 s+ (observed live on the free tier), which would hit the
 * request timeout and push the first admin to a template. Sending a tiny request per model at startup absorbs that
 * cold start. Best effort: failures are only logged, and it bypasses the limiter, breaker and call log on purpose.
 */
export async function warmUpGemini(apiKey: string, models: string[], log: Logger, provider?: LlmProvider): Promise<void> {
  const p = provider ?? createGeminiProvider({ apiKey, timeoutMs: 60_000, maxRetries: 0 });
  for (const model of new Set(models)) {
    const started = Date.now();
    try {
      const r = await p.text({ model, system: "Reply with one word.", user: "ping", maxTokens: 8, thinking: "off" });
      log.info({ model: r.model, ms: Date.now() - started }, "Gemini model warmed up");
    } catch (err) {
      log.warn({ model, ms: Date.now() - started, kind: (err as { kind?: string }).kind }, "Gemini warm-up failed (first real request may be slow)");
    }
  }
}
