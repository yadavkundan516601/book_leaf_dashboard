/**
 * AI self-check: confirms the configured LLM key works end to end and says
 * what to fix when it doesn't. Makes two small real calls (triage + a draft),
 * so it needs a key and uses a little of your quota.
 *
 *   npm run ai:doctor -w server
 */
import { classificationSchema, CLASSIFY_MAX_TOKENS, CLASSIFY_SYSTEM } from "../src/ai/prompts.js";
import { AiError, asAiError } from "../src/ai/provider.js";
import { createProviderFromEnv } from "../src/ai/provider-factory.js";
import { listAvailableModels } from "../src/ai/gemini-provider.js";
import { loadEnv } from "../src/config/env.js";
import { createLogger } from "../src/lib/logger.js";

const env = loadEnv();
const log = createLogger("warn", false);
const line = (ok: boolean, text: string) => console.log(`${ok ? "OK  " : "FAIL"} ${text}`);

const HINTS: Record<string, string> = {
  auth: "The key was rejected. Create a new one at https://aistudio.google.com/apikey and set GEMINI_API_KEY in server/.env (no quotes, no spaces).",
  rate_limited: "The free-tier quota is exhausted for now. Wait a minute and retry, or lower AI_RPM_LIMIT in server/.env.",
  model_not_found: "None of the candidate models exist for this key. Set AI_CLASSIFY_MODEL / AI_DRAFT_MODEL to a model shown in https://aistudio.google.com.",
  timeout: "The request timed out. Check your connection, or raise AI_TIMEOUT_MS.",
  connection: "Could not reach the API. Check your network, proxy or firewall.",
  overloaded: "The model is overloaded. Retry in a moment.",
  invalid_output: "The model answered but not in the expected format. Try again; if it repeats, switch AI_CLASSIFY_MODEL to a larger model.",
  refusal: "The model declined the request (safety filter). Try again.",
};

async function main() {
  console.log(`Provider setting: AI_PROVIDER=${env.AI_PROVIDER}, resolved: ${env.AI_ACTIVE_PROVIDER ?? "none"}`);
  const made = createProviderFromEnv(env, log);
  if (!made) {
    line(false, "No API key found. Set GEMINI_API_KEY in server/.env (free key: https://aistudio.google.com/apikey).");
    process.exit(1);
  }
  line(true, `Using ${made.name}: triage model ${env.AI_CLASSIFY_MODEL}, draft model ${env.AI_DRAFT_MODEL}`);

  if (made.name === "gemini" && env.GEMINI_API_KEY) {
    const models = await listAvailableModels(env.GEMINI_API_KEY);
    if (models) {
      const wanted = [env.AI_CLASSIFY_MODEL, env.AI_DRAFT_MODEL];
      for (const m of wanted) line(models.some((x) => x.endsWith(m)), `model "${m}" ${models.some((x) => x.endsWith(m)) ? "is available" : "was not listed for this key (a fallback model will be used)"}`);
    } else {
      console.log("INFO could not list models (the key may be invalid); trying real calls next");
    }
  }

  let failed = false;

  // 1. Triage: structured JSON output through the production prompt and schema.
  try {
    const started = Date.now();
    const result = await made.provider.structured({
      model: env.AI_CLASSIFY_MODEL,
      system: CLASSIFY_SYSTEM,
      user: "<facts>today 2026-10-27; account-level ticket</facts>\n\n<ticket>\nSubject: No royalty for six months\nDescription: I published my book in April and I have not received any royalty payment. This is really frustrating, please help.\n</ticket>",
      maxTokens: CLASSIFY_MAX_TOKENS,
      temperature: 0,
      schema: classificationSchema,
    });
    const v = result.value;
    line(true, `Triage worked in ${Date.now() - started} ms with ${result.model}: ${v.category} / ${v.priority} / ${v.sentiment}${v.escalate ? " / escalate" : ""} (confidence ${v.confidence})`);
    console.log(`     summary: ${v.summary}`);
    console.log(`     next action: ${v.nextAction}`);
    console.log(`     tokens: ${result.usage.inputTokens} in, ${result.usage.outputTokens} out`);
    if (v.category !== "royalty_payments") console.log("WARN expected category royalty_payments for this sample");
  } catch (e) {
    failed = true;
    const err = asAiError(e);
    line(false, `Triage failed (${err.kind}): ${err.message.slice(0, 200)}`);
    console.log(`     ${HINTS[err.kind] ?? "See the message above."}`);
  }

  // 2. Draft: plain text through the draft model.
  try {
    const started = Date.now();
    const result = await made.provider.text({
      model: env.AI_DRAFT_MODEL,
      system: "You write short, warm support replies for BookLeaf Publishing. Use only the facts given. Plain text, under 60 words.",
      user: "Author Priya asks when her pending royalty of ₹3,570 will be paid. Facts: next payout is due by 14 Nov 2026.",
      maxTokens: 300,
      temperature: 0.4,
    });
    line(true, `Draft worked in ${Date.now() - started} ms with ${result.model}`);
    console.log(`     ${result.value.replace(/\n+/g, " ").slice(0, 240)}`);
  } catch (e) {
    failed = true;
    const err = e instanceof AiError ? e : asAiError(e);
    line(false, `Draft failed (${err.kind}): ${err.message.slice(0, 200)}`);
    console.log(`     ${HINTS[err.kind] ?? "See the message above."}`);
  }

  console.log(failed ? "\nSomething needs attention (see above). The app still works without AI, using rules and templates." : "\nAll good. Restart the server so it picks up the key.");
  process.exit(failed ? 1 : 0);
}

await main();
