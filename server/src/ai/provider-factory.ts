/**
 * Builds the vendor provider chosen by the resolved config
 * (env.AI_ACTIVE_PROVIDER). Shared by the app's composition root and the
 * classifier eval script. Returns null when no usable key is configured.
 */
import type { AiProviderName, Env } from "../config/env.js";
import type { Logger } from "../lib/logger.js";
import { createAnthropicProvider } from "./anthropic-provider.js";
import { createGeminiProvider } from "./gemini-provider.js";
import type { LlmProvider } from "./provider.js";

export function createProviderFromEnv(env: Env, log?: Logger): { name: AiProviderName; provider: LlmProvider } | null {
  if (env.AI_ACTIVE_PROVIDER === "gemini" && env.GEMINI_API_KEY) {
    return {
      name: "gemini",
      provider: createGeminiProvider({
        apiKey: env.GEMINI_API_KEY,
        timeoutMs: env.AI_TIMEOUT_MS,
        maxRetries: env.AI_MAX_RETRIES,
        ...(log ? { log } : {}),
      }),
    };
  }
  if (env.AI_ACTIVE_PROVIDER === "anthropic" && env.ANTHROPIC_API_KEY) {
    return {
      name: "anthropic",
      provider: createAnthropicProvider({
        apiKey: env.ANTHROPIC_API_KEY,
        baseURL: env.AI_BASE_URL,
        timeoutMs: env.AI_TIMEOUT_MS,
        maxRetries: env.AI_MAX_RETRIES,
      }),
    };
  }
  return null;
}
