/**
 * USD per million tokens. Used only for the admin cost dashboard (an estimate).
 *
 * Gemini: paid-tier list prices from Google's pricing page; re-check them, they
 * change (gemini-3.8-flash is the introductory price through 2026-12-31).
 * Entries marked "approx." are estimates. Free-tier usage is billed $0, which
 * is what AI_FREE_TIER reports. Thought tokens are already counted as output.
 */
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
  "gemini-3.8-flash": { input: 0.75, output: 3.75 },
  "gemini-3.6-flash": { input: 0.6, output: 3.5 }, // approx.
  "gemini-3.1-flash-lite": { input: 0.25, output: 1.5 }, // approx.
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 }, // approx.
  "gemini-2.5-flash": { input: 0.3, output: 2.5 }, // approx.
};

export function estimateCostUsd(
  model: string,
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number },
  /** freeTier: usage is not billed, the estimate is $0 (token counts are still reported). */
  opts: { freeTier?: boolean } = {},
): number {
  if (opts.freeTier) return 0;
  const p = PRICES[model];
  if (!p) return 0;
  const cacheRead = usage.cacheReadTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  return (
    (usage.inputTokens * p.input +
      cacheRead * p.input * 0.1 +
      cacheWrite * p.input * 1.25 +
      usage.outputTokens * p.output) /
    1_000_000
  );
}
