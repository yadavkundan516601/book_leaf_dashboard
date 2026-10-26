/** USD per million tokens. Used only for the admin cost dashboard (an estimate). */
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

export function estimateCostUsd(
  model: string,
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number },
): number {
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
