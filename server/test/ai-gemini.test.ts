/** Gemini provider, request limiter and provider config. Never touches the network: the SDK client is a fake. */
import { ApiError, ThinkingLevel, type GenerateContentParameters } from "@google/genai";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CircuitBreaker } from "../src/ai/circuit-breaker.js";
import { createGeminiProvider, MAX_RETRY_DELAY_MS, modelCandidates, toGeminiAiError, type GeminiResponse } from "../src/ai/gemini-provider.js";
import { createGuardedLlm } from "../src/ai/llm-client.js";
import { estimateCostUsd } from "../src/ai/pricing.js";
import { AiError } from "../src/ai/provider.js";
import { createRateLimiter, type LimiterClock } from "../src/ai/rate-limiter.js";
import { loadEnv } from "../src/config/env.js";
import { createLogger } from "../src/lib/logger.js";

const schema = z.object({ category: z.enum(["royalty", "other"]), note: z.string().max(10) });
const REQ = { model: "gemini-3.5-flash-lite", system: "sys", user: "hello", maxTokens: 200, schema };
const ok = (text: string, extra: Partial<GeminiResponse> = {}): GeminiResponse => ({
  text,
  usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 },
  candidates: [{ finishReason: "STOP" }],
  ...extra,
});
const apiError = (status: number, body: object = {}) => new ApiError({ message: JSON.stringify({ error: { code: status, ...body } }), status });

type Step = GeminiResponse | Error | ((p: GenerateContentParameters) => GeminiResponse | Error);

/** Fake SDK client answering from a script; records every request. */
function fakeGemini(steps: Step[], opts: { maxRetries?: number; timeoutMs?: number } = {}) {
  const calls: GenerateContentParameters[] = [];
  const sleeps: number[] = [];
  let clock = 0;
  const warnings: string[] = [];
  const log = { warn: (_o: unknown, msg?: string) => void warnings.push(msg ?? "") } as never;
  const provider = createGeminiProvider({
    apiKey: "unused",
    timeoutMs: opts.timeoutMs ?? 20_000,
    maxRetries: opts.maxRetries ?? 2,
    log,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    random: () => 1,
    client: {
      models: {
        generateContent: async (p) => {
          calls.push(p);
          const step = steps.shift();
          if (!step) throw new Error("fake: no scripted answer left");
          const r = typeof step === "function" ? step(p) : step;
          if (r instanceof Error) throw r;
          return r;
        },
      },
    },
  });
  return { provider, calls, sleeps, warnings };
}

describe("gemini provider: structured output", () => {
  it("parses fenced JSON, sends JSON mode with a schema derived from zod and the system prompt", async () => {
    const f = fakeGemini([ok('```json\n{"category":"royalty","note":"hi"}\n```')]);
    const res = await f.provider.structured(REQ);
    expect(res.value).toEqual({ category: "royalty", note: "hi" });
    expect(res.model).toBe("gemini-3.5-flash-lite");
    const config = f.calls[0]!.config!;
    expect(config).toMatchObject({ systemInstruction: "sys", maxOutputTokens: 200, responseMimeType: "application/json" });
    const js = config.responseJsonSchema as Record<string, unknown>;
    expect(js).toMatchObject({ type: "object", required: ["category", "note"] });
    expect(JSON.stringify(js)).not.toMatch(/additionalProperties|\$schema/);
  });

  it("repairs once with the validation errors, then gives up with invalid_output and the summed usage", async () => {
    const f = fakeGemini([ok('{"category":"royalty","note":"far too long a note"}'), ok("not json")]);
    const err = await f.provider.structured(REQ).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.kind).toBe("invalid_output");
    expect(err.usage.inputTokens).toBe(200);
    expect(f.calls).toHaveLength(2);
    const repair = JSON.stringify(f.calls[1]!.contents);
    expect(repair).toContain("note");
    expect(repair).toContain("far too long a note");

    const g = fakeGemini([ok("{oops"), ok('{"category":"other","note":"ok"}')]);
    expect((await g.provider.structured(REQ)).value).toEqual({ category: "other", note: "ok" });
  });

  it("does not repair truncated output (MAX_TOKENS)", async () => {
    const f = fakeGemini([ok('{"category":"roy', { candidates: [{ finishReason: "MAX_TOKENS" }] })]);
    await expect(f.provider.structured(REQ)).rejects.toMatchObject({ kind: "invalid_output" });
    expect(f.calls).toHaveLength(1);
  });

  it("maps usage: cached tokens apart from input, thought tokens billed as output", async () => {
    const f = fakeGemini([
      ok("Hello", { usageMetadata: { promptTokenCount: 1000, cachedContentTokenCount: 600, candidatesTokenCount: 50, thoughtsTokenCount: 30 } }),
    ]);
    const res = await f.provider.text(REQ);
    expect(res.value).toBe("Hello");
    expect(res.usage).toEqual({ inputTokens: 400, outputTokens: 80, cacheReadTokens: 600, cacheWriteTokens: 0 });
  });

  it("treats safety blocks as refusal and empty text as invalid_output", async () => {
    await expect(fakeGemini([ok("", { candidates: [{ finishReason: "SAFETY" }] })]).provider.text(REQ)).rejects.toMatchObject({ kind: "refusal" });
    await expect(fakeGemini([ok("", { promptFeedback: { blockReason: "PROHIBITED_CONTENT" } })]).provider.structured(REQ)).rejects.toMatchObject({
      kind: "refusal",
    });
    await expect(fakeGemini([ok("  ")]).provider.text(REQ)).rejects.toMatchObject({ kind: "invalid_output" });
  });
});

describe("gemini provider: errors and retries", () => {
  it("maps HTTP statuses and transport failures to AiError kinds", () => {
    const quota = toGeminiAiError(
      apiError(429, { status: "RESOURCE_EXHAUSTED", details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "23s" }] }),
    );
    expect([quota.kind, quota.retryAfterMs]).toEqual(["rate_limited", 23_000]);
    const table: [unknown, string][] = [
      [apiError(503), "overloaded"],
      [apiError(500), "server"],
      [apiError(401), "auth"],
      [apiError(403), "auth"],
      [apiError(404), "model_not_found"],
      [apiError(400), "bad_request"],
      // Observed from the real API: a wrong key is HTTP 400 INVALID_ARGUMENT, not 401.
      [apiError(400, { message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT" }), "auth"],
      [Object.assign(new Error("This operation was aborted"), { name: "AbortError" }), "timeout"],
      [new DOMException("signal timed out", "TimeoutError"), "timeout"],
      [new TypeError("fetch failed", { cause: { code: "ECONNRESET" } }), "connection"],
      [new Error("weird"), "unknown"],
    ];
    for (const [e, kind] of table) expect(toGeminiAiError(e).kind, String(e)).toBe(kind);
  });

  it("retries transient failures with backoff, honouring retryDelay capped at 15 s", async () => {
    const retryIn = (s: string) => apiError(429, { details: [{ retryDelay: s }] });
    const f = fakeGemini([retryIn("2s"), retryIn("90s"), ok("done")], { maxRetries: 2, timeoutMs: 60_000 });
    expect((await f.provider.text(REQ)).value).toBe("done");
    expect(f.sleeps).toEqual([2_000, MAX_RETRY_DELAY_MS]);

    const g = fakeGemini([apiError(500), apiError(503), apiError(500)], { maxRetries: 2 });
    await expect(g.provider.text(REQ)).rejects.toMatchObject({ kind: "server" });
    expect(g.calls).toHaveLength(3);
    expect(g.sleeps).toEqual([500, 1_000]); // exponential, jitter pinned to its maximum

    const noRetry = fakeGemini([apiError(400)]);
    await expect(noRetry.provider.text(REQ)).rejects.toMatchObject({ kind: "bad_request" });
    expect(noRetry.calls).toHaveLength(1);
  });

  it("never sleeps past the overall timeout", async () => {
    const f = fakeGemini([apiError(429, { details: [{ retryDelay: "10s" }] }), ok("late")], { timeoutMs: 5_000 });
    await expect(f.provider.text(REQ)).rejects.toMatchObject({ kind: "rate_limited" });
    expect(f.sleeps).toEqual([]);
  });
});

describe("gemini provider: model fallback and thinking", () => {
  it("falls back to the next candidate on model_not_found, once, and remembers it", async () => {
    expect(modelCandidates("gemini-3.5-flash-lite")).toEqual(["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite"]);
    expect(modelCandidates("my-model")).toEqual(["my-model", "gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"]);

    const f = fakeGemini([apiError(404), ok("one"), ok("two")]);
    const first = await f.provider.text(REQ);
    const second = await f.provider.text(REQ);
    expect(f.calls.map((c) => c.model)).toEqual(["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.1-flash-lite"]);
    expect([first.model, second.model]).toEqual(["gemini-3.1-flash-lite", "gemini-3.1-flash-lite"]);
    expect(f.warnings).toEqual(["Gemini model gemini-3.5-flash-lite unavailable, using gemini-3.1-flash-lite"]);

    const none = fakeGemini([apiError(404), apiError(404), apiError(404)]);
    await expect(none.provider.text(REQ)).rejects.toMatchObject({ kind: "model_not_found" });
  });

  it("picks thinking config per model family and request knob", async () => {
    const f = fakeGemini([ok("a"), ok("b"), ok("c"), ok("d"), ok("e")]);
    await f.provider.text({ ...REQ, model: "gemini-3.8-flash" });
    await f.provider.text({ ...REQ, model: "gemini-3.8-flash", thinking: "off" });
    await f.provider.text({ ...REQ, model: "gemini-2.5-flash-lite" });
    await f.provider.text({ ...REQ, model: "gemini-2.5-flash" });
    await f.provider.text({ ...REQ, model: "gemini-3.8-flash", thinking: "default" });
    expect(f.calls.map((c) => c.config!.thinkingConfig)).toEqual([
      { thinkingLevel: ThinkingLevel.LOW },
      { thinkingLevel: ThinkingLevel.MINIMAL },
      { thinkingBudget: 0 },
      { thinkingBudget: 512 },
      undefined,
    ]);
  });

  it("retries once without thinkingConfig when the model rejects it, and stops sending it", async () => {
    const f = fakeGemini([apiError(400, { message: "thinking_level is not supported for this model" }), ok("a"), ok("b")]);
    await f.provider.text(REQ);
    await f.provider.text(REQ);
    expect(f.calls.map((c) => c.config!.thinkingConfig)).toEqual([{ thinkingLevel: ThinkingLevel.LOW }, undefined, undefined]);
  });
});

describe("guarded client with Gemini errors", () => {
  it("does not open the breaker on model_not_found, but does on auth", async () => {
    const breaker = new CircuitBreaker({ threshold: 2, cooldownMs: 60_000, now: () => 0 });
    let kind: "model_not_found" | "auth" = "model_not_found";
    const llm = createGuardedLlm({
      provider: {
        text: async () => {
          throw new AiError(kind, kind);
        },
        structured: async () => {
          throw new Error("unused");
        },
      },
      disabled: false,
      breaker,
      record: async () => {},
      log: createLogger("silent", false),
    });
    for (let i = 0; i < 5; i++) await expect(llm.text("draft", null, REQ)).rejects.toMatchObject({ kind: "model_not_found" });
    expect(breaker.state()).toBe("closed");
    kind = "auth";
    await expect(llm.text("draft", null, REQ)).rejects.toMatchObject({ kind: "auth" });
    expect(breaker.state()).toBe("open");
  });
});

/** Manual clock: timers fire only when the test advances time. */
function manualClock() {
  let t = 0;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const clock: LimiterClock & { advance(ms: number): Promise<void> } = {
    now: () => t,
    setTimeout: (fn, ms) => {
      timers.set(++seq, { at: t + ms, fn });
      return seq;
    },
    clearTimeout: (h) => void timers.delete(h as number),
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        const next = [...timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]);
        t = next[1].at;
        next[1].fn();
        await Promise.resolve();
      }
      t = end;
      await Promise.resolve();
    },
  };
  return clock;
}

describe("rate limiter", () => {
  it("admits the limit at once, then makes callers wait FIFO for the window to slide", async () => {
    const clock = manualClock();
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000, maxWaitMs: 8_000, clock });
    await limiter.acquire();
    await clock.advance(55_000);
    await limiter.acquire();

    const order: string[] = [];
    const a = limiter.acquire().then(() => order.push("a"));
    expect(limiter.queued()).toBe(1);
    await clock.advance(4_999);
    expect(order).toEqual([]);
    await clock.advance(1);
    await a;
    expect(order).toEqual(["a"]);

    // Next slot frees at 115 s (grant at 55 s): 'b' waits, 'c' cannot get a slot within 8 s and is refused at once.
    await clock.advance(51_000); // t = 111 s; 'c' would get the 120 s slot, 9 s away
    const b = limiter.acquire().then(() => order.push("b"));
    await expect(limiter.acquire()).rejects.toMatchObject({ kind: "rate_limited" });
    await clock.advance(4_000);
    await b;
    expect(order).toEqual(["a", "b"]);
  });

  it("rejects beyond the queue cap and when the wait expires", async () => {
    const clock = manualClock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 1_000, maxWaitMs: 60_000, maxQueue: 2, clock });
    await limiter.acquire();
    const waiting = [limiter.acquire(), limiter.acquire()];
    await expect(limiter.acquire()).rejects.toMatchObject({ kind: "rate_limited", message: expect.stringContaining("queue full") });
    await clock.advance(2_000);
    await Promise.all(waiting);

    const strict = createRateLimiter({ limit: 1, windowMs: 1_000, maxWaitMs: 0, clock });
    await strict.acquire();
    await expect(strict.acquire()).rejects.toMatchObject({ kind: "rate_limited" });
  });

  it("throttles in the guarded client without recording a call or touching the breaker", async () => {
    const clock = manualClock();
    const recorded: unknown[] = [];
    const breaker = new CircuitBreaker({ threshold: 1, cooldownMs: 60_000, now: () => 0 });
    const llm = createGuardedLlm({
      provider: { text: async (r) => ({ value: "x", usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 }, model: r.model, stopReason: null }), structured: async () => { throw new Error("unused"); } },
      disabled: false,
      breaker,
      record: async (row) => void recorded.push(row),
      log: createLogger("silent", false),
      limiter: createRateLimiter({ limit: 1, maxWaitMs: 0, clock }),
    });
    await llm.text("draft", null, REQ);
    await expect(llm.text("draft", null, REQ)).rejects.toMatchObject({ kind: "rate_limited" });
    expect(recorded).toHaveLength(1);
    expect(breaker.state()).toBe("closed");
  });
});

describe("AI provider config", () => {
  const env = (vars: Record<string, string>) => loadEnv({ NODE_ENV: "test", ...vars });

  it("auto prefers Gemini, then Anthropic, else none; explicit choices need their key", () => {
    const pick = (vars: Record<string, string>) => env(vars).AI_ACTIVE_PROVIDER;
    expect(pick({})).toBeNull();
    expect(pick({ GEMINI_API_KEY: "g" })).toBe("gemini");
    expect(pick({ GOOGLE_API_KEY: "g" })).toBe("gemini");
    expect(pick({ ANTHROPIC_API_KEY: "a" })).toBe("anthropic");
    expect(pick({ GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a" })).toBe("gemini");
    expect(pick({ AI_PROVIDER: "anthropic", GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a" })).toBe("anthropic");
    expect(pick({ AI_PROVIDER: "gemini", ANTHROPIC_API_KEY: "a" })).toBeNull();
  });

  it("applies the GOOGLE_API_KEY fallback, provider default models and the free-tier default", () => {
    const g = env({ GOOGLE_API_KEY: "google-key" });
    expect(g).toMatchObject({ GEMINI_API_KEY: "google-key", AI_CLASSIFY_MODEL: "gemini-3.5-flash-lite", AI_DRAFT_MODEL: "gemini-3.8-flash", AI_FREE_TIER: true });
    expect(env({ GEMINI_API_KEY: "a", GOOGLE_API_KEY: "b" }).GEMINI_API_KEY).toBe("a");
    expect(env({ ANTHROPIC_API_KEY: "a" })).toMatchObject({ AI_CLASSIFY_MODEL: "claude-haiku-4-5", AI_DRAFT_MODEL: "claude-haiku-4-5", AI_FREE_TIER: false });
    expect(env({ GEMINI_API_KEY: "g", AI_CLASSIFY_MODEL: "gemini-x", AI_FREE_TIER: "false" })).toMatchObject({ AI_CLASSIFY_MODEL: "gemini-x", AI_FREE_TIER: false });
    expect(env({}).AI_RPM_LIMIT).toBe(12);
    expect(env({}).AI_QUEUE_WAIT_MS).toBe(8_000);
  });

  it("estimates $0 on the free tier and list price otherwise", () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000 };
    expect(estimateCostUsd("gemini-3.5-flash-lite", usage)).toBeCloseTo(2.8);
    expect(estimateCostUsd("gemini-3.5-flash-lite", usage, { freeTier: true })).toBe(0);
  });
});
